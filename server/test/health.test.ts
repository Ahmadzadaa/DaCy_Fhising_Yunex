import './setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { app } from '../src/app.js';
import type { ApiErrorBody, HealthResponse } from '../src/contract.js';

describe('GET /health', () => {
  it('reports capabilities without any keys', async () => {
    const res = await app.request('/health');
    assert.equal(res.status, 200);
    const body = (await res.json()) as HealthResponse;
    assert.equal(body.ok, true);
    assert.equal(body.service, 'dacy-server');
    assert.equal(typeof body.version, 'string');
    assert.ok(!Number.isNaN(Date.parse(body.time)));
    assert.deepEqual(body.capabilities, {
      llm: false,
      llmModel: null,
      vision: false,
      stt: false,
      sttProvider: null,
      sttModel: null,
      tts: false,
      urlInspection: true,
      familyRelay: true,
    });
  });

  it('reflects configured keys (read at request time)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-not-real';
    process.env.GROQ_API_KEY = 'gsk-test-not-real';
    try {
      const body = (await (await app.request('/health')).json()) as HealthResponse;
      assert.equal(body.capabilities.llm, true);
      assert.equal(body.capabilities.vision, true);
      assert.equal(body.capabilities.llmModel, 'claude-opus-5-5');
      assert.equal(body.capabilities.stt, true);
      assert.equal(body.capabilities.sttProvider, 'groq');
      assert.equal(body.capabilities.sttModel, 'whisper-large-v3-turbo');
      assert.equal(body.capabilities.tts, false);

      process.env.STT_PROVIDER = 'openai'; // explicit provider without its key → off
      const body2 = (await (await app.request('/health')).json()) as HealthResponse;
      assert.equal(body2.capabilities.stt, false);
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GROQ_API_KEY;
      delete process.env.STT_PROVIDER;
    }
  });

  it('sends permissive CORS headers and answers preflight', async () => {
    const res = await app.request('/health', { headers: { Origin: 'http://localhost:8081' } });
    assert.equal(res.headers.get('access-control-allow-origin'), '*');

    const pre = await app.request('/v1/family/fam_x/alerts', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:8081',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-family-secret',
      },
    });
    assert.equal(pre.status, 204);
    assert.match(pre.headers.get('access-control-allow-headers') ?? '', /x-family-secret/i);
  });

  it('returns JSON errors for unknown routes', async () => {
    const res = await app.request('/nope', { headers: { Origin: 'http://localhost:8081' } });
    assert.equal(res.status, 404);
    const body = (await res.json()) as ApiErrorBody;
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  });
});
