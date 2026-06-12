/**
 * Rate limiting utilities for API routes.
 *
 * Two implementations run side-by-side:
 *
 * 1. In-memory (always active) — fast, local, but instance-scoped. On Vercel
 *    serverless each cold start has its own map, so this provides ZERO
 *    protection in production on its own.
 *
 * 2. Upstash Redis (activated when UPSTASH_REDIS_REST_URL and
 *    UPSTASH_REDIS_REST_TOKEN are set) — sliding window, shared across all
 *    serverless instances. Use checkStreamPermissionAsync() in API routes so
 *    the Upstash check runs when available.
 *
 * Install: npm install @upstash/ratelimit @upstash/redis
 */
import {
  isUnlimitedTesterId,
  isUnlimitedTesterEmail,
} from "@/lib/testerAccess";
import { debug as logDebug } from "@/lib/logger";
import {
  getUpstashRateLimiter,
  acquireDistributedConcurrencySlot,
  releaseDistributedConcurrencySlot,
} from "@/lib/rateLimitUpstash";

// ============================================
// Types
// ============================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface ConcurrencyEntry {
  activeStreams: number;
  streamIds: Set<string>;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number; // seconds until reset
  limit: number;
}

interface ConcurrencyResult {
  allowed: boolean;
  active: number;
  limit: number;
  streamId?: string;
}

// ============================================
// Configuration
// ============================================

export const RATE_LIMIT_CONFIG = {
  // Requests per window
  maxRequests: 20,
  // Window size in seconds
  windowSizeSeconds: 60,
  // Max concurrent streams per user
  maxConcurrentStreams: 2,
};

// ============================================
// In-Memory Storage
// ============================================

// Rate limit storage: userId -> entry
const rateLimitStore = new Map<string, RateLimitEntry>();

// Concurrency storage: userId -> entry
const concurrencyStore = new Map<string, ConcurrencyEntry>();

// Stream IDs whose slot lives in Redis rather than the local store. Acquire
// and release always happen on the same instance (same function invocation),
// so a local Set is sufficient to route releases — and doubles as the
// double-release guard the local store provides via streamIds.
const distributedStreamIds = new Set<string>();

// Cleanup interval (5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// Debug logging (enable in development)
const DEBUG = process.env.NODE_ENV === "development";

// Cleanup old entries periodically
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();

    // Clean up expired rate limit entries
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetAt < now) {
        rateLimitStore.delete(key);
      }
    }

    // Clean up empty concurrency entries
    for (const [key, entry] of concurrencyStore.entries()) {
      if (entry.activeStreams === 0) {
        concurrencyStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
}

// ============================================
// Rate Limiting (Fixed Window)
// ============================================

/**
 * Check rate limit for a user (does NOT consume a slot)
 * Use consumeRateLimitSlot() after all checks pass
 */
export function checkRateLimit(
  userId: string,
  config = RATE_LIMIT_CONFIG,
): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSizeSeconds * 1000;

  let entry = rateLimitStore.get(userId);

  // Create new entry if none exists or window has expired
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + windowMs,
    };
    rateLimitStore.set(userId, entry);
  }

  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetIn = Math.ceil((entry.resetAt - now) / 1000);

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn,
      limit: config.maxRequests,
    };
  }

  // Don't increment here - call consumeRateLimitSlot() separately
  return {
    allowed: true,
    remaining,
    resetIn,
    limit: config.maxRequests,
  };
}

/**
 * Consume a rate limit slot (call only after all checks pass)
 */
export function consumeRateLimitSlot(
  userId: string,
  config = RATE_LIMIT_CONFIG,
): void {
  const now = Date.now();
  const windowMs = config.windowSizeSeconds * 1000;

  let entry = rateLimitStore.get(userId);

  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + windowMs,
    };
    rateLimitStore.set(userId, entry);
  }

  entry.count += 1;
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "X-RateLimit-Limit": result.limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": result.resetIn.toString(),
  };
}

// ============================================
// Concurrency Limiting
// ============================================

/**
 * Try to acquire a concurrency slot for streaming
 * Returns a streamId that must be released when done
 */
export function acquireConcurrencySlot(
  userId: string,
  config = RATE_LIMIT_CONFIG,
): ConcurrencyResult {
  let entry = concurrencyStore.get(userId);

  if (!entry) {
    entry = {
      activeStreams: 0,
      streamIds: new Set(),
    };
    concurrencyStore.set(userId, entry);
  }

  if (entry.activeStreams >= config.maxConcurrentStreams) {
    return {
      allowed: false,
      active: entry.activeStreams,
      limit: config.maxConcurrentStreams,
    };
  }

  // Generate unique stream ID
  const streamId = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  entry.activeStreams += 1;
  entry.streamIds.add(streamId);

  return {
    allowed: true,
    active: entry.activeStreams,
    limit: config.maxConcurrentStreams,
    streamId,
  };
}

/**
 * Release a concurrency slot when streaming is done
 */
export function releaseConcurrencySlot(userId: string, streamId: string): void {
  // Redis-backed slot: fire the DECR without blocking the caller. If the
  // instance dies before it lands, the key's TTL reclaims the slot.
  if (distributedStreamIds.delete(streamId)) {
    void releaseDistributedConcurrencySlot(userId);
    return;
  }

  const entry = concurrencyStore.get(userId);
  if (!entry) return;

  if (entry.streamIds.has(streamId)) {
    entry.streamIds.delete(streamId);
    entry.activeStreams = Math.max(0, entry.activeStreams - 1);

    if (DEBUG) {
      logDebug(`[RateLimit] User ${userId}: stream RELEASED`, {
        userId,
        streamId,
        activeStreams: entry.activeStreams,
      });
    }
  }
}

/**
 * Get current concurrency status for a user
 */
export function getConcurrencyStatus(
  userId: string,
  config = RATE_LIMIT_CONFIG,
): { active: number; limit: number } {
  const entry = concurrencyStore.get(userId);
  return {
    active: entry?.activeStreams ?? 0,
    limit: config.maxConcurrentStreams,
  };
}

// ============================================
// Combined Rate + Concurrency Check
// ============================================

export interface StreamPermissionResult {
  allowed: boolean;
  reason?: "rate_limit" | "concurrency_limit";
  rateLimit: RateLimitResult;
  concurrency: ConcurrencyResult;
}

/**
 * Check both rate limit and concurrency before starting a stream
 * Only consumes slots if BOTH checks pass
 */
export function checkStreamPermission(
  userId: string,
  config = RATE_LIMIT_CONFIG,
  context?: {
    email?: string | null; // kept for backward compat; prefer user_id bypass
  },
): StreamPermissionResult {
  // Check by immutable user_id first; fall back to email for users not yet
  // migrated to UNLIMITED_TESTER_USER_IDS. Email bypass is deprecated because
  // a user can change their email to spoof the check.
  if (isUnlimitedTesterId(userId) || isUnlimitedTesterEmail(context?.email)) {
    return {
      allowed: true,
      rateLimit: {
        allowed: true,
        remaining: Number.MAX_SAFE_INTEGER,
        resetIn: 0,
        limit: Number.MAX_SAFE_INTEGER,
      },
      concurrency: {
        allowed: true,
        active: 0,
        limit: Number.MAX_SAFE_INTEGER,
        streamId: `${userId}-tester-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      },
    };
  }

  // Check rate limit first (does NOT consume yet)
  const rateResult = checkRateLimit(userId, config);

  if (DEBUG) {
    logDebug(`[RateLimit] User ${userId}: rate check`, {
      userId,
      allowed: rateResult.allowed,
      remaining: rateResult.remaining,
      resetIn: rateResult.resetIn,
    });
  }

  if (!rateResult.allowed) {
    return {
      allowed: false,
      reason: "rate_limit",
      rateLimit: rateResult,
      concurrency: {
        allowed: false,
        active: getConcurrencyStatus(userId, config).active,
        limit: config.maxConcurrentStreams,
      },
    };
  }

  // Check concurrency (does NOT consume yet)
  const concurrencyStatus = getConcurrencyStatus(userId, config);

  if (DEBUG) {
    logDebug(`[RateLimit] User ${userId}: concurrency check`, {
      userId,
      active: concurrencyStatus.active,
      limit: concurrencyStatus.limit,
    });
  }

  if (concurrencyStatus.active >= config.maxConcurrentStreams) {
    return {
      allowed: false,
      reason: "concurrency_limit",
      rateLimit: rateResult,
      concurrency: {
        allowed: false,
        active: concurrencyStatus.active,
        limit: config.maxConcurrentStreams,
      },
    };
  }

  // Both checks passed - NOW consume slots
  consumeRateLimitSlot(userId, config);
  const concurrencyResult = acquireConcurrencySlot(userId, config);

  if (DEBUG) {
    logDebug(`[RateLimit] User ${userId}: stream ALLOWED`, {
      userId,
      streamId: concurrencyResult.streamId,
      activeStreams: concurrencyResult.active,
    });
  }

  return {
    allowed: true,
    rateLimit: {
      ...rateResult,
      remaining: rateResult.remaining - 1, // Adjust for consumed slot
    },
    concurrency: concurrencyResult,
  };
}

/**
 * Async version of checkStreamPermission that uses Upstash Redis when
 * configured, with the in-memory implementation as fallback.
 *
 * API routes should call this instead of checkStreamPermission so that
 * the Upstash sliding-window limiter applies in serverless environments.
 */
export async function checkStreamPermissionAsync(
  userId: string,
  config = RATE_LIMIT_CONFIG,
  context?: { email?: string | null },
): Promise<StreamPermissionResult> {
  // Tester bypass — same as synchronous version
  if (isUnlimitedTesterId(userId) || isUnlimitedTesterEmail(context?.email)) {
    return {
      allowed: true,
      rateLimit: {
        allowed: true,
        remaining: Number.MAX_SAFE_INTEGER,
        resetIn: 0,
        limit: Number.MAX_SAFE_INTEGER,
      },
      concurrency: {
        allowed: true,
        active: 0,
        limit: Number.MAX_SAFE_INTEGER,
        streamId: `${userId}-tester-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      },
    };
  }

  // Try Upstash first
  const upstash = await getUpstashRateLimiter();
  if (upstash) {
    // Concurrency is resolved BEFORE a rate token is consumed, mirroring the
    // in-memory invariant ("only consume if BOTH checks pass"). Previously
    // upstash.limit() ran first, so a user stuck at the concurrency cap who
    // retried also burned through their rate window.
    //
    // Slots are acquired atomically in Redis (INCR-first) so the cap holds
    // across serverless instances; if Redis concurrency is unavailable we
    // fall back to the local per-instance store.
    const distributed = await acquireDistributedConcurrencySlot(
      userId,
      config.maxConcurrentStreams,
    );

    const localConcurrency =
      distributed === null ? getConcurrencyStatus(userId, config) : null;

    const concurrencyRejected = distributed
      ? !distributed.acquired
      : localConcurrency!.active >= config.maxConcurrentStreams;

    if (concurrencyRejected) {
      return {
        allowed: false,
        reason: "concurrency_limit",
        // The limiter was deliberately not consulted (no token consumed),
        // so window values are reported optimistically.
        rateLimit: {
          allowed: true,
          remaining: config.maxRequests,
          resetIn: 0,
          limit: config.maxRequests,
        },
        concurrency: {
          allowed: false,
          active: distributed?.active ?? localConcurrency!.active,
          limit: config.maxConcurrentStreams,
        },
      };
    }

    const upstashResult = await upstash.limit(userId);

    if (!upstashResult.success) {
      // Return the slot acquired above — the request is not going ahead.
      if (distributed) {
        await releaseDistributedConcurrencySlot(userId);
      }
      const resetIn = Math.max(
        0,
        Math.ceil((upstashResult.reset - Date.now()) / 1000),
      );
      return {
        allowed: false,
        reason: "rate_limit",
        rateLimit: {
          allowed: false,
          remaining: 0,
          resetIn,
          limit: upstashResult.limit,
        },
        concurrency: {
          allowed: false,
          active: distributed
            ? Math.max(0, distributed.active - 1)
            : localConcurrency!.active,
          limit: config.maxConcurrentStreams,
        },
      };
    }

    let concurrencyResult: ConcurrencyResult;
    if (distributed) {
      const streamId = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      distributedStreamIds.add(streamId);
      concurrencyResult = {
        allowed: true,
        active: distributed.active,
        limit: config.maxConcurrentStreams,
        streamId,
      };
    } else {
      concurrencyResult = acquireConcurrencySlot(userId, config);
    }

    return {
      allowed: true,
      rateLimit: {
        allowed: true,
        remaining: upstashResult.remaining,
        resetIn: 0,
        limit: upstashResult.limit,
      },
      concurrency: concurrencyResult,
    };
  }

  // No Upstash configured — fall back to synchronous in-memory check
  return checkStreamPermission(userId, config, context);
}

/**
 * Reset all rate limits and concurrency (for testing)
 */
export function resetAllLimits(): void {
  rateLimitStore.clear();
  concurrencyStore.clear();
  if (DEBUG) {
    logDebug("[RateLimit] All limits reset");
  }
}

/**
 * Reset limits for a specific user (for testing)
 */
export function resetUserLimits(userId: string): void {
  rateLimitStore.delete(userId);
  concurrencyStore.delete(userId);
  if (DEBUG) {
    logDebug(`[RateLimit] Limits reset for user ${userId}`, { userId });
  }
}
