import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import {
  calculateUsageValueUsdInt,
  resolveAutoModelRouting,
  getIncludedUsageReport,
} from "@/lib/billing/supabaseService";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasSupabase = Boolean(supabaseUrl && supabaseServiceRoleKey);
const describeIfSupabase = hasSupabase ? describe : describe.skip;

let supabase: SupabaseClient<Database>;

describeIfSupabase("billing integration", () => {
  beforeAll(() => {
    supabase = createClient<Database>(supabaseUrl!, supabaseServiceRoleKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  });

  it("ensures billing profile is created for a new user", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `billing-test-${unique}@example.com`;

    const createUserResult = await supabase.auth.admin.createUser({
      email,
      password: `IntTest-${unique}-A1!`,
      email_confirm: true,
    });

    expect(createUserResult.error).toBeNull();
    const userId = createUserResult.data.user?.id;
    expect(userId).toBeTruthy();

    try {
      // Check that profile is created via the RPC function
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id,plan_id,billing_cadence,billing_currency,period_start_at,period_end_at,included_credits_cents,top_up_credits_cents,bonus_credits_cents",
        )
        .eq("id", userId!)
        .maybeSingle();

      // If profile doesn't exist, call the RPC to create it
      if (!profile && !profileError) {
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          "billing_ensure_profile",
          {
            p_subject_id: userId,
            p_email: email,
          },
        );

        expect(rpcError).toBeNull();
        expect(rpcResult).toBeTruthy();
        expect(rpcResult.plan_id).toBe("free");
        expect(rpcResult.billing_cadence).toBe("monthly");
        expect(rpcResult.billing_currency).toBe("USD");
        expect(rpcResult.included_credits_cents).toBeGreaterThan(0);
        expect(rpcResult.top_up_credits_cents).toBe(0);
      } else {
        expect(profileError).toBeNull();
        expect(profile).toBeTruthy();
        expect(profile?.plan_id).toBe("free");
      }
    } finally {
      if (userId) {
        await supabase.auth.admin.deleteUser(userId);
      }
    }
  });

  it("tests billing period reset when expired", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `billing-period-${unique}@example.com`;

    const createUserResult = await supabase.auth.admin.createUser({
      email,
      password: `IntTest-${unique}-A1!`,
      email_confirm: true,
    });

    expect(createUserResult.error).toBeNull();
    const userId = createUserResult.data.user?.id;
    expect(userId).toBeTruthy();

    try {
      // Create profile
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "billing_ensure_profile",
        {
          p_subject_id: userId,
          p_email: email,
        },
      );

      expect(rpcError).toBeNull();
      expect(rpcResult).toBeTruthy();
      const profileId = rpcResult?.id;
      expect(profileId).toBeTruthy();

      // Set period to past dates to trigger reset
      const now = new Date();
      const pastStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
      const pastEnd = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          period_start_at: pastStart.toISOString(),
          period_end_at: pastEnd.toISOString(),
        })
        .eq("id", userId!);

      expect(updateError).toBeNull();

      // Call reset period RPC
      const { data: resetResult, error: resetError } = await supabase.rpc(
        "billing_reset_period_if_needed",
        {
          p_subject_id: userId,
        },
      );

      expect(resetError).toBeNull();
      expect(resetResult).toBeTruthy();
      if (resetResult) {
        const newEnd = new Date(resetResult.period_end_at);
        expect(newEnd.getTime()).toBeGreaterThan(now.getTime());
      }
    } finally {
      if (userId) {
        await supabase.auth.admin.deleteUser(userId);
      }
    }
  });

  it("generates usage report with mock data", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `usage-report-${unique}@example.com`;

    const createUserResult = await supabase.auth.admin.createUser({
      email,
      password: `IntTest-${unique}-A1!`,
      email_confirm: true,
    });

    expect(createUserResult.error).toBeNull();
    const userId = createUserResult.data.user?.id;
    expect(userId).toBeTruthy();

    try {
      // Create profile
      const { data: profile, error: profileError } = await supabase.rpc(
        "billing_ensure_profile",
        {
          p_subject_id: userId,
          p_email: email,
        },
      );

      expect(profileError).toBeNull();
      expect(profile).toBeTruthy();

      // Get usage report (may be empty initially)
      const report = await getIncludedUsageReport(userId!);
      expect(report).toBeTruthy();
      expect(report.periodStartISO).toBeTruthy();
      expect(report.periodEndISO).toBeTruthy();
      expect(report.usageValueUsdInt).toBeGreaterThanOrEqual(0);
      expect(report.overageBilledUsdInt).toBeGreaterThanOrEqual(0);
      expect(report.subscriptionBilledUsdInt).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(report.items)).toBe(true);
    } finally {
      if (userId) {
        await supabase.auth.admin.deleteUser(userId);
      }
    }
  });

  it("resolveAutoModelRouting handles different plans correctly", async () => {
    // Test with free plan - should route to deepseek if available
    const freeResult = resolveAutoModelRouting({
      requestedModelId: "openai/gpt-4o",
      planId: "free",
      mode: "smart",
    });

    expect(freeResult).toBeTruthy();
    expect(freeResult.modelId).toBeTruthy();
    expect(typeof freeResult.routed).toBe("boolean");
    expect([
      "manual",
      "plan_guardrail",
      "cost_safe_auto",
      "already_cost_safe",
    ]).toContain(freeResult.reason);

    // Test with plus plan
    const plusResult = resolveAutoModelRouting({
      requestedModelId: "openai/gpt-4o",
      planId: "plus",
      mode: "smart",
    });

    expect(plusResult).toBeTruthy();
    expect(plusResult.modelId).toBeTruthy();

    // Test with pro plan
    const proResult = resolveAutoModelRouting({
      requestedModelId: "anthropic/claude-opus-4.1",
      planId: "pro",
      mode: "smart",
    });

    expect(proResult).toBeTruthy();
    expect(proResult.modelId).toBeTruthy();

    // Test with team plan
    const teamResult = resolveAutoModelRouting({
      requestedModelId: "openai/gpt-5.2",
      planId: "team",
      mode: "smart",
    });

    expect(teamResult).toBeTruthy();
    expect(teamResult.modelId).toBeTruthy();

    // Test manual mode - should not route
    const manualResult = resolveAutoModelRouting({
      requestedModelId: "openai/gpt-4o",
      planId: "free",
      mode: "manual",
    });

    expect(manualResult.modelId).toBe("openai/gpt-4o");
    expect(manualResult.routed).toBe(false);
    expect(manualResult.reason).toBe("manual");
  });

  it("calculateUsageValueUsdInt with various model and token combinations", async () => {
    // Test with gpt-4o-mini (cheap model)
    const miniCost = await calculateUsageValueUsdInt({
      modelId: "openai/gpt-4o-mini",
      tokensIn: 1000,
      tokensOut: 500,
    });

    expect(miniCost).toBeGreaterThan(0);
    expect(typeof miniCost).toBe("number");

    // Test with expensive model
    const expensiveCost = await calculateUsageValueUsdInt({
      modelId: "openai/gpt-5.2",
      tokensIn: 1000,
      tokensOut: 500,
    });

    expect(expensiveCost).toBeGreaterThan(0);
    // Expensive model should cost more than cheap model for same tokens
    expect(expensiveCost).toBeGreaterThan(miniCost);

    // Test with zero tokens
    const zeroCost = await calculateUsageValueUsdInt({
      modelId: "openai/gpt-4o-mini",
      tokensIn: 0,
      tokensOut: 0,
    });

    expect(zeroCost).toBe(0);

    // Test with large token counts
    const largeCost = await calculateUsageValueUsdInt({
      modelId: "openai/gpt-4o-mini",
      tokensIn: 100_000,
      tokensOut: 100_000,
    });

    expect(largeCost).toBeGreaterThan(0);

    // Test with unknown model (should use default rate)
    const unknownModelCost = await calculateUsageValueUsdInt({
      modelId: "unknown/model",
      tokensIn: 1000,
      tokensOut: 500,
    });

    expect(unknownModelCost).toBeGreaterThan(0);
  });
});
