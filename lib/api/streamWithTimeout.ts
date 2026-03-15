/**
 * Streaming utilities with timeout support
 */

// ============================================
// Configuration
// ============================================

export const STREAM_TIMEOUT_CONFIG = {
  // Max time to wait for initial connection (ms)
  connectTimeoutMs: 30_000, // 30 seconds
  // Max time between chunks before considering stream stalled (ms)
  inactivityTimeoutMs: 60_000, // 60 seconds
  // Max total duration for a single stream (ms)
  maxDurationMs: 5 * 60_000, // 5 minutes
};

// ============================================
// Timeout Error Classes
// ============================================

export class StreamTimeoutError extends Error {
  public readonly type: "connect" | "inactivity" | "max_duration";
  public readonly elapsedMs: number;

  constructor(
    type: "connect" | "inactivity" | "max_duration",
    elapsedMs: number,
  ) {
    const messages = {
      connect: `Connection timeout after ${elapsedMs}ms`,
      inactivity: `Stream inactivity timeout after ${elapsedMs}ms`,
      max_duration: `Maximum stream duration exceeded (${elapsedMs}ms)`,
    };
    super(messages[type]);
    this.name = "StreamTimeoutError";
    this.type = type;
    this.elapsedMs = elapsedMs;
  }
}

// ============================================
// Timeout-Aware Stream Generator
// ============================================

/**
 * Wraps an async generator with timeout handling
 */
export async function* withStreamTimeouts<T>(
  generator: AsyncGenerator<T, void, unknown>,
  config = STREAM_TIMEOUT_CONFIG,
  signal?: AbortSignal,
): AsyncGenerator<T, void, unknown> {
  const startTime = Date.now();
  let lastActivityTime = startTime;
  let hasReceivedFirstChunk = false;

  // Create abort controller for internal timeout management
  const timeoutController = new AbortController();

  // Link to external signal if provided
  if (signal) {
    signal.addEventListener("abort", () => {
      timeoutController.abort(signal.reason);
    });
  }

  // Max duration timer
  const maxDurationTimer = setTimeout(() => {
    timeoutController.abort(
      new StreamTimeoutError("max_duration", Date.now() - startTime),
    );
  }, config.maxDurationMs);

  // Inactivity timer (reset on each chunk)
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

  const resetInactivityTimer = () => {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    inactivityTimer = setTimeout(() => {
      timeoutController.abort(
        new StreamTimeoutError("inactivity", Date.now() - lastActivityTime),
      );
    }, config.inactivityTimeoutMs);
  };

  // Connect timeout (for first chunk)
  const connectTimer = setTimeout(() => {
    if (!hasReceivedFirstChunk) {
      timeoutController.abort(
        new StreamTimeoutError("connect", Date.now() - startTime),
      );
    }
  }, config.connectTimeoutMs);

  try {
    // Start inactivity timer
    resetInactivityTimer();

    for await (const chunk of generator) {
      // Check if aborted
      if (timeoutController.signal.aborted) {
        const reason = timeoutController.signal.reason;
        if (reason instanceof StreamTimeoutError) {
          throw reason;
        }
        throw new Error("Stream aborted");
      }

      // Mark first chunk received
      if (!hasReceivedFirstChunk) {
        hasReceivedFirstChunk = true;
        clearTimeout(connectTimer);
      }

      // Reset activity timer
      lastActivityTime = Date.now();
      resetInactivityTimer();

      yield chunk;
    }
  } finally {
    // Cleanup timers
    clearTimeout(maxDurationTimer);
    clearTimeout(connectTimer);
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
  }
}

// ============================================
// Abort-Aware Fetch Wrapper
// ============================================

/**
 * Creates an AbortController that respects both client abort and timeout
 */
export function createStreamAbortController(
  clientSignal?: AbortSignal,
  timeoutMs?: number,
): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  // Link client signal
  if (clientSignal) {
    if (clientSignal.aborted) {
      controller.abort(clientSignal.reason);
    } else {
      clientSignal.addEventListener("abort", () => {
        controller.abort(clientSignal.reason);
      });
    }
  }

  // Set timeout if specified
  if (timeoutMs) {
    timeoutId = setTimeout(() => {
      controller.abort(new StreamTimeoutError("max_duration", timeoutMs));
    }, timeoutMs);
  }

  return {
    controller,
    cleanup: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    },
  };
}

// ============================================
// Stream Status Types
// ============================================

export type StreamStatus =
  | "streaming"
  | "done"
  | "cancelled"
  | "timeout"
  | "error";

export interface StreamResult {
  status: StreamStatus;
  text: string;
  error?: string;
  elapsedMs: number;
  timedOut?: boolean;
  cancelled?: boolean;
}

/**
 * Determine final stream status from error
 */
export function getStreamStatusFromError(error: unknown): {
  status: StreamStatus;
  message: string;
} {
  if (error instanceof StreamTimeoutError) {
    return {
      status: "timeout",
      message: error.message,
    };
  }

  if (error instanceof Error) {
    if (error.name === "AbortError" || error.message.includes("abort")) {
      return {
        status: "cancelled",
        message: "Stream was cancelled",
      };
    }
    return {
      status: "error",
      message: error.message,
    };
  }

  return {
    status: "error",
    message: String(error),
  };
}
