import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createLogger,
  createRequestLogger,
  debug,
  error,
  info,
  warn,
} from "@/lib/logger";

describe("logger", () => {
  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("logs at all levels", () => {
    debug("debug message", { key: "value" });
    info("info message", { key: "value" });
    warn("warn message", { key: "value" });
    error("error message", new Error("boom"), { key: "value" });

    expect(console.log).toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("creates child and request loggers", () => {
    const logger = createLogger({ requestId: "req-1" });
    logger.info("hello", { userId: "u1" });

    const requestLogger = createRequestLogger("req-2", "user-2");
    requestLogger.error("failed", new Error("x"));

    expect(console.log).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});
