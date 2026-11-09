/**
 * Runtime configuration. Every getter reads process.env at call time so tests
 * (and a late-loaded .env) can change capabilities without re-importing modules.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the server package root (the folder holding package.json). */
export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SERVER_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(path.join(SERVER_ROOT, 'package.json'), 'utf8')) as {
      version?: unknown;
    };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = env(name);
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function getPort(): number {
  return envInt('PORT', 8787, 1, 65535);
}

/* ---------------- Claude (indicator extraction + vision) ---------------- */

export const DEFAULT_LLM_MODEL = 'claude-opus-5-5';

export type LlmEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const EFFORTS: readonly LlmEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export function getAnthropicKey(): string | undefined {
  return env('ANTHROPIC_API_KEY');
}

export type LlmProvider = 'anthropic' | 'openai';

/** Default OpenAI model used when only OPENAI_API_KEY is set (vision + structured outputs). */
export const DEFAULT_OPENAI_LLM_MODEL = 'gpt-4.1-mini';

/** Claude when ANTHROPIC_API_KEY is set, otherwise OpenAI when OPENAI_API_KEY is set. */
export function getLlmProvider(): LlmProvider | null {
  if (getAnthropicKey() !== undefined) return 'anthropic';
  if (env('OPENAI_API_KEY') !== undefined) return 'openai';
  return null;
}

export function getOpenAiKey(): string | undefined {
  return env('OPENAI_API_KEY');
}

export function isLlmConfigured(): boolean {
  return getLlmProvider() !== null;
}

export function getLlmModel(): string {
  if (getLlmProvider() === 'openai') return env('OPENAI_LLM_MODEL') ?? DEFAULT_OPENAI_LLM_MODEL;
  return env('DACY_LLM_MODEL') ?? DEFAULT_LLM_MODEL;
}

export function getLlmEffort(): LlmEffort {
  const raw = (process.env.DACY_LLM_EFFORT ?? 'low').trim().toLowerCase();
  return (EFFORTS as readonly string[]).includes(raw) ? (raw as LlmEffort) : 'low';
}

/* ---------------- Speech-to-text ---------------- */

export type SttProvider = 'openai' | 'groq';

export interface SttConfig {
  provider: SttProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

const STT_BASE_URLS: Record<SttProvider, string> = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
};

const STT_DEFAULT_MODELS: Record<SttProvider, string> = {
  openai: 'gpt-4o-mini-transcribe',
  groq: 'whisper-large-v3-turbo',
};

/** Null when no speech-to-text provider has a key. */
export function getSttConfig(): SttConfig | null {
  const explicit = env('STT_PROVIDER')?.toLowerCase();
  let provider: SttProvider | null = null;
  if (explicit === 'openai' || explicit === 'groq') {
    provider = explicit;
  } else if (env('OPENAI_API_KEY')) {
    provider = 'openai';
  } else if (env('GROQ_API_KEY')) {
    provider = 'groq';
  }
  if (!provider) return null;
  const apiKey = provider === 'openai' ? env('OPENAI_API_KEY') : env('GROQ_API_KEY');
  if (!apiKey) return null;
  return {
    provider,
    apiKey,
    baseUrl: STT_BASE_URLS[provider],
    model: env('STT_MODEL') ?? STT_DEFAULT_MODELS[provider],
  };
}

/* ---------------- Text-to-speech (OpenAI) ---------------- */

export interface TtsConfig {
  apiKey: string;
  model: string;
  voice: string;
}

export function getTtsConfig(): TtsConfig | null {
  const apiKey = env('OPENAI_API_KEY');
  if (!apiKey) return null;
  return {
    apiKey,
    model: env('TTS_MODEL') ?? 'gpt-4o-mini-tts',
    voice: env('TTS_VOICE') ?? 'alloy',
  };
}

/* ---------------- Misc ---------------- */

export function getRateLimitPerMinute(): number {
  return envInt('RATE_LIMIT_PER_MIN', 120, 1, 100_000);
}

export function getDataDir(): string {
  return env('DACY_DATA_DIR') ?? path.join(SERVER_ROOT, 'data');
}

export function isRequestLogEnabled(): boolean {
  return env('DACY_LOG_REQUESTS') !== '0';
}
