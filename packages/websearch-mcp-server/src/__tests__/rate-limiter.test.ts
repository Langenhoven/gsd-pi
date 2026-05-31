/**
 * Tests for RateLimiter
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../rate-limiter.js';

describe('RateLimiter', () => {
  describe('default settings (1 req/s)', () => {
    it('allows a single request', () => {
      const limiter = new RateLimiter(1, 1000);
      const result = limiter.check();
      assert.equal(result.allowed, true);
    });

    it('rejects a second request within the window', () => {
      const limiter = new RateLimiter(1, 1000);
      limiter.check(); // first request
      const result = limiter.check(); // immediate second request
      assert.equal(result.allowed, false);
      assert.ok(result.retryAfterMs! > 0);
    });

    it('allows a request after the window expires', async () => {
      const limiter = new RateLimiter(1, 50); // 50ms window for fast test
      limiter.check();
      await new Promise(r => setTimeout(r, 60));
      const result = limiter.check();
      assert.equal(result.allowed, true);
    });
  });

  describe('configurable rate', () => {
    it('allows 3 requests with 3 req/s', () => {
      const limiter = new RateLimiter(3, 1000);
      assert.equal(limiter.check().allowed, true);
      assert.equal(limiter.check().allowed, true);
      assert.equal(limiter.check().allowed, true);
      assert.equal(limiter.check().allowed, false);
    });

    it('respects windowMs for retryAfterMs calculation', () => {
      const limiter = new RateLimiter(1, 2000);
      limiter.check();
      const result = limiter.check();
      assert.equal(result.allowed, false);
      // retryAfterMs should be close to the window size (2000ms)
      // but may be up to 1ms over due to same-millisecond timestamp resolution
      assert.ok(result.retryAfterMs! <= 2001);
      assert.ok(result.retryAfterMs! > 0);
    });
  });

  describe('isApproachingLimit', () => {
    it('returns false when below 75% threshold', () => {
      const limiter = new RateLimiter(4, 1000);
      limiter.check(); // 1 of 4 = 25%
      assert.equal(limiter.isApproachingLimit(), false);
      limiter.check(); // 2 of 4 = 50%
      assert.equal(limiter.isApproachingLimit(), false);
    });

    it('returns true when at or above 75% threshold', () => {
      const limiter = new RateLimiter(4, 1000);
      limiter.check();
      limiter.check();
      limiter.check(); // 3 of 4 = 75%
      assert.equal(limiter.isApproachingLimit(), true);
      limiter.check(); // 4 of 4 = 100%
      assert.equal(limiter.isApproachingLimit(), true);
    });

    it('clears after idle period', async () => {
      const limiter = new RateLimiter(1, 50); // 50ms window
      limiter.check();
      assert.equal(limiter.isApproachingLimit(), true);
      await new Promise(r => setTimeout(r, 60));
      assert.equal(limiter.isApproachingLimit(), false);
    });
  });

  describe('reset', () => {
    it('clears the window', () => {
      const limiter = new RateLimiter(1, 1000);
      limiter.check();
      assert.equal(limiter.check().allowed, false);
      limiter.reset();
      assert.equal(limiter.check().allowed, true);
    });
  });

  describe('memory bounds', () => {
    it('does not grow unbounded under continuous use', () => {
      const limiter = new RateLimiter(5, 1000);
      for (let i = 0; i < 100; i++) {
        limiter.check();
      }
      // After GC, at most 5 timestamps should remain
      limiter.check();
      assert.ok((limiter as any).timestamps.length <= 5);
    });
  });

  describe('WEBSEARCH_RATE_LIMIT_RPM env var', () => {
    const ORIGINAL_ENV = process.env;

    before(() => {
      process.env = { ...ORIGINAL_ENV };
    });

    after(() => {
      process.env = ORIGINAL_ENV;
    });

    it('reads RPM from env var', () => {
      process.env.WEBSEARCH_RATE_LIMIT_RPM = '30';
      const limiter = new RateLimiter();
      // 30 RPM = 30 requests per 60s window
      for (let i = 0; i < 30; i++) {
        assert.equal(limiter.check().allowed, true);
      }
      assert.equal(limiter.check().allowed, false);
    });

    it('falls back to default for invalid values', () => {
      process.env.WEBSEARCH_RATE_LIMIT_RPM = '0';
      const limiter1 = new RateLimiter();
      assert.equal(limiter1.check().allowed, true);

      process.env.WEBSEARCH_RATE_LIMIT_RPM = '-1';
      const limiter2 = new RateLimiter();
      assert.equal(limiter2.check().allowed, true);
    });

    it('falls back to default when env var is empty', () => {
      delete process.env.WEBSEARCH_RATE_LIMIT_RPM;
      const limiter = new RateLimiter();
      assert.equal(limiter.check().allowed, true);
    });
  });
});
