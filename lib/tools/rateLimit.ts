interface ToolRateLimitConfig {
  maxRequests: number;
  windowMs: number;
  maxConcurrent: number;
}

interface ToolWindowEntry {
  count: number;
  resetAt: number;
}

interface ToolConcurrencyEntry {
  active: number;
  runIds: Set<string>;
}

const defaultConfig: ToolRateLimitConfig = {
  maxRequests: 30,
  windowMs: 60_000,
  maxConcurrent: 3,
};

const windowStore = new Map<string, ToolWindowEntry>();
const concurrencyStore = new Map<string, ToolConcurrencyEntry>();

const CLEANUP_MS = 5 * 60_000;

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();

    for (const [key, entry] of windowStore.entries()) {
      if (entry.resetAt <= now) {
        windowStore.delete(key);
      }
    }

    for (const [key, entry] of concurrencyStore.entries()) {
      if (entry.active <= 0) {
        concurrencyStore.delete(key);
      }
    }
  }, CLEANUP_MS);
}

function getScopedKey(userId: string, projectId: string | null): string {
  return `${userId}:${projectId ?? "global"}`;
}

export function checkAndConsumeToolRateLimit(
  userId: string,
  projectId: string | null,
  config: ToolRateLimitConfig = defaultConfig,
): {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
  limit: number;
} {
  const key = getScopedKey(userId, projectId);
  const now = Date.now();
  let entry = windowStore.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = {
      count: 0,
      resetAt: now + config.windowMs,
    };
    windowStore.set(key, entry);
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      remaining: 0,
      limit: config.maxRequests,
    };
  }

  entry.count += 1;

  return {
    allowed: true,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    remaining: Math.max(0, config.maxRequests - entry.count),
    limit: config.maxRequests,
  };
}

export function acquireToolConcurrency(
  userId: string,
  projectId: string | null,
  runId: string,
  config: ToolRateLimitConfig = defaultConfig,
): {
  allowed: boolean;
  active: number;
  limit: number;
} {
  const key = getScopedKey(userId, projectId);
  let entry = concurrencyStore.get(key);

  if (!entry) {
    entry = { active: 0, runIds: new Set() };
    concurrencyStore.set(key, entry);
  }

  if (entry.active >= config.maxConcurrent) {
    return {
      allowed: false,
      active: entry.active,
      limit: config.maxConcurrent,
    };
  }

  entry.active += 1;
  entry.runIds.add(runId);

  return {
    allowed: true,
    active: entry.active,
    limit: config.maxConcurrent,
  };
}

export function releaseToolConcurrency(
  userId: string,
  projectId: string | null,
  runId: string,
): void {
  const key = getScopedKey(userId, projectId);
  const entry = concurrencyStore.get(key);

  if (!entry) return;

  if (entry.runIds.has(runId)) {
    entry.runIds.delete(runId);
    entry.active = Math.max(0, entry.active - 1);
  }
}
