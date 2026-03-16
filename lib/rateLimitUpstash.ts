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

let _limiter: UpstashRateLimiter | null | undefined = undefined; // undefined = not yet initialised

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
      "[RateLimit] Failed to initialise Upstash rate limiter. " +
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
}
