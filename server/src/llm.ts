/**
 * Claude integration: fraud-indicator extraction from text and screenshots.
 *
 * - Official SDK only (`@anthropic-ai/sdk`), beta Messages endpoint so the request can
 *   opt into server-side refusal fallbacks (`fallbacks: "default"`, beta header
 *   `server-side-fallback-2026-07-01`). `fallbacks` is typed in SDK 1.6.0 as
 *   `BetaFallbacksParam = Array<BetaFallbackParam> | 'default'`, so no type escape is needed.
 * - Structured outputs via a zod schema + `betaZodOutputFormat` and `client.beta.messages.parse`.
 *   The beta parse helper requires the beta format helper (identical JSON schema to
 *   `zodOutputFormat`). No numeric risk score anywhere: the phone's engine scores.
 * - No `thinking` param (Opus 5.5 always thinks; depth is controlled by effort), no
 *   temperature, no assistant prefill.
 * - Prompt caching: the stable system prompt is sent as text blocks with
 *   `cache_control` on the last one.
 * - The client is created lazily and only when ANTHROPIC_API_KEY is set
 *   (`new Anthropic()` does not throw without a key — it would fail at request time).
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { getAnthropicKey, getLlmEffort, getLlmModel, getLlmProvider, isRequestLogEnabled } from './config.js';
import { analyzeImageOpenAI, analyzeTextOpenAI } from './llmOpenAI.js';
import {
  CONTENT_LANGUAGES,
  INDICATOR_TYPES,
  type AiIndicator,
  type AiTextAnalysis,
  type AnalysisContext,
  type ApiErrorCode,
  type UiLanguage,
} from './contract.js';
import { SYSTEM_EXAMPLES, SYSTEM_INSTRUCTIONS } from './prompt.js';

const TEXT_TIMEOUT_MS = 15_000;
const IMAGE_TIMEOUT_MS = 40_000;
const MAX_RETRIES = 1;
const TEXT_MAX_TOKENS = 8_000;
const IMAGE_MAX_TOKENS = 12_000;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const MAX_SUMMARY_CHARS = 200;
const MAX_EVIDENCE_CHARS = 300;
const MAX_RATIONALE_CHARS = 300;
const MAX_INDICATORS = 20;
const MAX_EXTRACTED_TEXT_CHARS = 20_000;

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

// Note: SDK 1.6.0's schema transform moves `enum` into the field description (it is not
// enforced by constrained decoding), and range checks are not sent at all. So confidence has
// no min/max here (we clamp afterwards) and parsing is wrapped with a salvage step below.
const IndicatorSchema = z.object({
  type: z.enum(INDICATOR_TYPES).describe('Exactly one of the indicator type names defined in the system prompt.'),
  evidence: z.string().describe('Shortest verbatim quote copied exactly from the content.'),
  confidence: z.number().describe('Calibrated confidence between 0 and 1.'),
  rationale: z.string().describe('One short sentence in the requested UI language.'),
});

const analysisShape = {
  indicators: z.array(IndicatorSchema),
  language: z.enum(CONTENT_LANGUAGES).describe('Main language of the content.'),
  summary: z.string().describe('One neutral sentence, at most 200 characters, in the requested UI language.'),
  benignContext: z.boolean().describe('True when the content is ordinary or protective communication.'),
};

export const TextAnalysisSchema = z.object(analysisShape);

// extractedText comes first so the transcription is generated before the indicators quote it.
export const ImageAnalysisSchema = z.object({
  extractedText: z
    .string()
    .describe('All visible text in the screenshot, verbatim, in reading order; "" when none is readable.'),
  ...analysisShape,
});

export type ParsedText = z.infer<typeof TextAnalysisSchema>;
export type ParsedImage = z.infer<typeof ImageAnalysisSchema>;

/** Keeps every valid indicator when the model output is mostly but not fully schema-valid. */
export function salvageText(raw: unknown): ParsedText | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const indicators = Array.isArray(r.indicators)
    ? r.indicators.flatMap((item) => {
        const parsed = IndicatorSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  const language = CONTENT_LANGUAGES.find((l) => l === r.language) ?? 'unknown';
  return {
    indicators,
    language,
    summary: typeof r.summary === 'string' ? r.summary : '',
    benignContext: typeof r.benignContext === 'boolean' ? r.benignContext : false,
  };
}

export function salvageImage(raw: unknown): ParsedImage | null {
  const base = salvageText(raw);
  if (!base) return null;
  const extractedText = (raw as Record<string, unknown>).extractedText;
  return { ...base, extractedText: typeof extractedText === 'string' ? extractedText : '' };
}

/**
 * `betaZodOutputFormat` sends the zod-derived JSON schema; its `parse` throws on any
 * mismatch (e.g. one unknown enum value). We keep the strict parse first and fall back
 * to a salvage that drops only the invalid parts, returning null when the text is not JSON
 * (for example a response cut off by max_tokens).
 */
const textFormat = (() => {
  const wire = betaZodOutputFormat(TextAnalysisSchema);
  return {
    ...wire,
    parse(content: string): ParsedText | null {
      try {
        return wire.parse(content);
      } catch {
        try {
          return salvageText(JSON.parse(content));
        } catch {
          return null;
        }
      }
    },
  };
})();

const imageFormat = (() => {
  const wire = betaZodOutputFormat(ImageAnalysisSchema);
  return {
    ...wire,
    parse(content: string): ParsedImage | null {
      try {
        return wire.parse(content);
      } catch {
        try {
          return salvageImage(JSON.parse(content));
        } catch {
          return null;
        }
      }
    },
  };
})();

/* ------------------------------------------------------------------ */
/* Client + shared request pieces                                      */
/* ------------------------------------------------------------------ */

let client: Anthropic | null = null;
let clientKey: string | null = null;

function getClient(): Anthropic | null {
  const key = getAnthropicKey();
  if (!key) return null;
  if (!client || clientKey !== key) {
    client = new Anthropic({ apiKey: key, maxRetries: MAX_RETRIES });
    clientKey = key;
  }
  return client;
}

const SYSTEM_BLOCKS: Anthropic.Beta.BetaTextBlockParam[] = [
  { type: 'text', text: SYSTEM_INSTRUCTIONS },
  { type: 'text', text: SYSTEM_EXAMPLES, cache_control: { type: 'ephemeral' } },
];

/** Keeps the content inside its tag even if it contains a literal closing tag. */
function escapeContent(text: string): string {
  return text.replace(/<\/content\s*>/gi, '</ content>');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, max - 1);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1); // don't split a surrogate pair
  return `${cut}…`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

/** Drops empty evidence, de-duplicates, clamps confidence, truncates free text. */
export function finalize(parsed: ParsedText): AiTextAnalysis {
  const seen = new Set<string>();
  const indicators: AiIndicator[] = [];
  for (const item of parsed.indicators) {
    const evidence = item.evidence.trim();
    if (!evidence) continue;
    const key = `${item.type}\u0000${evidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    indicators.push({
      type: item.type,
      evidence: truncate(evidence, MAX_EVIDENCE_CHARS),
      confidence: clamp01(item.confidence),
      rationale: truncate(item.rationale.trim(), MAX_RATIONALE_CHARS),
    });
    if (indicators.length >= MAX_INDICATORS) break;
  }
  return {
    indicators,
    language: parsed.language,
    summary: truncate(parsed.summary.trim().replace(/\s+/g, ' '), MAX_SUMMARY_CHARS),
    benignContext: parsed.benignContext,
  };
}

function mapError(err: unknown, label: string): ApiErrorCode {
  let code: ApiErrorCode;
  if (err instanceof Anthropic.APIConnectionTimeoutError) code = 'TIMEOUT';
  else if (err instanceof Anthropic.RequestTimeoutError || err instanceof Anthropic.GatewayTimeoutError) code = 'TIMEOUT';
  else if (err instanceof Anthropic.RateLimitError) code = 'RATE_LIMITED';
  else code = 'PROVIDER_ERROR'; // AuthenticationError, other APIError subclasses, connection errors, parse errors
  // Log the class + status only — never the prompt, content or provider message body.
  const status = err instanceof Anthropic.APIError && err.status !== undefined ? ` ${err.status}` : '';
  const name = err instanceof Error ? err.constructor.name : typeof err;
  console.warn(`[llm] ${label} failed: ${code} (${name}${status})`);
  return code;
}

function logUsage(label: string, message: Anthropic.Beta.BetaMessage, startedAt: number): void {
  if (!isRequestLogEnabled()) return;
  const u = message.usage;
  console.log(
    `[llm] ${label} model=${message.model} stop=${message.stop_reason ?? 'null'} in=${u.input_tokens} ` +
      `cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} ` +
      `out=${u.output_tokens} ${Math.round(performance.now() - startedAt)}ms`,
  );
}

export type LlmResult<T> =
  | { ok: true; value: T; model: string }
  | { ok: false; error: ApiErrorCode; model: string | null };

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function analyzeText(
  text: string,
  uiLanguage: UiLanguage,
  context: AnalysisContext,
): Promise<LlmResult<AiTextAnalysis>> {
  if (getLlmProvider() === 'openai') return analyzeTextOpenAI(text, uiLanguage, context);
  const anthropic = getClient();
  if (!anthropic) return { ok: false, error: 'AI_NOT_CONFIGURED', model: null };
  const startedAt = performance.now();
  try {
    const message = await anthropic.beta.messages.parse(
      {
        model: getLlmModel(),
        max_tokens: TEXT_MAX_TOKENS,
        system: SYSTEM_BLOCKS,
        messages: [
          {
            role: 'user',
            content: `UI language: ${uiLanguage}\n<content context="${context}">\n${escapeContent(text)}\n</content>`,
          },
        ],
        output_config: { effort: getLlmEffort(), format: textFormat },
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
      },
      { timeout: TEXT_TIMEOUT_MS, maxRetries: MAX_RETRIES },
    );
    logUsage('text', message, startedAt);
    if (message.stop_reason === 'refusal') {
      console.warn(`[llm] text refused (category=${message.stop_details?.category ?? 'null'})`);
      return { ok: false, error: 'AI_REFUSED', model: message.model };
    }
    if (!message.parsed_output) {
      console.warn(`[llm] text: no parseable structured output (stop=${message.stop_reason ?? 'null'})`);
      return { ok: false, error: 'PROVIDER_ERROR', model: message.model };
    }
    return { ok: true, value: finalize(message.parsed_output), model: message.model };
  } catch (err) {
    return { ok: false, error: mapError(err, 'text'), model: null };
  }
}

export async function analyzeImage(
  imageBase64: string,
  mediaType: ImageMediaType,
  uiLanguage: UiLanguage,
): Promise<LlmResult<{ extractedText: string; analysis: AiTextAnalysis }>> {
  if (getLlmProvider() === 'openai') return analyzeImageOpenAI(imageBase64, mediaType, uiLanguage);
  const anthropic = getClient();
  if (!anthropic) return { ok: false, error: 'AI_NOT_CONFIGURED', model: null };
  const startedAt = performance.now();
  try {
    const message = await anthropic.beta.messages.parse(
      {
        model: getLlmModel(),
        max_tokens: IMAGE_MAX_TOKENS,
        system: SYSTEM_BLOCKS,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
              {
                type: 'text',
                text: `UI language: ${uiLanguage}\nThe content is the screenshot above (context="screen"). Follow the screenshot rules: fill extractedText first, then quote evidence only from extractedText.`,
              },
            ],
          },
        ],
        output_config: { effort: getLlmEffort(), format: imageFormat },
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
      },
      { timeout: IMAGE_TIMEOUT_MS, maxRetries: MAX_RETRIES },
    );
    logUsage('image', message, startedAt);
    if (message.stop_reason === 'refusal') {
      console.warn(`[llm] image refused (category=${message.stop_details?.category ?? 'null'})`);
      return { ok: false, error: 'AI_REFUSED', model: message.model };
    }
    const parsed = message.parsed_output;
    if (!parsed) {
      console.warn(`[llm] image: no parseable structured output (stop=${message.stop_reason ?? 'null'})`);
      return { ok: false, error: 'PROVIDER_ERROR', model: message.model };
    }
    return {
      ok: true,
      value: {
        extractedText: parsed.extractedText.slice(0, MAX_EXTRACTED_TEXT_CHARS),
        analysis: finalize(parsed),
      },
      model: message.model,
    };
  } catch (err) {
    return { ok: false, error: mapError(err, 'image'), model: null };
  }
}
