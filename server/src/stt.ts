/**
 * Speech-to-text proxy for OpenAI-compatible `/audio/transcriptions` endpoints
 * (OpenAI or Groq). Audio is forwarded in memory and never stored or logged.
 */
import { getSttConfig, type SttConfig } from './config.js';
import type { SpeechLanguage } from './contract.js';
import { ApiError } from './errors.js';

const STT_TIMEOUT_MS = 15_000;
/** Below this size an upload cannot hold meaningful speech (container headers only). */
const MIN_AUDIO_BYTES = 1024;

/*
 * No vocabulary `prompt` is sent on purpose. A fraud-word hint ("CVV, card,
 * SMS code…") is echoed back verbatim by the speech model on silence or
 * background noise, which invents the exact evidence DaCy looks for and raises
 * false alarms on harmless calls. Transcripts must contain only what was said.
 */

/** Phrases speech models are known to produce on silence / noise; never real call content. */
const SILENCE_ARTIFACTS = [
  /^(thank you|thanks)( (so|very) much)?( for watching)?[.!]?$/i,
  /^(please )?subscribe[.!]?$/i,
  /^subtitles? (by|provided by)\b/i,
  /^altyaz[ıi]\b/i,
  /^продолжение следует/i,
  /^\.*$/,
];

/** Drops whole-transcript silence artifacts so they are never scored. */
export function cleanTranscript(text: string): string {
  const t = text.trim();
  return SILENCE_ARTIFACTS.some((re) => re.test(t)) ? '' : t;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/aac': 'm4a',
  'video/mp4': 'mp4',
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};

const KNOWN_EXTENSIONS = new Set(['m4a', 'mp4', 'webm', 'wav', 'mp3', 'mpeg', 'mpga', 'ogg', 'oga', 'flac']);

/** Keeps the original name when it has a known audio extension, otherwise derives one from the MIME type. */
function uploadName(file: File): string {
  const name = (file.name || '').split(/[\\/]/).pop() ?? '';
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined;
  if (ext && KNOWN_EXTENSIONS.has(ext)) return name;
  const mime = (file.type || '').split(';')[0]?.trim().toLowerCase() ?? '';
  return `audio.${EXTENSION_BY_MIME[mime] ?? 'm4a'}`;
}

export interface Transcript {
  text: string;
  language: string | null;
  provider: string;
  model: string;
}

export function requireStt(): SttConfig {
  const config = getSttConfig();
  if (!config) {
    throw new ApiError('STT_NOT_CONFIGURED', 'Speech-to-text is not configured (set OPENAI_API_KEY or GROQ_API_KEY)');
  }
  return config;
}

export async function transcribe(file: File, language: SpeechLanguage, config: SttConfig): Promise<Transcript> {
  const base = { provider: config.provider, model: config.model };
  const lang = language === 'en' || language === 'az' ? language : null;
  if (file.size < MIN_AUDIO_BYTES) return { ...base, text: '', language: lang };

  const name = uploadName(file);
  const form = new FormData();
  form.append('file', new File([await file.arrayBuffer()], name, { type: file.type || 'application/octet-stream' }));
  form.append('model', config.model);
  form.append('response_format', 'json');
  if (lang) form.append('language', lang);

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(STT_TIMEOUT_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ApiError('TIMEOUT', `Speech-to-text (${config.provider}) timed out`);
    }
    throw new ApiError('PROVIDER_ERROR', `Speech-to-text provider ${config.provider} is unreachable`);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: { message?: unknown } };
      if (typeof body.error?.message === 'string') detail = `: ${body.error.message.slice(0, 160)}`;
    } catch {
      // non-JSON error body
    }
    if (res.status === 429) {
      throw new ApiError('RATE_LIMITED', `Speech-to-text provider ${config.provider} rate-limited the request`);
    }
    throw new ApiError('PROVIDER_ERROR', `Speech-to-text provider ${config.provider} returned HTTP ${res.status}${detail}`);
  }

  let text = '';
  try {
    const body = (await res.json()) as { text?: unknown; language?: unknown };
    text = typeof body.text === 'string' ? cleanTranscript(body.text) : '';
    const detected = typeof body.language === 'string' ? body.language : null;
    return { ...base, text, language: lang ?? detected };
  } catch {
    throw new ApiError('PROVIDER_ERROR', `Speech-to-text provider ${config.provider} returned an unreadable response`);
  }
}
