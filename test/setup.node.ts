import { afterEach, beforeEach, vi } from "vitest";

const _realFetch = globalThis.fetch;

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
  vi.unstubAllGlobals();
});
