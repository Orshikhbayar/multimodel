"use server";

import {
  createSupabaseServerClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { isUnlimitedTesterEmail } from "@/lib/testerAccess";

function isServerUsageDisabled() {
  return (
    process.env.NEXT_PUBLIC_DISABLE_SERVER_BILLING === "true" ||
    process.env.E2E_AUTH_BYPASS === "true"
  );
}

function isSupabaseUsageSchemaMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = String(candidate.code ?? "");
  if (code === "42P01" || code === "42703") {
    return true;
  }
  const message = String(candidate.message ?? "").toLowerCase();
  return (
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("column") ||
    message.includes("schema cache")
  );
}

function dailyTokenLimit() {
  const raw = Number(process.env.NEXT_PUBLIC_DAILY_TOKEN_LIMIT ?? "2000");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 2000;
}

// ============================================
// Usage Record Types
// ============================================

export interface UsageSummary {
  totalTokens: number;
  totalCostUsd: number;
  periodStart: Date;
  periodEnd: Date;
  byModel: Record<
    string,
    {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costUsd: number;
      requestCount: number;
    }
  >;
  dailyUsage: Array<{
    date: string;
    tokens: number;
    costUsd: number;
  }>;
}

export interface UsageRecord {
  id: string;
  model: string;
  provider: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  createdAt: Date;
}

// ============================================
// Usage Actions
// ============================================

/**
 * Get usage records for the current user
 */
export async function getUsageRecords(
  options: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  } = {},
): Promise<UsageRecord[]> {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return [];
  }

  if (isServerUsageDisabled()) {
    return [];
  }

  const { limit = 100, offset = 0, startDate, endDate } = options;
  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("model_runs")
      .select("id, model, provider, input_tokens, output_tokens, cost_usd, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + Math.max(1, limit) - 1);

    if (startDate) {
      query = query.gte("created_at", startDate.toISOString());
    }
    if (endDate) {
      query = query.lte("created_at", endDate.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((record) => {
      const promptTokens = record.input_tokens ?? 0;
      const completionTokens = record.output_tokens ?? 0;
      return {
        id: record.id,
        model: record.model,
        provider: record.provider ?? null,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCostUsd: Number(record.cost_usd ?? 0),
        createdAt: new Date(record.created_at),
      };
    });
  } catch (error) {
    if (isSupabaseUsageSchemaMissing(error)) {
      console.warn(
        "[usage] model_runs usage schema unavailable; returning empty records",
      );
      return [];
    }
    throw error;
  }
}

/**
 * Get usage summary for the current billing period
 */
export async function getUsageSummary(
  periodStart?: Date,
  periodEnd?: Date,
): Promise<UsageSummary | null> {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return null;
  }

  // Default to current month
  const now = new Date();
  const start = periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const end = periodEnd ?? new Date(now.getFullYear(), now.getMonth() + 1, 0);

  if (isServerUsageDisabled()) {
    return {
      totalTokens: 0,
      totalCostUsd: 0,
      periodStart: start,
      periodEnd: end,
      byModel: {},
      dailyUsage: [],
    };
  }

  let records: Array<{
    model: string;
    input_tokens: number | null;
    output_tokens: number | null;
    cost_usd: number | null;
    created_at: string;
  }>;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("model_runs")
      .select("model, input_tokens, output_tokens, cost_usd, created_at")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .order("created_at", { ascending: true });
    if (error) throw error;
    records = data ?? [];
  } catch (error) {
    if (isSupabaseUsageSchemaMissing(error)) {
      console.warn(
        "[usage] model_runs usage schema unavailable; returning empty summary",
      );
      return {
        totalTokens: 0,
        totalCostUsd: 0,
        periodStart: start,
        periodEnd: end,
        byModel: {},
        dailyUsage: [],
      };
    }
    throw error;
  }

  // Calculate totals and breakdowns
  let totalTokens = 0;
  let totalCostUsd = 0;
  const byModel: UsageSummary["byModel"] = {};
  const dailyMap: Record<string, { tokens: number; costUsd: number }> = {};

  for (const record of records) {
    const promptTokens = record.input_tokens ?? 0;
    const completionTokens = record.output_tokens ?? 0;
    const recordTotalTokens = promptTokens + completionTokens;
    const recordCostUsd = Number(record.cost_usd ?? 0);

    totalTokens += recordTotalTokens;
    totalCostUsd += recordCostUsd;

    // By model breakdown
    if (!byModel[record.model]) {
      byModel[record.model] = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        requestCount: 0,
      };
    }
    byModel[record.model].promptTokens += promptTokens;
    byModel[record.model].completionTokens += completionTokens;
    byModel[record.model].totalTokens += recordTotalTokens;
    byModel[record.model].costUsd += recordCostUsd;
    byModel[record.model].requestCount += 1;

    // Daily breakdown
    const dateKey = new Date(record.created_at).toISOString().split("T")[0];
    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = { tokens: 0, costUsd: 0 };
    }
    dailyMap[dateKey].tokens += recordTotalTokens;
    dailyMap[dateKey].costUsd += recordCostUsd;
  }

  const dailyUsage = Object.entries(dailyMap).map(([date, data]) => ({
    date,
    tokens: data.tokens,
    costUsd: data.costUsd,
  }));

  return {
    totalTokens,
    totalCostUsd,
    periodStart: start,
    periodEnd: end,
    byModel,
    dailyUsage,
  };
}

/**
 * Check if user has exceeded their quota
 * Returns remaining tokens (negative if over quota)
 */
export async function checkQuota(): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
}> {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return { allowed: false, remaining: 0, limit: 0, used: 0 };
  }

  if (isUnlimitedTesterEmail(user.email)) {
    return {
      allowed: true,
      remaining: Number.MAX_SAFE_INTEGER,
      limit: Number.MAX_SAFE_INTEGER,
      used: 0,
    };
  }

  if (isServerUsageDisabled()) {
    return { allowed: true, remaining: 2000, limit: 2000, used: 0 };
  }

  const limit = dailyTokenLimit();
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("model_runs")
      .select("input_tokens, output_tokens, created_at")
      .gte("created_at", dayStart.toISOString())
      .lte("created_at", now.toISOString());
    if (error) throw error;

    const used = (data ?? []).reduce((sum, row) => {
      return sum + (row.input_tokens ?? 0) + (row.output_tokens ?? 0);
    }, 0);
    const remaining = Math.max(0, limit - used);

    return {
      allowed: used < limit,
      remaining,
      limit,
      used,
    };
  } catch (error) {
    if (isSupabaseUsageSchemaMissing(error)) {
      console.warn(
        "[usage] model_runs usage schema unavailable; returning default quota",
      );
      return { allowed: true, remaining: limit, limit, used: 0 };
    }
    throw error;
  }
}

/**
 * Record usage for a completed run
 */
export async function recordUsage(data: {
  runId?: string;
  model: string;
  provider?: string;
  promptTokens: number;
  completionTokens: number;
}): Promise<boolean> {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return false;
  }

  if (isServerUsageDisabled()) {
    return true;
  }

  // Estimate cost based on model (simplified - should use model-specific pricing)
  const estimatedCostUsd =
    data.promptTokens * 0.00003 + data.completionTokens * 0.00006;

  if (!data.runId) {
    return true;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("model_runs")
      .update({
        input_tokens: data.promptTokens,
        output_tokens: data.completionTokens,
        cost_usd: Number(estimatedCostUsd.toFixed(6)),
      })
      .eq("id", data.runId);
    if (error) throw error;
  } catch (error) {
    if (isSupabaseUsageSchemaMissing(error)) {
      console.warn(
        "[usage] model_runs usage schema unavailable; skipping usage write",
      );
      return true;
    }
    throw error;
  }

  return true;
}
