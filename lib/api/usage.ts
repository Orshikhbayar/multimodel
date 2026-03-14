/**
 * Server-side usage tracking utilities.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

interface ModelPricing {
  promptPer1k: number;
  completionPer1k: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4o": { promptPer1k: 0.0025, completionPer1k: 0.01 },
  "gpt-4o-mini": { promptPer1k: 0.00015, completionPer1k: 0.0006 },
  "gpt-4.1": { promptPer1k: 0.01, completionPer1k: 0.03 },
  default: { promptPer1k: 0.00015, completionPer1k: 0.0006 },
};

export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING.default;
  return (
    (promptTokens / 1000) * pricing.promptPer1k +
    (completionTokens / 1000) * pricing.completionPer1k
  );
}

export interface QuotaConfig {
  dailyTokenLimit: number;
}

const PLAN_QUOTAS: Record<string, QuotaConfig> = {
  free: { dailyTokenLimit: 100_000 },
  plus: { dailyTokenLimit: 500_000 },
  pro: { dailyTokenLimit: 2_000_000 },
  team: { dailyTokenLimit: 10_000_000 },
};

export function getQuotaConfig(planId: string = "free"): QuotaConfig {
  return PLAN_QUOTAS[planId] ?? PLAN_QUOTAS.free;
}

export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
  resetAt: Date;
}

export async function checkUserQuota(
  userId: string,
  planId: string = "free",
): Promise<QuotaCheckResult> {
  const config = getQuotaConfig(planId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("usage_runs")
      .select("tokens_total")
      .eq("user_id", userId)
      .gte("created_at", today.toISOString())
      .lt("created_at", tomorrow.toISOString())
      .eq("status", "completed");

    if (error) {
      throw error;
    }

    const used = (data ?? []).reduce((sum, row) => sum + (row.tokens_total ?? 0), 0);
    const remaining = Math.max(0, config.dailyTokenLimit - used);

    return {
      allowed: remaining > 0,
      remaining,
      limit: config.dailyTokenLimit,
      used,
      resetAt: tomorrow,
    };
  } catch (error) {
    console.warn("[Usage] Database not available, allowing request:", error);
    return {
      allowed: true,
      remaining: config.dailyTokenLimit,
      limit: config.dailyTokenLimit,
      used: 0,
      resetAt: tomorrow,
    };
  }
}

export interface RecordUsageParams {
  userId: string;
  runId?: string;
  model: string;
  provider?: string;
  promptTokens: number;
  completionTokens: number;
}

export async function recordUserUsage(params: RecordUsageParams): Promise<void> {
  const {
    userId,
    runId,
    model,
    provider = "openai",
    promptTokens,
    completionTokens,
  } = params;

  const totalTokens = promptTokens + completionTokens;
  const estimatedCostUsd = calculateCost(model, promptTokens, completionTokens);

  const runReferenceId = runId ?? `usage:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("usage_runs").upsert(
      {
        run_reference_id: runReferenceId,
        user_id: userId,
        plan_id: "free",
        model_id: model,
        mode: "conversation",
        tokens_in: promptTokens,
        tokens_out: completionTokens,
        tokens_total: totalTokens,
        usage_value_usd_int: Math.round(estimatedCostUsd * 100),
        billed_amount_usd_int: 0,
        billed_credits_int: 0,
        billing_bucket: "included_plan",
        status: "completed",
        metadata: {
          provider,
        },
      },
      {
        onConflict: "run_reference_id",
      },
    );

    if (error) {
      throw error;
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[Usage] Recorded:", {
        userId,
        model,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: `$${estimatedCostUsd.toFixed(6)}`,
      });
    }
  } catch (error) {
    console.error("[Usage] Failed to record usage:", error);
  }
}
