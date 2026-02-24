import { describe, expect, it, vi } from "vitest";

import {
  acquireConcurrencySlot,
  checkRateLimit,
  checkStreamPermission,
  consumeRateLimitSlot,
  getConcurrencyStatus,
  getRateLimitHeaders,
  RATE_LIMIT_CONFIG,
  releaseConcurrencySlot,
  resetAllLimits,
  resetUserLimits,
} from "@/lib/rateLimit";

describe("rateLimit", () => {
  it("checks and consumes rate slots", () => {
    resetAllLimits();
    const userId = "user-rate";

    const before = checkRateLimit(userId);
    expect(before.allowed).toBe(true);
    expect(before.remaining).toBe(RATE_LIMIT_CONFIG.maxRequests);

    consumeRateLimitSlot(userId);
    const after = checkRateLimit(userId);
    expect(after.remaining).toBe(RATE_LIMIT_CONFIG.maxRequests - 1);
  });

  it("enforces concurrency limits and releases slots", () => {
    resetAllLimits();
    const userId = "user-concurrency";

    const first = acquireConcurrencySlot(userId);
    const second = acquireConcurrencySlot(userId);
    const third = acquireConcurrencySlot(userId);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);

    releaseConcurrencySlot(userId, first.streamId!);
    const status = getConcurrencyStatus(userId);
    expect(status.active).toBe(1);
  });

  it("checks stream permission in one pass", () => {
    resetAllLimits();
    const userId = "user-stream";

    const first = checkStreamPermission(userId);
    expect(first.allowed).toBe(true);
    expect(first.concurrency.streamId).toBeTruthy();

    const second = checkStreamPermission(userId);
    const third = checkStreamPermission(userId);

    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.reason).toBe("concurrency_limit");
  });

  it("bypasses limits for unlimited tester email", () => {
    resetAllLimits();
    vi.stubEnv("ADMIN_EMAIL", "orshikhbayar@gmail.com");

    const first = checkStreamPermission("tester-user", undefined, {
      email: "orshikhbayar@gmail.com",
    });
    const second = checkStreamPermission("tester-user", undefined, {
      email: "orshikhbayar@gmail.com",
    });
    const third = checkStreamPermission("tester-user", undefined, {
      email: "orshikhbayar@gmail.com",
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(true);
    expect(third.reason).toBeUndefined();
  });

  it("returns rate limit denial when window is exhausted", () => {
    resetAllLimits();
    const userId = "user-window-exhausted";
    const config = {
      ...RATE_LIMIT_CONFIG,
      maxRequests: 1,
      maxConcurrentStreams: 3,
    };

    const first = checkStreamPermission(userId, config);
    const second = checkStreamPermission(userId, config);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe("rate_limit");
    expect(second.rateLimit.remaining).toBe(0);
  });

  it("resets the fixed window after expiration", async () => {
    vi.useFakeTimers();
    try {
      resetAllLimits();
      const userId = "user-window-reset";
      const config = {
        ...RATE_LIMIT_CONFIG,
        maxRequests: 1,
        windowSizeSeconds: 1,
      };

      consumeRateLimitSlot(userId, config);
      expect(checkRateLimit(userId, config).allowed).toBe(false);

      await vi.advanceTimersByTimeAsync(1_100);
      const afterReset = checkRateLimit(userId, config);
      expect(afterReset.allowed).toBe(true);
      expect(afterReset.remaining).toBe(1);
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it("does nothing when releasing unknown concurrency slot", () => {
    resetAllLimits();
    const userId = "user-release-noop";
    releaseConcurrencySlot(userId, "missing-stream");
    expect(getConcurrencyStatus(userId).active).toBe(0);
  });

  it("runs cleanup interval paths for expired and empty entries", async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      vi.stubEnv("NODE_ENV", "test");
      const mod = await import("@/lib/rateLimit");
      const config = {
        ...mod.RATE_LIMIT_CONFIG,
        maxRequests: 1,
        windowSizeSeconds: 1,
        maxConcurrentStreams: 1,
      };

      mod.consumeRateLimitSlot("cleanup-rate-user", config);
      const acquired = mod.acquireConcurrencySlot("cleanup-stream-user", config);
      expect(acquired.streamId).toBeTruthy();
      mod.releaseConcurrencySlot("cleanup-stream-user", acquired.streamId!);

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
      expect(mod.checkRateLimit("cleanup-rate-user", config).allowed).toBe(true);
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it("emits debug logs when NODE_ENV is development", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const mod = await import("@/lib/rateLimit");
    mod.resetAllLimits();

    const permission = mod.checkStreamPermission("debug-user");
    expect(permission.allowed).toBe(true);

    mod.releaseConcurrencySlot("debug-user", permission.concurrency.streamId!);
    mod.resetUserLimits("debug-user");
    expect(logSpy).toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it("builds standard rate limit headers", () => {
    const headers = getRateLimitHeaders({
      allowed: true,
      remaining: 10,
      resetIn: 42,
      limit: 20,
    });

    expect(headers).toEqual({
      "X-RateLimit-Limit": "20",
      "X-RateLimit-Remaining": "10",
      "X-RateLimit-Reset": "42",
    });
  });

  it("resets a specific user's limits", () => {
    resetAllLimits();
    const userId = "user-reset";
    checkStreamPermission(userId);

    expect(getConcurrencyStatus(userId).active).toBe(1);
    resetUserLimits(userId);
    expect(getConcurrencyStatus(userId).active).toBe(0);
  });
});
