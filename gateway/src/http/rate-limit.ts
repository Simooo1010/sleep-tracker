// Simple in-memory fixed-window rate limiter (best effort per serverless instance).

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
  remaining: number;
}

export class FixedWindowRateLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(limit: number, windowMs = 60_000, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  hit(key: string): RateLimitResult {
    const now = this.now();
    let entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      entry = { windowStart: now, count: 0 };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    if (this.hits.size > 10_000) this.prune(now);
    const allowed = entry.count <= this.limit;
    return {
      allowed,
      remaining: Math.max(0, this.limit - entry.count),
      retryAfterSec: allowed ? 0 : Math.ceil((entry.windowStart + this.windowMs - now) / 1000),
    };
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (now - v.windowStart >= this.windowMs) this.hits.delete(k);
  }
}
