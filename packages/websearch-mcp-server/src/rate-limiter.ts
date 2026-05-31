/**
 * Sliding-window rate limiter for web search requests.
 *
 * Tracks request timestamps in an array and enforces a configurable
 * requests-per-minute limit. Designed to protect against DuckDuckGo's
 * bot detection and IP blocking.
 */

const DEFAULT_RPM = 60; // 1 request per second
const ENV_VAR = 'WEBSEARCH_RATE_LIMIT_RPM';
const APPROACHING_THRESHOLD = 0.75; // 75% of window consumed

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export class RateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests?: number, windowMs?: number) {
    if (maxRequests !== undefined && windowMs !== undefined) {
      this.maxRequests = maxRequests;
      this.windowMs = windowMs;
    } else {
      // Read RPM from env var, fall back to default
      const rpm = this.readRpmFromEnv();
      this.maxRequests = rpm;
      this.windowMs = 60_000; // 60 seconds
    }
  }

  /**
   * Check if a request is allowed under the current rate limit.
   * If not allowed, returns the number of ms to wait before retrying.
   */
  check(): RateLimitResult {
    const now = Date.now();

    // Garbage-collect timestamps outside the window
    this.gc(now);

    if (this.timestamps.length < this.maxRequests) {
      this.timestamps.push(now);
      return { allowed: true };
    }

    // Rate limited — calculate when the next slot opens
    const oldest = this.timestamps[0]!;
    const retryAfterMs = oldest + this.windowMs - now + 1;

    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1) };
  }

  /**
   * Returns true when 75% or more of the sliding window is consumed.
   */
  isApproachingLimit(): boolean {
    const now = Date.now();
    this.gc(now);
    return this.timestamps.length >= this.maxRequests * APPROACHING_THRESHOLD;
  }

  /**
   * Clear all tracked timestamps — resets the rate limit state.
   */
  reset(): void {
    this.timestamps = [];
  }

  private gc(now: number): void {
    const cutoff = now - this.windowMs;
    // Remove timestamps outside the window
    this.timestamps = this.timestamps.filter(t => t > cutoff);
  }

  private readRpmFromEnv(): number {
    const raw = typeof process !== 'undefined' ? process.env[ENV_VAR] : undefined;
    if (raw === undefined || raw === '') return DEFAULT_RPM;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RPM;

    return parsed;
  }
}
