import './setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { app } from '../src/app.js';
import type { AnalyzeTextResponse, ApiErrorBody } from '../src/contract.js';
import { extractUrls, sniffImageType } from '../src/http.js';

function postJson(path: string, body: unknown): Promise<Response> {
  return Promise.resolve(
    app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

describe('POST /v1/analyze/text', () => {
  it('returns 200 with ai:null and AI_NOT_CONFIGURED when no key is set', async () => {
    const res = await postJson('/v1/analyze/text', {
      text: 'Your card is blocked. Send the SMS code now.',
      uiLanguage: 'en',
      context: 'message',
      inspectUrls: false,
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as AnalyzeTextResponse;
    assert.equal(body.ai, null);
    assert.equal(body.aiError, 'AI_NOT_CONFIGURED');
    assert.equal(body.model, null);
    assert.deepEqual(body.urlInspections, []);
    assert.equal(typeof body.latencyMs, 'number');
  });

  it('still returns URL inspections without AI (blocked target → no network)', async () => {
    const res = await postJson('/v1/analyze/text', {
      text: 'Unblock here: http://127.0.0.1/admin. Thanks!',
      uiLanguage: 'az',
      context: 'message',
      inspectUrls: true,
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as AnalyzeTextResponse;
    assert.equal(body.aiError, 'AI_NOT_CONFIGURED');
    assert.equal(body.urlInspections.length, 1);
    assert.equal(body.urlInspections[0]?.url, 'http://127.0.0.1/admin');
    assert.equal(body.urlInspections[0]?.error, 'BLOCKED_PRIVATE_ADDRESS');
  });

  it('rejects empty text with 400', async () => {
    for (const text of ['', '   \n ']) {
      const res = await postJson('/v1/analyze/text', { text, uiLanguage: 'en', context: 'message', inspectUrls: false });
      assert.equal(res.status, 400);
      const body = (await res.json()) as ApiErrorBody;
      assert.equal(body.error.code, 'BAD_REQUEST');
    }
  });

  it('rejects text over 20000 chars, bad enums and missing fields with 400', async () => {
    const cases: unknown[] = [
      { text: 'x'.repeat(20_001), uiLanguage: 'en', context: 'message', inspectUrls: false },
      { text: 'hello', uiLanguage: 'fr', context: 'message', inspectUrls: false },
      { text: 'hello', uiLanguage: 'en', context: 'tweet', inspectUrls: false },
      { uiLanguage: 'en' },
      [],
    ];
    for (const body of cases) {
      const res = await postJson('/v1/analyze/text', body);
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));
    }
  });

  it('rejects invalid JSON without echoing the body', async () => {
    const res = await postJson('/v1/analyze/text', '{"text": "my secret code 123456"');
    assert.equal(res.status, 400);
    const raw = await res.text();
    assert.ok(!raw.includes('123456'));
    assert.equal((JSON.parse(raw) as ApiErrorBody).error.code, 'BAD_REQUEST');
  });

  it('rejects JSON bodies over 256 KB with 413', async () => {
    const res = await postJson('/v1/analyze/text', { text: 'a'.repeat(300 * 1024) });
    assert.equal(res.status, 413);
    assert.equal(((await res.json()) as ApiErrorBody).error.code, 'PAYLOAD_TOO_LARGE');
  });
});

describe('POST /v1/analyze/image', () => {
  it('returns 503 AI_NOT_CONFIGURED without a key', async () => {
    const form = new FormData();
    form.append('image', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])], 'shot.jpg', { type: 'image/jpeg' }));
    form.append('uiLanguage', 'en');
    const res = await app.request('/v1/analyze/image', { method: 'POST', body: form });
    assert.equal(res.status, 503);
    assert.equal(((await res.json()) as ApiErrorBody).error.code, 'AI_NOT_CONFIGURED');
  });
});

describe('helpers', () => {
  it('extracts up to 3 http(s)/www links, trimming punctuation', () => {
    assert.deepEqual(extractUrls('Go to https://bit.ly/abc123, then www.kapital-bonus.az/login. Also (http://x.io/a_(b)).'), [
      'https://bit.ly/abc123',
      'www.kapital-bonus.az/login',
      'http://x.io/a_(b)',
    ]);
    assert.equal(extractUrls('a http://a.com b http://b.com c http://c.com d http://d.com').length, 3);
    assert.deepEqual(extractUrls('no links here, just www. and http://'), []);
    assert.deepEqual(extractUrls('dup https://a.az/x and HTTPS://A.AZ/x'), ['https://a.az/x']);
  });

  it('sniffs image types from magic bytes', () => {
    assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xdb])), 'image/jpeg');
    assert.equal(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), 'image/png');
    assert.equal(sniffImageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp');
    assert.equal(sniffImageType(new TextEncoder().encode('GIF89a')), 'image/gif');
    assert.equal(sniffImageType(new TextEncoder().encode('....ftypheic')), null);
  });
});
