import './setup.js';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { app } from '../src/app.js';
import type { ApiErrorBody, LiveChunkResponse, TranscribeResponse } from '../src/contract.js';

function audioForm(bytes: number, extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.append('audio', new File([new Uint8Array(bytes)], 'chunk.m4a', { type: 'audio/m4a' }));
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
}

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as ApiErrorBody).error.code;
}

describe('without keys', () => {
  it('POST /v1/tts → 503 TTS_NOT_CONFIGURED', async () => {
    const res = await app.request('/v1/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Be careful: never share your code.', language: 'en' }),
    });
    assert.equal(res.status, 503);
    assert.equal(await errorCode(res), 'TTS_NOT_CONFIGURED');
  });

  it('GET /v1/tts → 503 TTS_NOT_CONFIGURED', async () => {
    const res = await app.request(`/v1/tts?text=${encodeURIComponent('Diqqət!')}&language=az`);
    assert.equal(res.status, 503);
    assert.equal(await errorCode(res), 'TTS_NOT_CONFIGURED');
  });

  it('POST /v1/transcribe → 503 STT_NOT_CONFIGURED', async () => {
    const res = await app.request('/v1/transcribe', { method: 'POST', body: audioForm(4096, { language: 'az' }) });
    assert.equal(res.status, 503);
    assert.equal(await errorCode(res), 'STT_NOT_CONFIGURED');
  });

  it('POST /v1/live/chunk → 503 STT_NOT_CONFIGURED', async () => {
    const res = await app.request('/v1/live/chunk', {
      method: 'POST',
      body: audioForm(4096, { language: 'auto', uiLanguage: 'en', seq: '3', context: '', analyze: '1' }),
    });
    assert.equal(res.status, 503);
    assert.equal(await errorCode(res), 'STT_NOT_CONFIGURED');
  });
});

describe('with a (fake) STT key, still offline', () => {
  afterEach(() => {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;
    mock.restoreAll();
  });

  it('returns empty text for near-empty audio without calling the provider', async () => {
    process.env.GROQ_API_KEY = 'gsk-test-not-real';
    const fetchMock = mock.method(globalThis, 'fetch', () => Promise.reject(new Error('network access attempted')));
    const res = await app.request('/v1/transcribe', { method: 'POST', body: audioForm(200, { language: 'en' }) });
    assert.equal(res.status, 200);
    const body = (await res.json()) as TranscribeResponse;
    assert.equal(body.text, '');
    assert.equal(body.language, 'en');
    assert.equal(body.provider, 'groq');
    assert.equal(body.model, 'whisper-large-v3-turbo');
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  it('live chunk: stateless, reports AI_NOT_CONFIGURED when analysis is requested without an LLM', async () => {
    // Groq provides speech-to-text only, so no LLM is configured (OPENAI_API_KEY would enable one).
    process.env.GROQ_API_KEY = 'gsk-test-not-real';
    const res = await app.request('/v1/live/chunk', {
      method: 'POST',
      body: audioForm(10, { language: 'az', uiLanguage: 'az', seq: '7', context: 'Salam, bankdan zəng edirəm', analyze: '1' }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as LiveChunkResponse;
    assert.equal(body.seq, 7);
    assert.equal(body.text, '');
    assert.equal(body.ai, null);
    assert.equal(body.aiError, 'AI_NOT_CONFIGURED');
    assert.equal(typeof body.latencyMs.stt, 'number');
    assert.equal(body.latencyMs.ai, 0);

    const noAnalyze = (await (
      await app.request('/v1/live/chunk', {
        method: 'POST',
        body: audioForm(10, { language: 'az', uiLanguage: 'az', seq: '8', context: 'x', analyze: '0' }),
      })
    ).json()) as LiveChunkResponse;
    assert.equal(noAnalyze.aiError, null);
  });

  it('maps provider failures to PROVIDER_ERROR without echoing audio', async () => {
    process.env.GROQ_API_KEY = 'gsk-test-not-real';
    mock.method(globalThis, 'fetch', () =>
      Promise.resolve(new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401 })),
    );
    const res = await app.request('/v1/transcribe', { method: 'POST', body: audioForm(4096, { language: 'auto' }) });
    assert.equal(res.status, 502);
    const body = (await res.json()) as ApiErrorBody;
    assert.equal(body.error.code, 'PROVIDER_ERROR');
    assert.match(body.error.message, /HTTP 401/);
  });

  it('validates multipart input', async () => {
    process.env.GROQ_API_KEY = 'gsk-test-not-real';
    const noFile = new FormData();
    noFile.append('language', 'en');
    assert.equal((await app.request('/v1/transcribe', { method: 'POST', body: noFile })).status, 400);
    const badSeq = await app.request('/v1/live/chunk', { method: 'POST', body: audioForm(10, { seq: '-1' }) });
    assert.equal(badSeq.status, 400);
    const notMultipart = await app.request('/v1/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(notMultipart.status, 400);
  });
});
