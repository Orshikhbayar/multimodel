import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { mockGetUsageSummary, mockCheckQuota } = vi.hoisted(() => ({
  mockGetUsageSummary: vi.fn(),
  mockCheckQuota: vi.fn(),
}));

vi.mock("@/lib/actions/usage", () => ({
  getUsageSummary: () => mockGetUsageSummary(),
  checkQuota: () => mockCheckQuota(),
}));

import { getQuotaStatus, useDbUsage } from "@/lib/hooks/useDbUsage";

describe("useDbUsage", () => {
  it("fetches usage summary and quota on mount", async () => {
    mockGetUsageSummary.mockResolvedValue({ totalTokens: 10 });
    mockCheckQuota.mockResolvedValue({
      allowed: true,
      remaining: 90,
      limit: 100,
      used: 10,
    });

    const { result } = renderHook(() => useDbUsage());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.summary).toEqual({ totalTokens: 10 });
    expect(result.current.quota?.remaining).toBe(90);
  });

  it("surfaces errors from usage fetch", async () => {
    mockGetUsageSummary.mockRejectedValue(new Error("fetch failed"));
    mockCheckQuota.mockResolvedValue({
      allowed: true,
      remaining: 0,
      limit: 0,
      used: 0,
    });

    const { result } = renderHook(() => useDbUsage());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toContain("fetch failed");
  });

  it("computes quota status metadata", () => {
    const status = getQuotaStatus({ remaining: 20, limit: 100, used: 80 });

    expect(status.percentUsed).toBe(80);
    expect(status.isNearLimit).toBe(true);
    expect(status.isOverLimit).toBe(false);
  });
});
