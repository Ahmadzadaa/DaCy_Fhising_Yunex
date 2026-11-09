/**
 * Text-to-speech for the spoken call warnings, via OpenAI `/v1/audio/speech` (mp3).
 * Results are cached in memory (warnings repeat a lot), max 50 entries.
 */
import { getTtsConfig, type TtsConfig } from './config.js';
import type { UiLanguage } from './contract.js';
import { ApiError } from './errors.js';

const TTS_TIMEOUT_MS = 15_000;
const CACHE_MAX = 50;
export const TTS_MAX_CHARS = 300;

const INSTRUCTIONS: Record<UiLanguage, string> = {
  en: 'Speak clear, natural English in a calm but firm, protective tone, like a safety assistant warning someone about a possible scam.',
  az: 'Aydın və təbii Azərbaycan dilində danış. Sakit, lakin qətiyyətli, qoruyucu tonla, fırıldaqçılıq barədə xəbərdarlıq edən təhlükəsizlik köməkçisi kimi.',
};

const cache = new Map<string, Uint8Array>();

function cacheGet(key: string): Uint8Array | undefined {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key); // refresh LRU position
    cache.set(key, hit);
  }
  return hit;
}

function cachePut(key: string, audio: Uint8Array): void {
  cache.set(key, audio);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function requireTts(): TtsConfig {
  const config = getTtsConfig();
  if (!config) throw new ApiError('TTS_NOT_CONFIGURED', 'Text-to-speech is not configured (set OPENAI_API_KEY)');
  return config;
}

export async function synthesize(text: string, language: UiLanguage, config: TtsConfig): Promise<Uint8Array> {
  const key = `${language}\u0000${config.model}\u0000${config.voice}\u0000${text}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const body: Record<string, string> = {
    model: config.model,
    voice: config.voice,
    input: text,
    response_format: 'mp3',
  };
  // Only the gpt-4o TTS family accepts style instructions (tts-1 / tts-1-hd reject them).
  if (config.model.startsWith('gpt-4o')) body.instructions = INSTRUCTIONS[language];

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') throw new ApiError('TIMEOUT', 'Text-to-speech timed out');
    throw new ApiError('PROVIDER_ERROR', 'Text-to-speech provider is unreachable');
  }
  if (!res.ok) {
    if (res.status === 429) throw new ApiError('RATE_LIMITED', 'Text-to-speech provider rate-limited the request');
    throw new ApiError('PROVIDER_ERROR', `Text-to-speech provider returned HTTP ${res.status}`);
  }
  const audio = new Uint8Array(await res.arrayBuffer());
  if (audio.byteLength === 0) throw new ApiError('PROVIDER_ERROR', 'Text-to-speech provider returned no audio');
  cachePut(key, audio);
  return audio;
}
