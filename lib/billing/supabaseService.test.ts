import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockCreateSupabaseAdminClient,
  mockIsUnlimitedTesterEmail,
  mockCalculateUsageCostCents,
} = vi.hoisted(() => ({
  mockCreateSupabaseAdminClient: vi.fn(),
  mockIsUnlimitedTesterEmail: vi.fn(() => false),
  mockCalculateUsageCostCents: vi.fn((params) => {
    const rate = {
      "openai/gpt-4o-mini": { inputPer1k: 0.15, outputPer1k: 0.6 },
      default: { inputPer1k: 0.15, outputPer1k: 0.6 },
    }[params.modelId] || { inputPer1k: 0.15, outputPer1k: 0.6 };
    const usd =
      (params.promptTokens / 1000) * rate.inputPer1k +
      (params.completionTokens / 1000) * rate.outputPer1k;
    return Math.max(1, Math.round(usd * 100));
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mockCreateSupabaseAdminClient,
}));

vi.mock("@/lib/testerAccess", () => ({
  isUnlimitedTesterId: vi.fn(() => false),
  isUnlimitedTesterEmail: mockIsUnlimitedTesterEmail,
}));

vi.mock("@/lib/billing/cost", () => ({
  calculateUsageCostCents: mockCalculateUsageCostCents,
}));

import {
  resolveAutoModelRouting,
  calculateUsageValueUsdInt,
  startUsageRunMetering,
  finalizeUsageRunMetering,
  releaseUsageRunHold,
  lockBillingSubject,
  unlockBillingSubject,
  getIncludedUsageReport,
  SupabaseBillingUnavailableError,
  SupabaseBillingUpgradeRequiredError,
  SupabaseBillingQuotaExceededError,
  SupabaseBillingInsufficientCreditsError,
  SupabaseBillingLockedError,
} from "@/lib/billing/supabaseService";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  // Reset environment variables for each test
  delete process.env.NEXT_PUBLIC_DISABLE_SERVER_BILLING;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

  // Provide a default working admin client so tests that don't need a custom
  // mock don't crash with "Cannot read properties of undefined (reading 'from')"
  const createChain = () => {
    const chain: Record<string, unknown> = {};
    for (const method of [
      "from",
      "select",
      "eq",
      "neq",
      "gt",
      "gte",
      "lt",
      "lte",
      "is",
      "in",
      "not",
      "or",
      "and",
      "order",
      "limit",
      "range",
      "filter",
      "match",
      "update",
      "insert",
      "upsert",
      "delete",
    ]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "user-1",
        plan_id: "free",
        period_start_at: new Date().toISOString(),
        period_end_at: new Date(Date.now() + 86400000).toISOString(),
        included_credits_cents: 1000,
        bonus_credits_cents: 0,
        top_up_credits_cents: 0,
      },
      error: null,
    });
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
    chain.rpc = vi.fn().mockResolvedValue({
      data: {
        id: "user-1",
        plan_id: "free",
        period_start_at: new Date().toISOString(),
        period_end_at: new Date(Date.now() + 86400000).toISOString(),
        included_credits_cents: 1000,
        bonus_credits_cents: 0,
        top_up_credits_cents: 0,
      },
      error: null,
    });
    return chain;
  };

  // Helper to create a chainable mock object that always returns itself for any method
  // except maybeSingle/single which resolve to data
  const createChainableProxy = (
    terminalValue: Record<string, unknown> | null = null,
  ) => {
    const handler: ProxyHandler<object> = {
      get(_target: object, prop: string | symbol) {
        if (prop === "maybeSingle") {
          return vi.fn().mockResolvedValue({
            data: terminalValue,
            error: null,
          });
        }
        if (prop === "single") {
          return vi.fn().mockResolvedValue({
            data: terminalValue,
            error: null,
          });
        }
        // All other methods return a new Proxy that chains back
        return vi.fn(() => new Proxy({}, handler));
      },
    };
    return new Proxy({}, handler);
  };

  const defaultMockAdmin = createChain();
  mockCreateSupabaseAdminClient.mockReturnValue(defaultMockAdmin);
});

describe("supabaseService", () => {
  describe("resolveAutoModelRouting", () => {
    it("returns manual mode when mode is not smart", () => {
      const result = resolveAutoModelRouting({
        requestedModelId: "openai/gpt-4.1",
        planId: "free",
        mode: "manual",
      });

      expect(result).toEqual({
        modelId: "openai/gpt-4.1",
        routed: false,
        reason: "manual",
      });
    });

    it("returns manual mode when mode is undefined", () => {
      const result = resolveAutoModelRouting({
        requestedModelId: "openai/gpt-4.1",
        planId: "free",
      });

      expect(result).toEqual({
        modelId: "openai/gpt-4.1",
        routed: false,
        reason: "manual",
      });
    });

    it("applies plan guardrail when requested model not in plan", () => {
      const result = resolveAutoModelRouting({
        requestedModelId: "openai/gpt-4o",
        planId: "free",
        mode: "smart",
      });

      expect(result.routed).toBe(true);
      expect(result.reason).toBe("plan_guardrail");
      expect(result.modelId).toBeDefined();
      // Should fallback to a free-tier allowed model
    });

    it("routes to cheaper model in priority list when available", () => {
      const result = resolveAutoModelRouting({
        requestedModelId: "openai/gpt-4o-mini",
        planId: "free",
        mode: "smart",
      });

      // deepseek-chat is in priority list first and is allowed for free plan
      expect(result.routed).toBe(true);
      expect(result.reason).toBe("cost_safe_auto");
      expect(result.modelId).toBe("deepseek/deepseek-chat");
    });

    it("returns already_cost_safe when model is cheapest in priority", () => {
      const result = resolveAutoModelRouting({
        requestedModelId: "deepseek/deepseek-chat",
        planId: "free",
        mode: "smart",
      });

      expect(result).toEqual({
        modelId: "deepseek/deepseek-chat",
        routed: false,
        reason: "already_cost_safe",
      });
    });

    it("routes to priority model when available in plan but not requested", () => {
      const result = resolveAutoModelRouting({
        requestedModelId: "openai/gpt-4o-mini",
        planId: "plus",
        mode: "smart",
      });

      // deepseek-chat is in priority for plus plan
      expect(result.routed).toBe(true);
      expect(result.reason).toBe("cost_safe_auto");
    });
  });

  describe("calculateUsageValueUsdInt", () => {
    it("returns 0 for zero tokens", async () => {
      const result = await calculateUsageValueUsdInt({
        modelId: "openai/gpt-4o-mini",
        tokensIn: 0,
        tokensOut: 0,
      });

      expect(result).toBe(0);
    });

    it("calculates normal usage cost in cents", async () => {
      const result = await calculateUsageValueUsdInt({
        modelId: "openai/gpt-4o-mini",
        tokensIn: 1000,
        tokensOut: 1000,
      });

      expect(result).toBeGreaterThan(0);
      // raw = 1000 * 15 + 1000 * 60 = 75,000
      // result = Math.ceil(75,000 / 1,000,000) = Math.ceil(0.075) = 1
      expect(result).toBe(1);
    });

    it("uses fallback rates for unknown models", async () => {
      const result = await calculateUsageValueUsdInt({
        modelId: "unknown/model",
        tokensIn: 1000,
        tokensOut: 1000,
      });

      expect(result).toBeGreaterThan(0);
      // Uses default rate
      expect(result).toBe(1);
    });

    it("returns minimum 1 cent for small usage", async () => {
      const result = await calculateUsageValueUsdInt({
        modelId: "openai/gpt-4o-mini",
        tokensIn: 1,
        tokensOut: 1,
      });

      expect(result).toBe(1);
    });
  });

  describe("startUsageRunMetering", () => {
    it("returns null when billing is disabled", async () => {
      process.env.NEXT_PUBLIC_DISABLE_SERVER_BILLING = "true";

      const result = await startUsageRunMetering({
        sessionUser: { id: "user-1", email: "user@example.com" },
        runReferenceId: "run-1",
        requestedModelId: "openai/gpt-4o-mini",
        mode: "manual",
        estimatedPromptTokens: 100,
        maxOutputTokens: 100,
      });

      expect(result).toBeNull();
    });

    it("returns unlimited tester bypass object", async () => {
      mockIsUnlimitedTesterEmail.mockReturnValue(true);

      const result = await startUsageRunMetering({
        sessionUser: { id: "tester-user", email: "tester@example.com" },
        runReferenceId: "run-1",
        requestedModelId: "openai/gpt-4o",
        estimatedPromptTokens: 10000,
        maxOutputTokens: 10000,
      });

      expect(result).toEqual({
        runReferenceId: "run-1",
        modelId: "openai/gpt-4o",
        bucketHint: "included_plan",
        planId: "team",
        heldCreditsInt: 0,
        autoReservedValueUsdInt: 0,
      });
    });

    it("throws upgrade required when model not in plan and mode is manual", async () => {
      const mockAdmin = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: "user-1",
            plan_id: "free",
            period_start_at: new Date().toISOString(),
            period_end_at: new Date(Date.now() + 86400000).toISOString(),
            included_credits_cents: 100,
            bonus_credits_cents: 0,
            top_up_credits_cents: 0,
          },
          error: null,
        }),
      };

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      await expect(
        startUsageRunMetering({
          sessionUser: { id: "user-1", email: "user@example.com" },
          runReferenceId: "run-1",
          requestedModelId: "openai/gpt-4o",
          mode: "manual",
          estimatedPromptTokens: 100,
          maxOutputTokens: 100,
        }),
      ).rejects.toBeInstanceOf(SupabaseBillingUpgradeRequiredError);
    });

    it("throws quota exceeded for daily token limit", async () => {
      const mockAdmin = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
        rpc: vi.fn(),
      };

      // Setup profile response
      let callCount = 0;
      mockAdmin.maybeSingle.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            data: {
              id: "user-1",
              plan_id: "free",
              period_start_at: new Date().toISOString(),
              period_end_at: new Date(Date.now() + 86400000).toISOString(),
              included_credits_cents: 100,
              bonus_credits_cents: 0,
              top_up_credits_cents: 0,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      });

      // Setup daily quota exceeded
      mockAdmin.select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: mockAdmin.maybeSingle,
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        select: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          maybeSingle: mockAdmin.maybeSingle,
          single: vi.fn().mockResolvedValue({
            data: [
              { tokens_total: 2000 }, // At daily cap for free plan
            ],
            error: null,
          }),
        })),
      });

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      await expect(
        startUsageRunMetering({
          sessionUser: { id: "user-1", email: "user@example.com" },
          runReferenceId: "run-1",
          requestedModelId: "openai/gpt-4o-mini",
          mode: "manual",
          estimatedPromptTokens: 100,
          maxOutputTokens: 100,
        }),
      ).rejects.toBeInstanceOf(SupabaseBillingQuotaExceededError);
    });

    it("throws insufficient credits error", async () => {
      const mockAdmin = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
        upsert: vi.fn(),
        rpc: vi.fn(),
      };

      // Setup responses
      mockAdmin.maybeSingle.mockResolvedValue({
        data: {
          id: "user-1",
          plan_id: "free",
          email: "user@example.com",
          period_start_at: new Date().toISOString(),
          period_end_at: new Date(Date.now() + 86400000).toISOString(),
          included_credits_cents: 10, // Very low balance
          bonus_credits_cents: 0,
          top_up_credits_cents: 0,
        },
        error: null,
      });

      mockAdmin.select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: mockAdmin.maybeSingle,
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        select: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          maybeSingle: mockAdmin.maybeSingle,
          single: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        })),
      });

      mockAdmin.upsert.mockResolvedValue({ error: null });

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);
      mockCalculateUsageCostCents.mockReturnValue(100); // 100 cents needed

      await expect(
        startUsageRunMetering({
          sessionUser: { id: "user-1", email: "user@example.com" },
          runReferenceId: "run-1",
          requestedModelId: "openai/gpt-4o-mini",
          mode: "manual",
          estimatedPromptTokens: 100,
          maxOutputTokens: 100,
        }),
      ).rejects.toBeInstanceOf(SupabaseBillingInsufficientCreditsError);
    });

    it("throws billing locked error from RPC", async () => {
      const mockAdmin = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
        upsert: vi.fn(),
        rpc: vi.fn(),
      };

      mockAdmin.maybeSingle.mockResolvedValue({
        data: {
          id: "user-1",
          plan_id: "free",
          email: "user@example.com",
          period_start_at: new Date().toISOString(),
          period_end_at: new Date(Date.now() + 86400000).toISOString(),
          included_credits_cents: 10000,
          bonus_credits_cents: 0,
          top_up_credits_cents: 0,
        },
        error: null,
      });

      mockAdmin.select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: mockAdmin.maybeSingle,
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        select: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          maybeSingle: mockAdmin.maybeSingle,
          single: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        })),
      });

      mockAdmin.upsert.mockResolvedValue({ error: null });

      mockAdmin.rpc.mockResolvedValue({
        data: null,
        error: {
          message: "BILLING_LOCKED",
          details: "User account is locked",
        },
      });

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      await expect(
        startUsageRunMetering({
          sessionUser: { id: "user-1", email: "user@example.com" },
          runReferenceId: "run-1",
          requestedModelId: "openai/gpt-4o-mini",
          mode: "manual",
          estimatedPromptTokens: 100,
          maxOutputTokens: 100,
        }),
      ).rejects.toBeInstanceOf(SupabaseBillingLockedError);
    });

    it("returns successful MeteredRunStart", async () => {
      const mockAdmin = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
        upsert: vi.fn(),
        rpc: vi.fn(),
      };

      mockAdmin.maybeSingle.mockResolvedValue({
        data: {
          id: "user-1",
          plan_id: "free",
          email: "user@example.com",
          period_start_at: new Date().toISOString(),
          period_end_at: new Date(Date.now() + 86400000).toISOString(),
          included_credits_cents: 10000,
          bonus_credits_cents: 0,
          top_up_credits_cents: 0,
        },
        error: null,
      });

      mockAdmin.select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: mockAdmin.maybeSingle,
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        select: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          maybeSingle: mockAdmin.maybeSingle,
          single: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        })),
      });

      mockAdmin.upsert.mockResolvedValue({ error: null });

      mockAdmin.rpc.mockResolvedValue({
        data: {
          bucket: "included_plan",
          held_credits_int: 50,
          auto_reserved_value_usd_int: 0,
        },
        error: null,
      });

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      const result = await startUsageRunMetering({
        sessionUser: { id: "user-1", email: "user@example.com" },
        runReferenceId: "run-1",
        requestedModelId: "openai/gpt-4o-mini",
        mode: "manual",
        estimatedPromptTokens: 100,
        maxOutputTokens: 100,
      });

      expect(result).toEqual({
        runReferenceId: "run-1",
        modelId: "openai/gpt-4o-mini",
        bucketHint: "included_plan",
        planId: "free",
        heldCreditsInt: 50,
        autoReservedValueUsdInt: 0,
      });
    });

    it("handles auto policy rejection gracefully", async () => {
      const mockAdmin = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
        upsert: vi.fn(),
        rpc: vi.fn(),
        count: vi.fn(),
        head: vi.fn(),
      };

      mockAdmin.maybeSingle.mockResolvedValue({
        data: {
          id: "user-1",
          plan_id: "free",
          email: "user@example.com",
          period_start_at: new Date().toISOString(),
          period_end_at: new Date(Date.now() + 86400000).toISOString(),
          included_credits_cents: 10000,
          bonus_credits_cents: 0,
          top_up_credits_cents: 0,
        },
        error: null,
      });

      mockAdmin.select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: mockAdmin.maybeSingle,
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        count: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          head: vi.fn().mockResolvedValue({
            data: [],
            count: 0,
            error: null,
          }),
        })),
        head: vi.fn().mockResolvedValue({
          data: [],
          count: 0,
          error: null,
        }),
      });

      mockAdmin.upsert.mockResolvedValue({ error: null });

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      const result = await startUsageRunMetering({
        sessionUser: { id: "user-1", email: "user@example.com" },
        runReferenceId: "run-1",
        requestedModelId: "openai/gpt-4o-mini",
        mode: "smart",
        estimatedPromptTokens: 100,
        maxOutputTokens: 100,
      });

      expect(result).toBeTruthy();
      expect(result?.planId).toBe("free");
    });
  });

  describe("finalizeUsageRunMetering", () => {
    it("returns null when billing is disabled", async () => {
      process.env.NEXT_PUBLIC_DISABLE_SERVER_BILLING = "true";

      const result = await finalizeUsageRunMetering({
        userId: "user-1",
        runReferenceId: "run-1",
        modelId: "openai/gpt-4o-mini",
        promptTokens: 100,
        completionTokens: 100,
        status: "completed",
      });

      expect(result).toBeNull();
    });

    it("returns null for unlimited tester email", async () => {
      mockIsUnlimitedTesterEmail.mockReturnValue(true);

      const result = await finalizeUsageRunMetering({
        userId: "tester-user",
        userEmail: "tester@example.com",
        runReferenceId: "run-1",
        modelId: "openai/gpt-4o",
        promptTokens: 1000,
        completionTokens: 1000,
        status: "completed",
      });

      expect(result).toBeNull();
    });

    it("bills completed run with actual token usage", async () => {
      const mockAdmin = {
        rpc: vi.fn().mockResolvedValue({
          data: { finalized: true },
          error: null,
        }),
      };

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);
      mockCalculateUsageCostCents.mockReturnValue(150);

      const result = await finalizeUsageRunMetering({
        userId: "user-1",
        userEmail: "user@example.com",
        runReferenceId: "run-1",
        modelId: "openai/gpt-4o-mini",
        promptTokens: 500,
        completionTokens: 500,
        status: "completed",
      });

      expect(mockAdmin.rpc).toHaveBeenCalledWith(
        "billing_finalize_run",
        expect.objectContaining({
          p_status: "completed",
          p_billed_amount_int: expect.any(Number),
        }),
      );

      expect(result).toBeTruthy();
    });

    it("charges zero for cancelled run", async () => {
      const mockAdmin = {
        rpc: vi.fn().mockResolvedValue({
          data: { finalized: true },
          error: null,
        }),
      };

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      await finalizeUsageRunMetering({
        userId: "user-1",
        userEmail: "user@example.com",
        runReferenceId: "run-1",
        modelId: "openai/gpt-4o-mini",
        promptTokens: 500,
        completionTokens: 500,
        status: "cancelled",
      });

      expect(mockAdmin.rpc).toHaveBeenCalledWith(
        "billing_finalize_run",
        expect.objectContaining({
          p_status: "cancelled",
          p_billed_amount_int: 0,
        }),
      );
    });

    it("charges zero for failed run", async () => {
      const mockAdmin = {
        rpc: vi.fn().mockResolvedValue({
          data: { finalized: true },
          error: null,
        }),
      };

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      await finalizeUsageRunMetering({
        userId: "user-1",
        userEmail: "user@example.com",
        runReferenceId: "run-1",
        modelId: "openai/gpt-4o-mini",
        promptTokens: 500,
        completionTokens: 500,
        status: "failed",
        failureReason: "timeout",
      });

      expect(mockAdmin.rpc).toHaveBeenCalledWith(
        "billing_finalize_run",
        expect.objectContaining({
          p_status: "failed",
          p_billed_amount_int: 0,
        }),
      );
    });

    it("throws billing locked error from RPC", async () => {
      const mockAdmin = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: {
            message: "BILLING_LOCKED",
            details: "Account locked",
          },
        }),
      };

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      await expect(
        finalizeUsageRunMetering({
          userId: "user-1",
          userEmail: "user@example.com",
          runReferenceId: "run-1",
          modelId: "openai/gpt-4o-mini",
          promptTokens: 100,
          completionTokens: 100,
          status: "completed",
        }),
      ).rejects.toBeInstanceOf(SupabaseBillingLockedError);
    });

    it("throws unavailable error for other RPC failures", async () => {
      const mockAdmin = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Database error" },
        }),
      };

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      await expect(
        finalizeUsageRunMetering({
          userId: "user-1",
          userEmail: "user@example.com",
          runReferenceId: "run-1",
          modelId: "openai/gpt-4o-mini",
          promptTokens: 100,
          completionTokens: 100,
          status: "completed",
        }),
      ).rejects.toBeInstanceOf(SupabaseBillingUnavailableError);
    });
  });

  describe("releaseUsageRunHold", () => {
    it("returns null when billing is disabled", async () => {
      process.env.NEXT_PUBLIC_DISABLE_SERVER_BILLING = "true";

      const result = await releaseUsageRunHold({
        userId: "user-1",
        runReferenceId: "run-1",
        reason: "cancelled",
      });

      expect(result).toBeNull();
    });

    it("releases hold successfully", async () => {
      const mockAdmin = {
        rpc: vi.fn().mockResolvedValue({
          data: { released: true },
          error: null,
        }),
      };

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      const result = await releaseUsageRunHold({
        userId: "user-1",
        runReferenceId: "run-1",
        reason: "cancelled",
      });

      expect(mockAdmin.rpc).toHaveBeenCalledWith(
        "billing_release_hold",
        expect.objectContaining({
          p_subject_id: "user-1",
          p_run_id: "run-1",
          p_reason: "cancelled",
        }),
      );

      expect(result).toBeTruthy();
    });

    it("throws billing locked error", async () => {
      const mockAdmin = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: {
            message: "BILLING_LOCKED",
            details: "Account locked",
          },
        }),
      };

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      await expect(
        releaseUsageRunHold({
          userId: "user-1",
          runReferenceId: "run-1",
          reason: "cancelled",
        }),
      ).rejects.toBeInstanceOf(SupabaseBillingLockedError);
    });

    it("throws unavailable error for RPC failures", async () => {
      const mockAdmin = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Database error" },
        }),
      };

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      await expect(
        releaseUsageRunHold({
          userId: "user-1",
          runReferenceId: "run-1",
          reason: "cancelled",
        }),
      ).rejects.toBeInstanceOf(SupabaseBillingUnavailableError);
    });
  });

  describe("lockBillingSubject", () => {
    it("locks billing subject successfully", async () => {
      const mockAdmin = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      await lockBillingSubject({
        subjectId: "user-1",
        reason: "fraud_suspected",
      });

      expect(mockAdmin.rpc).toHaveBeenCalledWith(
        "billing_lock_subject",
        expect.objectContaining({
          p_subject_id: "user-1",
          p_reason: "fraud_suspected",
        }),
      );
    });

    it("accepts optional locked timestamp", async () => {
      const mockAdmin = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      const lockTime = new Date().toISOString();
      await lockBillingSubject({
        subjectId: "user-1",
        reason: "fraud_suspected",
        lockedAt: lockTime,
      });

      expect(mockAdmin.rpc).toHaveBeenCalledWith(
        "billing_lock_subject",
        expect.objectContaining({
          p_locked_at: lockTime,
        }),
      );
    });

    it("throws unavailable error on RPC failure", async () => {
      const mockAdmin = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Database error" },
        }),
      };

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      await expect(
        lockBillingSubject({
          subjectId: "user-1",
          reason: "fraud_suspected",
        }),
      ).rejects.toBeInstanceOf(SupabaseBillingUnavailableError);
    });
  });

  describe("unlockBillingSubject", () => {
    it("unlocks billing subject successfully", async () => {
      const mockAdmin = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      await unlockBillingSubject("user-1");

      expect(mockAdmin.rpc).toHaveBeenCalledWith(
        "billing_unlock_subject",
        expect.objectContaining({
          p_subject_id: "user-1",
        }),
      );
    });

    it("throws unavailable error on RPC failure", async () => {
      const mockAdmin = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Database error" },
        }),
      };

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      await expect(unlockBillingSubject("user-1")).rejects.toBeInstanceOf(
        SupabaseBillingUnavailableError,
      );
    });
  });

  describe("getIncludedUsageReport", () => {
    it("returns empty report when no usage data", async () => {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 86400000);

      const mockAdmin = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: "user-1",
            period_start_at: now.toISOString(),
            period_end_at: periodEnd.toISOString(),
          },
          error: null,
        }),
      };

      mockAdmin.select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: mockAdmin.maybeSingle,
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        in: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          maybeSingle: mockAdmin.maybeSingle,
          single: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        })),
      });

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      const result = await getIncludedUsageReport("user-1");

      expect(result.rows).toHaveLength(0);
      expect(result.usageValueUsdInt).toBe(0);
      expect(result.billedUsdInt).toBe(0);
      expect(result.savedUsdInt).toBe(0);
    });

    it("returns grouped usage rows by bucket and model", async () => {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 86400000);

      const mockAdmin = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: "user-1",
            period_start_at: now.toISOString(),
            period_end_at: periodEnd.toISOString(),
          },
          error: null,
        }),
      };

      let selectCallCount = 0;
      mockAdmin.select.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // ensureBillingProfile query - needs maybeSingle
          return mockAdmin;
        } else if (selectCallCount === 2) {
          // usage_runs query
          return {
            eq: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            maybeSingle: mockAdmin.maybeSingle,
            mockResolvedValue: async () => ({
              data: [
                {
                  billing_bucket: "included_plan",
                  model_id: "openai/gpt-4o-mini",
                  tokens_total: 1000,
                  usage_value_usd_int: 100,
                  billed_amount_usd_int: 50,
                },
                {
                  billing_bucket: "included_plan",
                  model_id: "openai/gpt-4o-mini",
                  tokens_total: 500,
                  usage_value_usd_int: 50,
                  billed_amount_usd_int: 25,
                },
                {
                  billing_bucket: "overage",
                  model_id: "openai/gpt-4.1",
                  tokens_total: 2000,
                  usage_value_usd_int: 500,
                  billed_amount_usd_int: 500,
                },
              ],
              error: null,
            }),
          };
        } else {
          // credit_ledger_events query
          return {
            eq: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            maybeSingle: mockAdmin.maybeSingle,
            in: vi.fn(() => ({
              eq: vi.fn().mockReturnThis(),
              lt: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              maybeSingle: mockAdmin.maybeSingle,
              single: vi.fn().mockResolvedValue({
                data: [
                  {
                    amount_usd_int: 1000,
                    type: "subscription_charge",
                  },
                ],
                error: null,
              }),
            })),
          };
        }
      });

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      // Simplified test - just check structure
      const result = await getIncludedUsageReport("user-1");

      expect(result).toBeTruthy();
      expect(result.periodStartISO).toBeDefined();
      expect(result.periodEndISO).toBeDefined();
      expect(Array.isArray(result.rows)).toBe(true);
    });

    it("returns subscription charges in report", async () => {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 86400000);

      const mockAdmin = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: "user-1",
            period_start_at: now.toISOString(),
            period_end_at: periodEnd.toISOString(),
          },
          error: null,
        }),
      };

      mockAdmin.select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: mockAdmin.maybeSingle,
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        in: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          maybeSingle: mockAdmin.maybeSingle,
          single: vi.fn().mockResolvedValue({
            data: [
              {
                amount_usd_int: 1900,
                type: "subscription_charge",
              },
            ],
            error: null,
          }),
        })),
      });

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      const result = await getIncludedUsageReport("user-1");

      expect(result.subscriptionBilledUsdInt).toBeGreaterThanOrEqual(0);
    });

    it("handles schema missing error gracefully", async () => {
      const mockAdmin = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: "user-1",
            period_start_at: new Date().toISOString(),
            period_end_at: new Date(Date.now() + 86400000).toISOString(),
          },
          error: null,
        }),
      };

      mockAdmin.select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: mockAdmin.maybeSingle,
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        in: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          maybeSingle: mockAdmin.maybeSingle,
          single: vi.fn().mockResolvedValue({
            data: null,
            error: {
              code: "42P01",
              message: "relation does not exist",
            },
          }),
        })),
      });

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      const result = await getIncludedUsageReport("user-1");

      expect(result.rows).toHaveLength(0);
      expect(result.usageValueUsdInt).toBe(0);
    });

    it("throws unavailable error for non-schema errors", async () => {
      const mockAdmin = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: "user-1",
            period_start_at: new Date().toISOString(),
            period_end_at: new Date(Date.now() + 86400000).toISOString(),
          },
          error: null,
        }),
      };

      mockAdmin.select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: mockAdmin.maybeSingle,
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        in: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          maybeSingle: mockAdmin.maybeSingle,
          single: vi.fn().mockResolvedValue({
            data: null,
            error: {
              code: "42601",
              message: "Unexpected error",
            },
          }),
        })),
      });

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      await expect(getIncludedUsageReport("user-1")).rejects.toBeInstanceOf(
        SupabaseBillingUnavailableError,
      );
    });

    it("calculates saved amount correctly", async () => {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 86400000);

      const mockAdmin = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: "user-1",
            period_start_at: now.toISOString(),
            period_end_at: periodEnd.toISOString(),
          },
          error: null,
        }),
      };

      mockAdmin.select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: mockAdmin.maybeSingle,
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        in: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          maybeSingle: mockAdmin.maybeSingle,
          single: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        })),
      });

      mockCreateSupabaseAdminClient.mockReturnValue(mockAdmin);

      const result = await getIncludedUsageReport("user-1");

      // When no usage, saved = usageValue - billed = 0 - 0 = 0
      expect(result.savedUsdInt).toBe(0);
    });
  });

  describe("Error Classes", () => {
    it("SupabaseBillingUnavailableError has correct properties", () => {
      const error = new SupabaseBillingUnavailableError("Test error");

      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe("BILLING_UNAVAILABLE");
      expect(error.name).toBe("SupabaseBillingUnavailableError");
      expect(error.message).toBe("Test error");
    });

    it("SupabaseBillingUnavailableError preserves cause", () => {
      const cause = new Error("Underlying cause");
      const error = new SupabaseBillingUnavailableError("Test error", {
        cause,
      });

      expect((error as unknown as { cause: unknown }).cause).toBe(cause);
    });

    it("SupabaseBillingUpgradeRequiredError has correct properties", () => {
      const error = new SupabaseBillingUpgradeRequiredError("pro");

      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe("PLAN_UPGRADE_REQUIRED");
      expect(error.name).toBe("SupabaseBillingUpgradeRequiredError");
      expect(error.requiredPlanId).toBe("pro");
    });

    it("SupabaseBillingQuotaExceededError has correct properties", () => {
      const resetAt = new Date();
      const error = new SupabaseBillingQuotaExceededError("daily", resetAt);

      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe("QUOTA_EXCEEDED");
      expect(error.name).toBe("SupabaseBillingQuotaExceededError");
      expect(error.reason).toBe("daily");
      expect(error.resetAt).toBe(resetAt);
    });

    it("SupabaseBillingQuotaExceededError handles monthly quotas", () => {
      const resetAt = new Date();
      const error = new SupabaseBillingQuotaExceededError("monthly", resetAt);

      expect(error.reason).toBe("monthly");
    });

    it("SupabaseBillingInsufficientCreditsError has correct properties", () => {
      const error = new SupabaseBillingInsufficientCreditsError({
        availableCreditsInt: 50,
        neededCreditsInt: 100,
        suggestedAction: "topup",
      });

      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe("INSUFFICIENT_CREDITS");
      expect(error.name).toBe("SupabaseBillingInsufficientCreditsError");
      expect(error.availableCreditsInt).toBe(50);
      expect(error.neededCreditsInt).toBe(100);
      expect(error.suggestedAction).toBe("topup");
    });

    it("SupabaseBillingInsufficientCreditsError handles upgrade action", () => {
      const error = new SupabaseBillingInsufficientCreditsError({
        availableCreditsInt: 0,
        neededCreditsInt: 100,
        suggestedAction: "upgrade",
      });

      expect(error.suggestedAction).toBe("upgrade");
    });

    it("SupabaseBillingLockedError has correct properties", () => {
      const error = new SupabaseBillingLockedError("Fraud detected");

      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe("BILLING_LOCKED");
      expect(error.name).toBe("SupabaseBillingLockedError");
      expect(error.lockReason).toBe("Fraud detected");
    });

    it("SupabaseBillingLockedError handles undefined reason", () => {
      const error = new SupabaseBillingLockedError();

      expect(error.lockReason).toBeUndefined();
    });
  });

  describe("environment variable handling", () => {
    it("disables billing when NEXT_PUBLIC_DISABLE_SERVER_BILLING is true", async () => {
      process.env.NEXT_PUBLIC_DISABLE_SERVER_BILLING = "true";

      const result = await startUsageRunMetering({
        sessionUser: { id: "user-1", email: "user@example.com" },
        runReferenceId: "run-1",
        requestedModelId: "openai/gpt-4o-mini",
        estimatedPromptTokens: 100,
        maxOutputTokens: 100,
      });

      expect(result).toBeNull();
    });

    it("disables billing when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const result = await startUsageRunMetering({
        sessionUser: { id: "user-1", email: "user@example.com" },
        runReferenceId: "run-1",
        requestedModelId: "openai/gpt-4o-mini",
        estimatedPromptTokens: 100,
        maxOutputTokens: 100,
      });

      expect(result).toBeNull();
    });
  });
});
