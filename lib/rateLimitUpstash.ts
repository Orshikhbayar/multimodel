/**
 * Upstash-backed rate limiter using a sliding window algorithm.
 *
 * This module is activated when UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN environment variables are set. If they are absent
 * (local dev, CI without Redis), it returns null and the caller falls back to
 * the in-memory rate limiter.
 *
 * Installation (run once network policy allows it):
 *   npm install @upstash/ratelimit @upstash/redis
 *
 * Usage:
 *   const limiter = await getUpstashRateLimiter();
 *   if (limiter) {
 *     const { success, remaining, reset } = await limiter.limit(userId);
 *   }
 */

export interface UpstashLimitResult {
  success: boolean;
  remaining: number;
  /** Unix epoch milliseconds when the window resets */
  reset: number;
  limit: number;
}

export interface UpstashRateLimiter {
  limit(identifier: string): Promise<UpstashLimitResult>;
}

let _limiter: UpstashRateLimiter | null | undefined = undefined; // undefined = not yet initialized

/**
 * Returns an Upstash-backed rate limiter if configured, null otherwise.
 * Result is cached after first call.
 */
export async function getUpstashRateLimiter(): Promise<UpstashRateLimiter | null> {
  if (_limiter !== undefined) return _limiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[RateLimit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set. " +
          "Falling back to in-memory rate limiter — this provides NO protection on " +
          "serverless deployments where each invocation has its own memory space. " +
          "Set Upstash env vars to enable real rate limiting.",
      );
    }
    _limiter = null;
    return null;
  }

  try {
    // Dynamic import so the module loads even when the package is not installed.
    // Install with: npm install @upstash/ratelimit @upstash/redis
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [upstashRL, upstashRedis]: [any, any] = await Promise.all([
      import("@upstash/ratelimit" as string),
      import("@upstash/redis" as string),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ratelimit = (upstashRL as any).Ratelimit;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Redis = (upstashRedis as any).Redis;

    const redis = new Redis({ url, token });

    // Sliding window: 20 requests per 60-second window per user.
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "60 s"),
      analytics: false,
      prefix: "multimodel:rl",
    });

    _limiter = {
      async limit(identifier: string): Promise<UpstashLimitResult> {
        const result = await ratelimit.limit(identifier);
        return {
          success: result.success,
          remaining: result.remaining,
          reset: result.reset,
          limit: result.limit,
        };
      },
    };
  } catch (err) {
    console.error(
      "[RateLimit] Failed to initialize Upstash rate limiter. " +
        "Run `npm install @upstash/ratelimit @upstash/redis` and ensure env vars are set. " +
        "Falling back to in-memory limiter.",
      err,
    );
    _limiter = null;
  }

  return _limiter;
}

/** Reset cached instance (for tests). */
export function _resetUpstashLimiterCache() {
  _limiter = undefined;
  _redis = undefined;
}

// ============================================
// Distributed concurrency slots (Redis counter)
// ============================================
//
// The in-memory concurrency Map is per-instance: on Vercel every serverless
// instance would grant maxConcurrentStreams more streams. These helpers back
// the slot count with a Redis counter so the cap holds globally.

interface UpstashRedisLike {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

let _redis: UpstashRedisLike | null | undefined = undefined;

async function getUpstashRedis(): Promise<UpstashRedisLike | null> {
  if (_redis !== undefined) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    _redis = null;
    return null;
  }

  try {
    // Dynamic import so the module loads even when the package is not installed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upstashRedis: any = await import("@upstash/redis" as string);
    _redis = new upstashRedis.Redis({ url, token }) as UpstashRedisLike;
  } catch (err) {
    console.error(
      "[RateLimit] Failed to initialize Upstash Redis for concurrency slots. " +
        "Falling back to in-memory (per-instance) concurrency limiting.",
      err,
    );
    _redis = null;
  }

  return _redis;
}

const CONCURRENCY_KEY_PREFIX = "multimodel:conc:";

/**
 * Safety net: slots auto-expire so a function that dies between acquire and
 * release (crash, suspension) cannot lock a user out forever. Must exceed the
 * longest legitimate stream duration.
 */
const CONCURRENCY_SLOT_TTL_SECONDS = 15 * 60;

/**
 * Atomically acquire a concurrency slot in Redis.
 *
 * Returns null when Redis is unavailable (caller should fall back to the
 * in-memory store). INCR-first keeps the check-and-acquire atomic: two
 * racing requests cannot both observe a free slot.
 */
export async function acquireDistributedConcurrencySlot(
  userId: string,
  limit: number,
): Promise<{ acquired: boolean; active: number } | null> {
  const redis = await getUpstashRedis();
  if (!redis) return null;

  const key = CONCURRENCY_KEY_PREFIX + userId;
  try {
    const active = await redis.incr(key);
    // Refresh the TTL on every acquire — see CONCURRENCY_SLOT_TTL_SECONDS.
    await redis.expire(key, CONCURRENCY_SLOT_TTL_SECONDS);

    if (active > limit) {
      await redis.decr(key);
      return { acquired: false, active: active - 1 };
    }
    return { acquired: true, active };
  } catch (err) {
    console.error("[RateLimit] Redis concurrency acquire failed", err);
    return null;
  }
}

/** Release a Redis-backed concurrency slot (floors the counter at zero). */
export async function releaseDistributedConcurrencySlot(
  userId: string,
): Promise<void> {
  const redis = await getUpstashRedis();
  if (!redis) return;

  const key = CONCURRENCY_KEY_PREFIX + userId;
  try {
    const value = await redis.decr(key);
    if (value < 0) {
      // Double release or TTL expiry mid-stream — restore the floor.
      await redis.incr(key);
    }
  } catch (err) {
    console.error("[RateLimit] Redis concurrency release failed", err);
  }
}
