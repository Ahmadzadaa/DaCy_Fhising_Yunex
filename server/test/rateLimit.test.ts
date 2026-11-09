import './setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { app } from '../src/app.js';
import type { ApiErrorBody } from '../src/contract.js';
import { RateLimiter } from '../src/rateLimit.js';

describe('rate limiting', () => {
  it('returns 429 RATE_LIMITED with Retry-After once the per-IP budget is spent', async () => {
    process.env.RATE_LIMIT_PER_MIN = '3';
    try {
      for (let i = 0; i < 3; i += 1) assert.equal((await app.request('/health')).status, 200);
      const res = await app.request('/health');
      assert.equal(res.status, 429);
      assert.equal(((await res.json()) as ApiErrorBody).error.code, 'RATE_LIMITED');
      assert.ok(Number(res.headers.get('retry-after')) >= 1);
    } finally {
      delete process.env.RATE_LIMIT_PER_MIN;
    }
  });

  it('resets after the window', () => {
    const limiter = new RateLimiter();
    const t0 = 1_000_000;
    assert.equal(limiter.hit('a', 1, t0), 0);
    assert.ok(limiter.hit('a', 1, t0 + 10) > 0);
    assert.equal(limiter.hit('b', 1, t0 + 10), 0);
    assert.equal(limiter.hit('a', 1, t0 + 60_001), 0);
  });
});
