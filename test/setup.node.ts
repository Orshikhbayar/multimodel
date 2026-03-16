// Load test environment variables from .env.test before any mocks or imports
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envTestPath = resolve(process.cwd(), ".env.test");
try {
  const lines = readFileSync(envTestPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.test not present — that's OK in some environments
}

// Safety net: block unmocked HTTP in tests.
// Using direct assignment (not vi.stubGlobal) so that vi.unstubAllGlobals()
// restores back to THIS guard rather than to real network fetch.
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    throw new Error(
      `[TEST GUARD] Unmocked fetch to: ${url} — add vi.stubGlobal("fetch", mockFn) in your test file`,
    );
  },
  { _isTestGuard: true },
) as unknown as typeof fetch;

import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  if (
    typeof globalThis.fetch === "function" &&
    !vi.isMockFunction(globalThis.fetch)
  ) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : (input as Request).url;
        throw new Error(
          `[TEST GUARD] Unmocked fetch to: ${url} — add vi.stubGlobal("fetch", ...) in this test file`,
        );
      }),
    );
  }
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
