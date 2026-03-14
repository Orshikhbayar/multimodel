import { describe, expect, it, vi } from "vitest";

import {
  createStreamAbortController,
  getStreamStatusFromError,
  StreamTimeoutError,
  withStreamTimeouts,
} from "@/lib/api/streamWithTimeout";

async function* delayedGenerator(values: string[], delayMs: number) {
  for (const value of values) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    yield value;
  }
}

describe("streamWithTimeout", () => {
  it("passes through chunks when within timeout", async () => {
    const result: string[] = [];

    for await (const chunk of withStreamTimeouts(
      delayedGenerator(["a", "b"], 1),
      {
        connectTimeoutMs: 100,
        inactivityTimeoutMs: 100,
        maxDurationMs: 1000,
      },
    )) {
      result.push(chunk);
    }

    expect(result).toEqual(["a", "b"]);
  });

  it("maps timeout errors to timeout status", () => {
    const mapped = getStreamStatusFromError(new StreamTimeoutError("connect", 50));
    expect(mapped.status).toBe("timeout");
    expect(mapped.message).toContain("timeout");
  });

  it("maps abort-like errors to cancelled status", () => {
    const mapped = getStreamStatusFromError(new Error("request abort by client"));
    expect(mapped.status).toBe("cancelled");
  });

  it("creates an abort controller that follows client signal", () => {
    const client = new AbortController();
    const { controller, cleanup } = createStreamAbortController(client.signal, 1000);

    client.abort("client_cancelled");
    expect(controller.signal.aborted).toBe(true);

    cleanup();
  });

  it("immediately aborts when client signal is already aborted", () => {
    const client = new AbortController();
    client.abort("already-aborted");

    const { controller, cleanup } = createStreamAbortController(client.signal);
    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBe("already-aborted");
    cleanup();
  });

  it("aborts when internal timeout expires", async () => {
    vi.useFakeTimers();
    try {
      const { controller, cleanup } = createStreamAbortController(undefined, 100);
      await vi.advanceTimersByTimeAsync(100);
      expect(controller.signal.aborted).toBe(true);
      expect(controller.signal.reason).toBeInstanceOf(StreamTimeoutError);
      cleanup();
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it("maps non-abort errors to error status", () => {
    const mapped = getStreamStatusFromError(new Error("upstream failed"));
    expect(mapped.status).toBe("error");
    expect(mapped.message).toBe("upstream failed");
  });

  it("maps non-error values to error status", () => {
    const mapped = getStreamStatusFromError("oops");
    expect(mapped.status).toBe("error");
    expect(mapped.message).toBe("oops");
  });

  it("aborts on max duration timeout", async () => {
    vi.useFakeTimers();

    try {
      async function* neverEnding() {
        while (true) {
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          yield "tick";
        }
      }

      const iterator = withStreamTimeouts(neverEnding(), {
        connectTimeoutMs: 5_000,
        inactivityTimeoutMs: 5_000,
        maxDurationMs: 100,
      });

      const nextPromise = iterator.next().catch((error) => error);
      await vi.advanceTimersByTimeAsync(1_000);

      const error = await nextPromise;
      expect(error).toBeInstanceOf(StreamTimeoutError);

      await iterator.return();
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });
});
