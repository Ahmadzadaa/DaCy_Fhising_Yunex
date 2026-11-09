/**
 * Hybrid inference router.
 *
 * Three explicit, switchable execution modes (badged in the UI):
 *  - ON_DEVICE            local LLM runtime (llama.cpp / Core ML). Needs a native
 *                         development build — never available inside Expo Go, so
 *                         the router reports it honestly and falls back.
 *  - CLOUD_API            DaCy server → Claude extracts indicators (and reads
 *                         screenshots); speech-to-text for audio.
 *  - DETERMINISTIC_ENGINE offline rule engine on the phone. Always available, so a
 *                         live demo never fails.
 *
 * In every mode the FINAL 0–100 score comes from the deterministic risk engine.
 * The AI only contributes indicators with verbatim evidence.
 */
import { NativeModules, Platform } from 'react-native';

import {
  analyzeImageRemote,
  analyzeTextRemote,
  inspectUrlRemote,
  transcribeRemote,
  type ApiResult,
  type ClientErrorCode,
  type UploadFile,
} from '@/services/api/client';
import type { AnalysisContext, HealthResponse } from '@/services/api/contract';
import { assessRisk, type AssessContext } from '@/services/security/riskEngine';
import { detectLanguage } from '@/services/security/textNormalize';
import { analyzeUrlsInText, mergeInspection } from '@/services/security/urlAnalyzer';
import { createId } from '@/utils/id';
import type {
  AiIndicator,
  AiTextAnalysis,
  AnalysisRun,
  ContentLanguage,
  FallbackReason,
  InferenceMode,
  Localized,
  ScanSource,
  SpeechLanguage,
  TextScanResult,
  UiLanguage,
  UrlReport,
  VoiceAuthenticity,
  VoiceScanResult,
} from '@/types/security';

/** Everything the router needs to decide where to run. */
export interface ProviderContext {
  baseUrl: string;
  online: boolean;
  health: HealthResponse | null;
  requestedMode: InferenceMode;
  uiLanguage: UiLanguage;
  speechLanguage: SpeechLanguage;
  /** User setting: let the server open links in its isolated fetcher. */
  serverLinkInspection: boolean;
}

export interface ModeAvailability {
  mode: InferenceMode;
  available: boolean;
  reason: Localized;
}

export const VOICE_AUTHENTICITY: VoiceAuthenticity = {
  status: 'MODEL_PENDING',
  note: {
    en: 'Experimental module. No anti-spoofing model has been validated on Azerbaijani phone speech yet, so no authenticity score is shown.',
    az: 'Eksperimental modul. Azərbaycan dilində telefon nitqi üzərində hələ yoxlanılmış anti-spoofing modeli yoxdur, ona görə həqiqilik balı göstərilmir.',
  },
};

const MAX_INSPECTED_URLS = 3;

/* ------------------------------------------------------------------ */
/* Capability detection                                                */
/* ------------------------------------------------------------------ */

/**
 * The on-device runtime would be the `llama.rn` native module (llama.cpp) with a
 * quantised Qwen3 GGUF model, or a Core ML model. Expo Go cannot load custom
 * native modules, so this is only true in a development build that bundles it.
 */
export function isOnDeviceRuntimeAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  const modules = NativeModules as Record<string, unknown>;
  return Boolean(modules.RNLlama);
}

export function getModeAvailability(ctx: Pick<ProviderContext, 'online' | 'health'>): ModeAvailability[] {
  const llm = ctx.online && !!ctx.health?.capabilities.llm;
  return [
    {
      mode: 'CLOUD_API',
      available: llm,
      reason: !ctx.online
        ? { en: 'DaCy server is offline.', az: 'DaCy serveri əlçatan deyil.' }
        : !ctx.health?.capabilities.llm
          ? { en: 'Server is online but has no AI key configured.', az: 'Server işləyir, amma AI açarı qurulmayıb.' }
          : {
              en: `Ready · ${ctx.health.capabilities.llmModel ?? 'Claude'}`,
              az: `Hazırdır · ${ctx.health.capabilities.llmModel ?? 'Claude'}`,
            },
    },
    {
      mode: 'ON_DEVICE',
      available: isOnDeviceRuntimeAvailable(),
      reason: isOnDeviceRuntimeAvailable()
        ? { en: 'Native LLM runtime detected.', az: 'Native LLM mühiti tapıldı.' }
        : {
            en: 'Needs a native development build (llama.cpp / Core ML). Not available in Expo Go.',
            az: 'Native development build tələb edir (llama.cpp / Core ML). Expo Go-da mövcud deyil.',
          },
    },
    {
      mode: 'DETERMINISTIC_ENGINE',
      available: true,
      reason: { en: 'Always available, works offline.', az: 'Həmişə işləyir, internet tələb etmir.' },
    },
  ];
}

interface Resolution {
  mode: InferenceMode;
  fallbackReason?: FallbackReason;
}

/** Decides which mode actually runs for an LLM-backed analysis. */
export function resolveMode(ctx: ProviderContext): Resolution {
  if (ctx.requestedMode === 'DETERMINISTIC_ENGINE') return { mode: 'DETERMINISTIC_ENGINE' };
  if (ctx.requestedMode === 'ON_DEVICE') {
    // No on-device inference integration ships in this build, even if the module exists.
    return { mode: 'DETERMINISTIC_ENGINE', fallbackReason: 'ON_DEVICE_UNAVAILABLE' };
  }
  if (!ctx.online) return { mode: 'DETERMINISTIC_ENGINE', fallbackReason: 'SERVER_UNREACHABLE' };
  if (!ctx.health?.capabilities.llm) return { mode: 'DETERMINISTIC_ENGINE', fallbackReason: 'AI_NOT_CONFIGURED' };
  return { mode: 'CLOUD_API' };
}

function fallbackFromClient(code: ClientErrorCode): FallbackReason {
  switch (code) {
    case 'NETWORK':
      return 'SERVER_UNREACHABLE';
    case 'CLIENT_TIMEOUT':
    case 'TIMEOUT':
      return 'AI_TIMEOUT';
    case 'AI_NOT_CONFIGURED':
      return 'AI_NOT_CONFIGURED';
    case 'AI_REFUSED':
      return 'AI_REFUSED';
    default:
      return 'AI_ERROR';
  }
}

function canInspectLinks(ctx: ProviderContext): boolean {
  return ctx.online && ctx.serverLinkInspection && ctx.requestedMode !== 'DETERMINISTIC_ENGINE';
}

async function inspectReports(ctx: ProviderContext, reports: UrlReport[]): Promise<UrlReport[]> {
  if (!canInspectLinks(ctx) || !reports.length) return reports;
  const targets = reports.slice(0, MAX_INSPECTED_URLS);
  const inspected = await Promise.all(
    targets.map(async (report) => {
      const res = await inspectUrlRemote(ctx.baseUrl, report.normalized);
      return res.ok ? mergeInspection(report, res.data.inspection) : report;
    }),
  );
  return [...inspected, ...reports.slice(MAX_INSPECTED_URLS)];
}

function toAssessContext(context: AnalysisContext): AssessContext {
  return context === 'call_transcript' ? 'call' : context === 'screen' ? 'screen' : 'message';
}

function pickLanguage(text: string, ai: AiTextAnalysis | null): ContentLanguage {
  const local = detectLanguage(text);
  if (ai && ai.language !== 'unknown' && local === 'unknown') return ai.language;
  return local;
}

/* ------------------------------------------------------------------ */
/* Core: score a piece of text                                         */
/* ------------------------------------------------------------------ */

interface CoreTextOutcome {
  urls: UrlReport[];
  ai: AiTextAnalysis | null;
  run: Omit<AnalysisRun, 'latencyMs'>;
  aiIndicators: AiIndicator[] | null;
}

async function analyzeTextCore(text: string, context: AnalysisContext, ctx: ProviderContext): Promise<CoreTextOutcome> {
  const resolution = resolveMode(ctx);
  const localUrls = analyzeUrlsInText(text);

  const aiPromise: Promise<ApiResult<{ ai: AiTextAnalysis | null; aiError: string | null; model: string | null }>> | null =
    resolution.mode === 'CLOUD_API'
      ? analyzeTextRemote(ctx.baseUrl, { text, uiLanguage: ctx.uiLanguage, context, inspectUrls: false })
      : null;

  const [aiResult, urls] = await Promise.all([aiPromise, inspectReports(ctx, localUrls)]);

  let modeUsed: InferenceMode = resolution.mode;
  let fallbackReason = resolution.fallbackReason;
  let ai: AiTextAnalysis | null = null;
  let aiModel: string | undefined;

  if (aiResult) {
    if (aiResult.ok && aiResult.data.ai) {
      ai = aiResult.data.ai;
      aiModel = aiResult.data.model ?? undefined;
    } else {
      modeUsed = 'DETERMINISTIC_ENGINE';
      fallbackReason = aiResult.ok
        ? fallbackFromClient((aiResult.data.aiError as ClientErrorCode | null) ?? 'PROVIDER_ERROR')
        : fallbackFromClient(aiResult.code);
    }
  }

  return {
    urls,
    ai,
    aiIndicators: ai ? ai.indicators : null,
    run: {
      modeRequested: ctx.requestedMode,
      modeUsed,
      fallbackReason,
      aiModel,
      aiSummary: ai?.summary || undefined,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export type ProviderFailure =
  | 'VISION_UNAVAILABLE'
  | 'STT_UNAVAILABLE'
  | 'TRANSCRIPTION_FAILED'
  | 'EMPTY_TRANSCRIPT'
  | 'IMAGE_UNREADABLE'
  | 'ANALYSIS_FAILED';

export type ProviderOutcome<T> = { ok: true; result: T } | { ok: false; failure: ProviderFailure; message: Localized };

export const FAILURE_MESSAGE: Record<ProviderFailure, Localized> = {
  VISION_UNAVAILABLE: {
    en: 'Reading screenshots needs the DaCy server with AI enabled. Paste the text instead, or use the Screen Scan shortcut (it reads text on the phone).',
    az: 'Ekran şəklini oxumaq üçün AI qoşulmuş DaCy serveri lazımdır. Mətni yapışdırın və ya Ekran Skanı qısayolundan istifadə edin (o, mətni telefonda oxuyur).',
  },
  STT_UNAVAILABLE: {
    en: 'Speech-to-text is not available (server offline or no STT key). Check the DaCy server in Settings.',
    az: 'Nitqin mətnə çevrilməsi mümkün deyil (server əlçatan deyil və ya STT açarı yoxdur). Ayarlarda DaCy serverini yoxlayın.',
  },
  TRANSCRIPTION_FAILED: {
    en: 'The audio could not be transcribed. Please try again.',
    az: 'Səsi mətnə çevirmək alınmadı. Yenidən cəhd edin.',
  },
  EMPTY_TRANSCRIPT: {
    en: 'No speech was recognised in this audio.',
    az: 'Bu səsdə nitq tanınmadı.',
  },
  IMAGE_UNREADABLE: {
    en: 'No readable text was found in the image.',
    az: 'Şəkildə oxunaqlı mətn tapılmadı.',
  },
  ANALYSIS_FAILED: {
    en: 'The analysis failed. Please try again.',
    az: 'Analiz alınmadı. Yenidən cəhd edin.',
  },
};

function fail<T>(failure: ProviderFailure): ProviderOutcome<T> {
  return { ok: false, failure, message: FAILURE_MESSAGE[failure] };
}

/** Text / screen-scan analysis. Never fails: falls back to the deterministic engine. */
export async function runTextAnalysis(params: {
  text: string;
  source: ScanSource;
  context?: AnalysisContext;
  ctx: ProviderContext;
}): Promise<TextScanResult> {
  const started = Date.now();
  const text = params.text.trim();
  const context = params.context ?? (params.source === 'shortcut' ? 'screen' : 'message');
  const core = await analyzeTextCore(text, context, params.ctx);
  const assessment = assessRisk({
    text,
    context: toAssessContext(context),
    aiIndicators: core.aiIndicators,
    urlReports: core.urls,
    aiBenignContext: core.ai?.benignContext,
  });
  return {
    id: createId('t_'),
    kind: 'text',
    createdAt: new Date().toISOString(),
    source: params.source,
    text,
    language: pickLanguage(text, core.ai),
    urls: core.urls,
    assessment,
    run: { ...core.run, latencyMs: Date.now() - started },
  };
}

/** Screenshot analysis: the server reads the image (Claude vision), the phone scores it. */
export async function runScreenshotAnalysis(params: { image: UploadFile; ctx: ProviderContext }): Promise<ProviderOutcome<TextScanResult>> {
  const { ctx } = params;
  const started = Date.now();
  if (!ctx.online || !ctx.health?.capabilities.vision || ctx.requestedMode === 'DETERMINISTIC_ENGINE') {
    return fail('VISION_UNAVAILABLE');
  }
  const res = await analyzeImageRemote(ctx.baseUrl, params.image, ctx.uiLanguage, false);
  if (!res.ok) return fail(res.code === 'AI_NOT_CONFIGURED' ? 'VISION_UNAVAILABLE' : 'ANALYSIS_FAILED');
  const text = res.data.extractedText.trim();
  if (!text) return fail('IMAGE_UNREADABLE');

  const urls = await inspectReports(ctx, analyzeUrlsInText(text));
  const ai = res.data.ai;
  const assessment = assessRisk({
    text,
    context: 'screen',
    aiIndicators: ai ? ai.indicators : null,
    urlReports: urls,
    aiBenignContext: ai?.benignContext,
  });
  return {
    ok: true,
    result: {
      id: createId('t_'),
      kind: 'text',
      createdAt: new Date().toISOString(),
      source: 'screenshot',
      text,
      language: pickLanguage(text, ai),
      urls,
      assessment,
      run: {
        modeRequested: ctx.requestedMode,
        modeUsed: ai ? 'CLOUD_API' : 'DETERMINISTIC_ENGINE',
        fallbackReason: ai ? undefined : fallbackFromClient((res.data.aiError as ClientErrorCode | null) ?? 'PROVIDER_ERROR'),
        aiModel: res.data.model ?? undefined,
        aiSummary: ai?.summary || undefined,
        latencyMs: Date.now() - started,
      },
    },
  };
}

/**
 * Voice Lab analysis of a recording/file (speech-to-text on the server).
 * Returns two separate evaluations: conversation
 * risk (scored) and voice authenticity (honest "model pending").
 */
export async function runVoiceAnalysis(params: {
  audio: UploadFile;
  durationMs: number;
  source: ScanSource;
  ctx: ProviderContext;
}): Promise<ProviderOutcome<VoiceScanResult>> {
  const { ctx } = params;
  const started = Date.now();
  if (!ctx.online || !ctx.health?.capabilities.stt) return fail('STT_UNAVAILABLE');
  const res = await transcribeRemote(ctx.baseUrl, params.audio, ctx.speechLanguage);
  if (!res.ok) return fail(res.code === 'STT_NOT_CONFIGURED' ? 'STT_UNAVAILABLE' : 'TRANSCRIPTION_FAILED');
  const transcript = res.data.text.trim();
  const sttProvider = `${res.data.provider} · ${res.data.model}`;
  if (!transcript) return fail('EMPTY_TRANSCRIPT');

  const core = await analyzeTextCore(transcript, 'call_transcript', ctx);
  const assessment = assessRisk({
    text: transcript,
    context: 'call',
    aiIndicators: core.aiIndicators,
    urlReports: core.urls,
    aiBenignContext: core.ai?.benignContext,
  });
  return {
    ok: true,
    result: {
      id: createId('v_'),
      kind: 'voice',
      createdAt: new Date().toISOString(),
      source: params.source,
      durationMs: params.durationMs,
      transcript,
      transcriptLanguage: pickLanguage(transcript, core.ai),
      sttProvider,
      assessment,
      run: { ...core.run, latencyMs: Date.now() - started },
      authenticity: VOICE_AUTHENTICITY,
    },
  };
}
