/**
 * OpenAI alternative for the AI indicator extraction (used when only OPENAI_API_KEY
 * is configured). Same prompt, same output contract and the same post-processing as
 * the Claude path in llm.ts, so the app cannot tell the difference.
 *
 * - Chat Completions with `response_format: { type: "json_schema", strict: true }`.
 * - Vision via a base64 data URL for screenshots.
 * - No numeric risk score anywhere: the phone's deterministic engine scores.
 */
import { getLlmModel, getOpenAiKey, isRequestLogEnabled } from './config.js';
import { CONTENT_LANGUAGES, INDICATOR_TYPES, type AiTextAnalysis, type AnalysisContext, type ApiErrorCode, type UiLanguage } from './contract.js';
import { finalize, salvageImage, salvageText, type ImageMediaType, type LlmResult } from './llm.js';
import { SYSTEM_EXAMPLES, SYSTEM_INSTRUCTIONS } from './prompt.js';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const TEXT_TIMEOUT_MS = 15_000;
const IMAGE_TIMEOUT_MS = 40_000;
const MAX_EXTRACTED_TEXT_CHARS = 20_000;

const INDICATOR_JSON = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'evidence', 'confidence', 'rationale'],
  properties: {
    type: { type: 'string', enum: [...INDICATOR_TYPES] },
    evidence: { type: 'string', description: 'Shortest verbatim quote copied exactly from the content.' },
    confidence: { type: 'number', description: 'Calibrated confidence between 0 and 1.' },
    rationale: { type: 'string', description: 'One short sentence in the requested UI language.' },
  },
} as const;

const ANALYSIS_PROPERTIES = {
  indicators: { type: 'array', items: INDICATOR_JSON },
  language: { type: 'string', enum: [...CONTENT_LANGUAGES] },
  summary: { type: 'string', description: 'One neutral sentence, at most 200 characters, in the requested UI language.' },
  benignContext: { type: 'boolean', description: 'True when the content is ordinary or protective communication.' },
} as const;

const TEXT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['indicators', 'language', 'summary', 'benignContext'],
  properties: ANALYSIS_PROPERTIES,
} as const;

const IMAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['extractedText', 'indicators', 'language', 'summary', 'benignContext'],
  properties: {
    extractedText: {
      type: 'string',
      description: 'All visible text in the screenshot, verbatim, in reading order; "" when none is readable.',
    },
    ...ANALYSIS_PROPERTIES,
  },
} as const;

const SYSTEM_PROMPT = `${SYSTEM_INSTRUCTIONS}\n\n${SYSTEM_EXAMPLES}`;

type ChatContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

interface ChatOutcome {
  ok: boolean;
  content: string | null;
  model: string | null;
  error?: ApiErrorCode;
}

function escapeContent(text: string): string {
  return text.replace(/<\/content>/gi, '</ content>');
}

async function chat(userContent: ChatContent, schemaName: string, schema: object, timeoutMs: number, label: string): Promise<ChatOutcome> {
  const key = getOpenAiKey();
  if (!key) return { ok: false, content: null, model: null, error: 'AI_NOT_CONFIGURED' };
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getLlmModel(),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
        max_completion_tokens: 4_000,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    const code: ApiErrorCode = name === 'TimeoutError' || name === 'AbortError' ? 'TIMEOUT' : 'PROVIDER_ERROR';
    console.warn(`[llm:openai] ${label} failed: ${code} (${name || 'network'})`);
    return { ok: false, content: null, model: null, error: code };
  }
  if (!response.ok) {
    const code: ApiErrorCode = response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR';
    console.warn(`[llm:openai] ${label} failed: ${code} (HTTP ${response.status})`);
    return { ok: false, content: null, model: null, error: code };
  }
  const body = (await response.json()) as {
    model?: string;
    choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = body.choices?.[0];
  if (isRequestLogEnabled()) {
    console.log(
      `[llm:openai] ${label} model=${body.model ?? '?'} finish=${choice?.finish_reason ?? '?'} in=${body.usage?.prompt_tokens ?? 0} ` +
        `out=${body.usage?.completion_tokens ?? 0} ${Math.round(performance.now() - started)}ms`,
    );
  }
  if (choice?.message?.refusal) return { ok: false, content: null, model: body.model ?? null, error: 'AI_REFUSED' };
  return { ok: true, content: choice?.message?.content ?? null, model: body.model ?? null };
}

export async function analyzeTextOpenAI(
  text: string,
  uiLanguage: UiLanguage,
  context: AnalysisContext,
): Promise<LlmResult<AiTextAnalysis>> {
  const res = await chat(
    `UI language: ${uiLanguage}\n<content context="${context}">\n${escapeContent(text)}\n</content>`,
    'dacy_text_analysis',
    TEXT_SCHEMA,
    TEXT_TIMEOUT_MS,
    'text',
  );
  if (!res.ok || !res.content) return { ok: false, error: res.error ?? 'PROVIDER_ERROR', model: res.model };
  let parsed;
  try {
    parsed = salvageText(JSON.parse(res.content));
  } catch {
    parsed = null;
  }
  if (!parsed) return { ok: false, error: 'PROVIDER_ERROR', model: res.model };
  return { ok: true, value: finalize(parsed), model: res.model ?? getLlmModel() };
}

export async function analyzeImageOpenAI(
  imageBase64: string,
  mediaType: ImageMediaType,
  uiLanguage: UiLanguage,
): Promise<LlmResult<{ extractedText: string; analysis: AiTextAnalysis }>> {
  const res = await chat(
    [
      { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
      {
        type: 'text',
        text: `UI language: ${uiLanguage}\nThe content is the screenshot above (context="screen"). Follow the screenshot rules: fill extractedText first, then quote evidence only from extractedText.`,
      },
    ],
    'dacy_image_analysis',
    IMAGE_SCHEMA,
    IMAGE_TIMEOUT_MS,
    'image',
  );
  if (!res.ok || !res.content) return { ok: false, error: res.error ?? 'PROVIDER_ERROR', model: res.model };
  let parsed;
  try {
    parsed = salvageImage(JSON.parse(res.content));
  } catch {
    parsed = null;
  }
  if (!parsed) return { ok: false, error: 'PROVIDER_ERROR', model: res.model };
  return {
    ok: true,
    value: { extractedText: parsed.extractedText.slice(0, MAX_EXTRACTED_TEXT_CHARS), analysis: finalize(parsed) },
    model: res.model ?? getLlmModel(),
  };
}
