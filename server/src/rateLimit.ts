/** Simple in-memory fixed-window rate limiter keyed by client IP. */

const WINDOW_MS = 60_000;
const MAX_TRACKED = 10_000;

interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  /** Returns 0 when allowed, otherwise the number of seconds until the window resets. */
  hit(key: string, limit: number, now = Date.now()): number {
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (this.buckets.size >= MAX_TRACKED) this.sweep(now);
      bucket = { count: 0, resetAt: now + WINDOW_MS };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count > limit ? Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) : 0;
  }

  private sweep(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    // Still full (many distinct IPs inside one window): drop the oldest entries.
    while (this.buckets.size >= MAX_TRACKED) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }
}
