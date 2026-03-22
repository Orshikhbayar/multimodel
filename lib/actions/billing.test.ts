import { beforeEach, describe, expect, it, vi } from "vitest";

function createThenableTableMock() {
  let result: { data: unknown; error: unknown } = { data: null, error: null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder mock requires flexible typing
  const table: Record<string, (...args: any[]) => any> = {
    select: vi.fn(() => table),
    insert: vi.fn(() => table),
    update: vi.fn(() => table),
    upsert: vi.fn(() => table),
    eq: vi.fn(() => table),
    order: vi.fn(() => table),
    range: vi.fn(() => table),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
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

const {
  mockAuth,
  mockCreateSupabaseAdminClient,
  mockGetIncludedUsageReport,
  mockGetUsdToMntRate,
  mockRpc,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCreateSupabaseAdminClient: vi.fn(),
  mockGetIncludedUsageReport: vi.fn(),
  mockGetUsdToMntRate: vi.fn(async () => ({ usdToMnt: 3500 })),
  mockRpc: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mockCreateSupabaseAdminClient,
}));
vi.mock("@/lib/billing/fx", () => ({
  getUsdToMntRate: mockGetUsdToMntRate,
}));
vi.mock("@/lib/billing/supabaseService", () => ({
  getIncludedUsageReport: mockGetIncludedUsageReport,
  SupabaseBillingUnavailableError: class SupabaseBillingUnavailableError extends Error {
    constructor(message?: string, options?: { cause?: unknown }) {
      super(message);
      if (options?.cause) {
        (this as Error & { cause?: unknown }).cause = options.cause;
      }
    }
  },
}));

import {
  changePlan,
  getBillingSummary,
  getBillingTransactions,
  getIncludedUsage,
  purchaseTopUp,
  setBillingCurrency,
} from "@/lib/actions/billing";

function billingProfile(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "user-1",
    plan_id: "free",
    billing_cadence: "monthly",
    billing_currency: "USD",
    period_start_at: "2026-02-01T00:00:00.000Z",
    period_end_at: "2099-03-01T00:00:00.000Z",
    included_credits_cents: 100,
    top_up_credits_cents: 50,
    bonus_credits_cents: 0,
    ...overrides,
  };
}

describe("billing actions", () => {
  const profiles = createThenableTableMock();
  const ledger = createThenableTableMock();

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "u@example.com", name: "U" },
    });

    mockCreateSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "profiles") return profiles;
        if (table === "credit_ledger_events") return ledger;
        throw new Error(`Unexpected table ${table}`);
      }),
      rpc: mockRpc,
    });

    profiles.setResult({ data: billingProfile(), error: null });
    ledger.setResult({ data: null, error: null });
    mockRpc.mockImplementation((fn: string, args?: Record<string, unknown>) => {
      if (fn === "billing_change_plan_in_app") {
        return Promise.resolve({
          data: billingProfile({
            plan_id: String(args?.p_plan_id ?? "free"),
            billing_cadence: String(args?.p_cadence ?? "monthly"),
            included_credits_cents:
              args?.p_plan_id === "plus"
                ? 700
                : args?.p_plan_id === "pro"
                  ? 1800
                  : args?.p_plan_id === "team"
                    ? 5000
                    : 100,
          }),
          error: null,
        });
      }
      if (fn === "billing_purchase_topup_manual") {
        return Promise.resolve({
          data: billingProfile({
            top_up_credits_cents: 50 + Number(args?.p_credit_delta_int ?? 0),
            billing_currency: String(args?.p_currency ?? "USD"),
          }),
          error: null,
        });
      }
      if (fn === "billing_set_currency") {
        return Promise.resolve({
          data: billingProfile({
            billing_currency: String(args?.p_currency ?? "USD"),
          }),
          error: null,
        });
      }

      return Promise.resolve({ data: null, error: null });
    });
    mockGetIncludedUsageReport.mockResolvedValue({
      periodStartISO: "2026-02-01T00:00:00.000Z",
      periodEndISO: "2026-03-01T00:00:00.000Z",
      usageValueUsdInt: 100,
      billedUsdInt: 20,
      savedUsdInt: 80,
      subscriptionBilledUsdInt: 20,
      overageBilledUsdInt: 0,
      rows: [],
    });
  });

  it("returns billing summary", async () => {
    const summary = await getBillingSummary();

    expect(summary?.currentPlanId).toBe("free");
    expect(summary?.currency).toBe("USD");
  });

  it("returns unlimited tester summary for admin/tester email", async () => {
    vi.stubEnv("ADMIN_EMAIL", "orshikhbayar@gmail.com");
    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "orshikhbayar@gmail.com", name: "U" },
    });

    const summary = await getBillingSummary();
    expect(summary?.currentPlanId).toBe("team");
    expect(summary?.includedCreditsUsd).toBe(1_000_000);
    expect(summary?.dailyTokenCap).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("returns mapped billing transactions", async () => {
    ledger.setResult({
      data: [
        {
          id: "tx1",
          type: "topup_purchase",
          amount_usd_int: 1200,
          credit_delta_int: 1000,
          reference_id: "ref1",
          created_at: "2026-02-20T00:00:00.000Z",
        },
      ],
      error: null,
    });

    const txs = await getBillingTransactions();
    expect(txs).toHaveLength(1);
    expect(txs[0].amountPaid).toBe(12);
  });

  it("changes plan and logs plan_change event", async () => {
    const result = await changePlan({ planId: "plus", cadence: "monthly" });
    expect(result?.currentPlanId).toBe("plus");
    expect(mockRpc).toHaveBeenCalledWith(
      "billing_change_plan_in_app",
      expect.objectContaining({
        p_plan_id: "plus",
        p_cadence: "monthly",
      }),
    );
  });

  it("rejects unknown top-up pack", async () => {
    await expect(
      purchaseTopUp({ packId: "starter", displayCurrency: "USD" }),
    ).rejects.toThrow("Invalid top-up pack");
  });

  it("sets billing currency", async () => {
    const result = await setBillingCurrency("MNT");

    expect(result?.currency).toBe("MNT");
    expect(mockRpc).toHaveBeenCalledWith(
      "billing_set_currency",
      expect.objectContaining({
        p_currency: "MNT",
      }),
    );
  });

  it("returns included usage report", async () => {
    const report = await getIncludedUsage();
    expect(report?.savedUsdInt).toBe(80);
  });

  describe("error path testing", () => {
    it("changePlan throws error when RPC fails", async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === "billing_change_plan_in_app") {
          return Promise.resolve({
            data: null,
            error: { message: "RPC execution failed" },
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      await expect(
        changePlan({ planId: "plus", cadence: "monthly" }),
      ).rejects.toThrow("Failed to change plan");
    });

    it("changePlan returns null when user is not authenticated", async () => {
      mockAuth.mockResolvedValue(null);

      const result = await changePlan({ planId: "plus", cadence: "monthly" });

      expect(result).toBeNull();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("purchaseTopUp throws error for invalid pack", async () => {
      await expect(
        purchaseTopUp({ packId: "starter", displayCurrency: "USD" }),
      ).rejects.toThrow("Invalid top-up pack");
    });

    it("purchaseTopUp returns null when user is not authenticated", async () => {
      mockAuth.mockResolvedValue(null);

      const result = await purchaseTopUp({
        packId: "starter",
        displayCurrency: "USD",
      });

      expect(result).toBeNull();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("setBillingCurrency throws error when RPC fails", async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === "billing_set_currency") {
          return Promise.resolve({
            data: null,
            error: { message: "Invalid currency code" },
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      await expect(setBillingCurrency("INVALID")).rejects.toThrow(
        "Failed to set billing currency",
      );
    });

    it("getBillingTransactions throws error when database query fails", async () => {
      ledger.setResult({
        data: null,
        error: { message: "Database connection timeout" },
      });

      await expect(getBillingTransactions()).rejects.toThrow(
        "Failed to read billing transactions",
      );
    });

    it("getBillingTransactions returns empty array when user is not authenticated", async () => {
      mockAuth.mockResolvedValue(null);

      const txs = await getBillingTransactions();

      expect(txs).toEqual([]);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("changePlan throws error when user billing profile cannot be created", async () => {
      // SELECT must return no profile (data: null, error: null) so the code
      // proceeds to the RPC call that creates the profile. Only the RPC fails.
      profiles.setResult({
        data: null,
        error: null,
      });

      mockRpc.mockImplementation((fn: string) => {
        if (fn === "billing_ensure_profile") {
          return Promise.resolve({
            data: null,
            error: { message: "Database error" },
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      await expect(
        changePlan({ planId: "pro", cadence: "annual" }),
      ).rejects.toThrow("Failed to create billing profile");
    });
  });
});
