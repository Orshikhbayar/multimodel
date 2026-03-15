import { beforeEach, describe, expect, it, vi } from "vitest";

import Metrics, {
  flushMetrics,
  getMetricsSummary,
  gauge,
  increment,
  resetMetrics,
  timing,
} from "@/lib/metrics";

describe("metrics", () => {
  beforeEach(() => {
    resetMetrics();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("collects timing, counter and gauge data", () => {
    timing("latency", 10, { endpoint: "/api" });
    increment("counter", 2, { endpoint: "/api" });
    gauge("active", 3, { endpoint: "/api" });

    const summary = getMetricsSummary();
    expect(Object.keys(summary).length).toBeGreaterThan(0);
  });

  it("exposes predefined metrics helpers", () => {
    Metrics.apiRequestCount({ endpoint: "/api/chat", status: 200 });
    Metrics.apiRequestDuration(12, { endpoint: "/api/chat", status: 200 });
    Metrics.apiError({ endpoint: "/api/chat", errorType: "timeout" });

    expect(getMetricsSummary()).toBeTruthy();
  });

  it("flushes summary without throwing", () => {
    increment("flushable", 1);
    expect(() => flushMetrics()).not.toThrow();
  });
});
