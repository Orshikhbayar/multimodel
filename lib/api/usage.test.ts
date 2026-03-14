import { beforeEach, describe, expect, it, vi } from "vitest";

function createThenableTableMock() {
  let result: { data: unknown; error: unknown } = { data: null, error: null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder mock requires flexible typing
  const table: Record<string, (...args: any[]) => any> = {
    select: vi.fn(() => table),
    upsert: vi.fn(async () => result),
    eq: vi.fn(() => table),
    gte: vi.fn(() => table),
    lt: vi.fn(() => table),
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
    setResult: (next: { data: unknown; error: unknown }) => {
      result = next;
    },
  };

  return table;
}

const { mockCreateSupabaseAdminClient } = vi.hoisted(() => ({
  mockCreateSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mockCreateSupabaseAdminClient,
}));

import {
  calculateCost,
  checkUserQuota,
  recordUserUsage,
} from "@/lib/api/usage";

describe("api usage helpers", () => {
  const usageRuns = createThenableTableMock();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "usage_runs") return usageRuns;
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    usageRuns.setResult({ data: [], error: null });
  });

  it("calculates model cost", () => {
    expect(calculateCost("gpt-4o", 1000, 1000)).toBeGreaterThan(0);
  });

  it("checks user daily quota", async () => {
    usageRuns.setResult({
      data: [{ tokens_total: 1200 }, { tokens_total: 300 }],
      error: null,
    });

    const quota = await checkUserQuota("user-1", "free");

    expect(quota.limit).toBe(100_000);
    expect(quota.used).toBe(1500);
    expect(quota.allowed).toBe(true);
  });

  it("records usage with an upserted run", async () => {
    await recordUserUsage({
      userId: "user-1",
      runId: "run-1",
      model: "gpt-4o",
      promptTokens: 100,
      completionTokens: 50,
    });

    expect(usageRuns.upsert).toHaveBeenCalledTimes(1);
  });
});
