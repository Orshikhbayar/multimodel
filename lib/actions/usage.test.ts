import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetAuthenticatedUser,
  mockCreateSupabaseServerClient,
  mockFrom,
  mockSelect,
  mockUpdate,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockCreateSupabaseServerClient: vi.fn(),
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
}));

function makeThenableQuery(result: unknown) {
  const query = {
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    eq: vi.fn(() => query),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected: (reason: unknown) => unknown) =>
      Promise.resolve(result).catch(onRejected),
    finally: (onFinally: () => void) =>
      Promise.resolve(result).finally(onFinally),
  };
  return query;
}

vi.mock("@/lib/supabase/server", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

import { checkQuota, getUsageRecords, getUsageSummary, recordUsage } from "@/lib/actions/usage";

describe("usage actions (supabase)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_DISABLE_SERVER_BILLING", "");
    vi.stubEnv("E2E_AUTH_BYPASS", "");
    vi.stubEnv("NEXT_PUBLIC_DAILY_TOKEN_LIMIT", "2000");

    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "u@example.com",
    });

    mockFrom.mockReturnValue({
      select: mockSelect,
      update: mockUpdate,
    });

    mockCreateSupabaseServerClient.mockResolvedValue({
      from: mockFrom,
    });
  });

  it("returns empty records if unauthenticated", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);
    expect(await getUsageRecords()).toEqual([]);
    expect(mockCreateSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("returns usage records from model_runs", async () => {
    mockSelect.mockReturnValueOnce(
      makeThenableQuery({
        data: [
          {
            id: "run-1",
            model: "openai/gpt-5.2",
            provider: "openai",
            input_tokens: 12,
            output_tokens: 8,
            cost_usd: 0.012,
            created_at: "2026-02-20T10:00:00.000Z",
          },
        ],
        error: null,
      }),
    );

    const records = await getUsageRecords({ limit: 10, offset: 0 });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: "run-1",
      model: "openai/gpt-5.2",
      provider: "openai",
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
      estimatedCostUsd: 0.012,
    });
  });

  it("returns usage summary by aggregating model_runs", async () => {
    mockSelect.mockReturnValueOnce(
      makeThenableQuery({
        data: [
          {
            model: "openai/gpt-5.2",
            input_tokens: 10,
            output_tokens: 5,
            cost_usd: 0.01,
            created_at: "2025-01-01T00:00:00.000Z",
          },
          {
            model: "openai/gpt-5.2",
            input_tokens: 5,
            output_tokens: 5,
            cost_usd: 0.005,
            created_at: "2025-01-01T12:00:00.000Z",
          },
        ],
        error: null,
      }),
    );

    const summary = await getUsageSummary(
      new Date("2025-01-01T00:00:00.000Z"),
      new Date("2025-01-31T23:59:59.999Z"),
    );

    expect(summary?.totalTokens).toBe(25);
    expect(summary?.totalCostUsd).toBeCloseTo(0.015);
    expect(summary?.byModel["openai/gpt-5.2"]?.requestCount).toBe(2);
    expect(summary?.dailyUsage).toHaveLength(1);
  });

  it("returns empty summary when model_runs schema is missing", async () => {
    mockSelect.mockReturnValueOnce(
      makeThenableQuery({
        data: null,
        error: { code: "42P01", message: 'relation "model_runs" does not exist' },
      }),
    );

    const summary = await getUsageSummary(
      new Date("2025-01-01T00:00:00.000Z"),
      new Date("2025-01-31T23:59:59.999Z"),
    );

    expect(summary).toEqual({
      totalTokens: 0,
      totalCostUsd: 0,
      periodStart: new Date("2025-01-01T00:00:00.000Z"),
      periodEnd: new Date("2025-01-31T23:59:59.999Z"),
      byModel: {},
      dailyUsage: [],
    });
  });

  it("checks quota from today's model_runs token usage", async () => {
    mockSelect.mockReturnValueOnce(
      makeThenableQuery({
        data: [
          { input_tokens: 100, output_tokens: 50, created_at: "2026-02-20T09:00:00.000Z" },
          { input_tokens: 70, output_tokens: 30, created_at: "2026-02-20T11:00:00.000Z" },
        ],
        error: null,
      }),
    );

    const quota = await checkQuota();
    expect(quota).toEqual({
      allowed: true,
      remaining: 1750,
      limit: 2000,
      used: 250,
    });
  });

  it("returns unlimited quota for tester/admin email", async () => {
    vi.stubEnv("ADMIN_EMAIL", "orshikhbayar@gmail.com");
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "orshikhbayar@gmail.com",
    });

    const quota = await checkQuota();
    expect(quota).toEqual({
      allowed: true,
      remaining: Number.MAX_SAFE_INTEGER,
      limit: Number.MAX_SAFE_INTEGER,
      used: 0,
    });
    expect(mockCreateSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("records usage by updating model_runs when runId exists", async () => {
    const updateQuery = makeThenableQuery({ data: null, error: null });
    mockUpdate.mockReturnValueOnce(updateQuery);

    const ok = await recordUsage({
      runId: "run-1",
      model: "openai/gpt-4.1",
      promptTokens: 100,
      completionTokens: 50,
    });

    expect(ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: 0.006,
    });
    expect(updateQuery.eq).toHaveBeenCalledWith("id", "run-1");
  });

  it("returns true for recordUsage without runId", async () => {
    const ok = await recordUsage({
      model: "openai/gpt-4.1",
      promptTokens: 100,
      completionTokens: 50,
    });
    expect(ok).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
