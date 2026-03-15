import type { Database, Json, Tables } from "@/lib/supabase/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPlanById, PLANS } from "@/lib/billing/plans";
import { calculateUsageCostCents } from "@/lib/billing/cost";
import type { BillingSessionUser, PlanId } from "@/lib/billing/types";
import { isUnlimitedTesterEmail } from "@/lib/testerAccess";

type BillingBucket = Database["public"]["Enums"]["billing_bucket"];
type ProfileRow = Tables<"profiles">;

type AutoPolicy = {
  maxTokensPerRequest: number;
  maxRequestsPerMinute: number;
  maxConcurrentHolds: number;
  maxDailyIncludedAutoValueUsdInt: number;
};

const AUTO_POLICY_BY_PLAN: Record<PlanId, AutoPolicy> = {
  free: {
    maxTokensPerRequest: 4_000,
    maxRequestsPerMinute: 4,
    maxConcurrentHolds: 1,
    maxDailyIncludedAutoValueUsdInt: 200,
  },
  plus: {
    maxTokensPerRequest: 8_000,
    maxRequestsPerMinute: 10,
    maxConcurrentHolds: 2,
    maxDailyIncludedAutoValueUsdInt: 1_200,
  },
  pro: {
    maxTokensPerRequest: 16_000,
    maxRequestsPerMinute: 20,
    maxConcurrentHolds: 3,
    maxDailyIncludedAutoValueUsdInt: 3_000,
  },
  team: {
    maxTokensPerRequest: 24_000,
    maxRequestsPerMinute: 40,
    maxConcurrentHolds: 6,
    maxDailyIncludedAutoValueUsdInt: 8_000,
  },
};

const AUTO_ROUTE_PRIORITY = [
  "deepseek/deepseek-chat",
  "google/gemini-2.5-flash",
  "openai/gpt-4o-mini",
  "openai/gpt-5-mini",
] as const;

const MODEL_RETAIL_CENTS_PER_1M: Record<
  string,
  { inputCentsPer1m: number; outputCentsPer1m: number }
> = {
  "openai/gpt-4.1": { inputCentsPer1m: 1000, outputCentsPer1m: 3000 },
  "openai/gpt-5-mini": { inputCentsPer1m: 1200, outputCentsPer1m: 3600 },
  "openai/gpt-5.2": { inputCentsPer1m: 1800, outputCentsPer1m: 5400 },
  "openai/gpt-5.2-codex": { inputCentsPer1m: 2000, outputCentsPer1m: 6000 },
  "openai/gpt-5.1": { inputCentsPer1m: 1600, outputCentsPer1m: 4800 },
  "openai/gpt-4o": { inputCentsPer1m: 250, outputCentsPer1m: 1000 },
  "openai/gpt-4o-mini": { inputCentsPer1m: 15, outputCentsPer1m: 60 },
  "anthropic/claude-sonnet-4": {
    inputCentsPer1m: 1200,
    outputCentsPer1m: 3600,
  },
  "anthropic/claude-opus-4.1": {
    inputCentsPer1m: 1850,
    outputCentsPer1m: 5550,
  },
  "anthropic/claude-3.5": { inputCentsPer1m: 1150, outputCentsPer1m: 3450 },
  "anthropic/claude-opus-4": { inputCentsPer1m: 1800, outputCentsPer1m: 5400 },
  "google/gemini-3-flash-preview": {
    inputCentsPer1m: 650,
    outputCentsPer1m: 1950,
  },
  "google/gemini-3-pro-preview": {
    inputCentsPer1m: 1400,
    outputCentsPer1m: 4200,
  },
  "google/gemini-3-pro-image-preview": {
    inputCentsPer1m: 2000,
    outputCentsPer1m: 6000,
  },
  "google/gemini-2.5-flash": { inputCentsPer1m: 500, outputCentsPer1m: 1500 },
  "google/gemini-2.0": { inputCentsPer1m: 1250, outputCentsPer1m: 3750 },
  "xai/grok-4": { inputCentsPer1m: 1350, outputCentsPer1m: 4050 },
  "xai/grok-3": { inputCentsPer1m: 1100, outputCentsPer1m: 3300 },
  "deepseek/deepseek-reasoner": {
    inputCentsPer1m: 900,
    outputCentsPer1m: 2700,
  },
  "deepseek/deepseek-chat": { inputCentsPer1m: 600, outputCentsPer1m: 1800 },
  default: { inputCentsPer1m: 15, outputCentsPer1m: 60 },
};

const BILLING_DISABLED =
  process.env.NEXT_PUBLIC_DISABLE_SERVER_BILLING === "true" ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY;

function normalizePlanId(value: string): PlanId {
  if (
    value === "free" ||
    value === "plus" ||
    value === "pro" ||
    value === "team"
  ) {
    return value;
  }
  return "free";
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function startOfNextUtcDay(date: Date): Date {
  const day = startOfUtcDay(date);
  day.setUTCDate(day.getUTCDate() + 1);
  return day;
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseJsonObject(payload: Json | null): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  return payload as Record<string, unknown>;
}

function getCreditsBalance(profile: ProfileRow) {
  return (
    profile.included_credits_cents +
    profile.bonus_credits_cents +
    profile.top_up_credits_cents
  );
}

export class SupabaseBillingUnavailableError extends Error {
  code = "BILLING_UNAVAILABLE" as const;

  constructor(message = "Billing unavailable", options?: { cause?: unknown }) {
    super(message);
    this.name = "SupabaseBillingUnavailableError";
    if (options?.cause) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class SupabaseBillingUpgradeRequiredError extends Error {
  code = "PLAN_UPGRADE_REQUIRED" as const;
  requiredPlanId: PlanId;

  constructor(requiredPlanId: PlanId) {
    super("Selected model requires a higher plan");
    this.name = "SupabaseBillingUpgradeRequiredError";
    this.requiredPlanId = requiredPlanId;
  }
}

export class SupabaseBillingQuotaExceededError extends Error {
  code = "QUOTA_EXCEEDED" as const;
  reason: "daily" | "monthly";
  resetAt: Date;

  constructor(reason: "daily" | "monthly", resetAt: Date) {
    super("Quota exceeded");
    this.name = "SupabaseBillingQuotaExceededError";
    this.reason = reason;
    this.resetAt = resetAt;
  }
}

export class SupabaseBillingInsufficientCreditsError extends Error {
  code = "INSUFFICIENT_CREDITS" as const;
  availableCreditsInt: number;
  neededCreditsInt: number;
  suggestedAction: "topup" | "upgrade";

  constructor(params: {
    availableCreditsInt: number;
    neededCreditsInt: number;
    suggestedAction: "topup" | "upgrade";
  }) {
    super("Insufficient credits");
    this.name = "SupabaseBillingInsufficientCreditsError";
    this.availableCreditsInt = params.availableCreditsInt;
    this.neededCreditsInt = params.neededCreditsInt;
    this.suggestedAction = params.suggestedAction;
  }
}

export class SupabaseBillingLockedError extends Error {
  code = "BILLING_LOCKED" as const;
  lockReason?: string;

  constructor(lockReason?: string) {
    super("Billing is locked");
    this.name = "SupabaseBillingLockedError";
    this.lockReason = lockReason;
  }
}

function getErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const value = (error as { message?: unknown }).message;
  return typeof value === "string" ? value : "";
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value : "";
}

function isSchemaMissingError(error: unknown) {
  const code = getErrorCode(error);
  if (code === "42P01" || code === "42703") {
    return true;
  }

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("column") ||
    message.includes("schema cache")
  );
}

function isMissingSubjectIdColumnError(error: unknown) {
  if (getErrorCode(error) !== "42703") {
    return false;
  }

  const message = getErrorMessage(error).toLowerCase();
  return message.includes("subject_id");
}

async function ensureBillingProfile(sessionUser: BillingSessionUser) {
  const admin = createSupabaseAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", sessionUser.id)
    .maybeSingle();

  if (existingError) {
    throw new SupabaseBillingUnavailableError(
      "Failed to read billing profile",
      {
        cause: existingError,
      },
    );
  }

  if (existing) {
    return existing;
  }

  const now = new Date();
  const freePlan = getPlanById("free");

  const { data: created, error: createError } = await admin
    .from("profiles")
    .insert({
      id: sessionUser.id,
      email: sessionUser.email,
      plan_id: "free",
      billing_cadence: "monthly",
      billing_currency: "USD",
      period_start_at: now.toISOString(),
      period_end_at: addUtcMonths(now, 1).toISOString(),
      included_credits_cents: Math.round(
        freePlan.includedMonthlyCredits.USD * 100,
      ),
      top_up_credits_cents: 0,
      bonus_credits_cents: 0,
    })
    .select("*")
    .single();

  if (createError || !created) {
    throw new SupabaseBillingUnavailableError(
      "Failed to create billing profile",
      {
        cause: createError,
      },
    );
  }

  return created;
}

async function ensureAllowance(profile: ProfileRow) {
  const admin = createSupabaseAdminClient();
  const includedValueUsdInt = Math.round(
    getPlanById(normalizePlanId(profile.plan_id)).includedMonthlyCredits.USD *
      100,
  );

  const { error } = await admin.from("subscription_allowances").upsert(
    {
      subject_type: "user",
      subject_id: profile.id,
      period_start: profile.period_start_at,
      period_end: profile.period_end_at,
      included_value_usd_int: includedValueUsdInt,
      included_used_value_usd_int: 0,
    },
    {
      onConflict: "subject_type,subject_id,period_start,period_end",
      ignoreDuplicates: false,
    },
  );

  if (error) {
    throw new SupabaseBillingUnavailableError("Failed to upsert allowance", {
      cause: error,
    });
  }
}

async function resetBillingPeriodIfNeeded(profile: ProfileRow) {
  const now = new Date();
  const periodEnd = new Date(profile.period_end_at);
  if (now < periodEnd) {
    return profile;
  }

  const admin = createSupabaseAdminClient();
  const planId = normalizePlanId(profile.plan_id);
  const plan = getPlanById(planId);

  const periodStartAt = now;
  const periodEndAt = addUtcMonths(now, 1);
  const includedCreditsCents = Math.round(
    plan.includedMonthlyCredits.USD * 100,
  );

  const { data: updated, error } = await admin
    .from("profiles")
    .update({
      period_start_at: periodStartAt.toISOString(),
      period_end_at: periodEndAt.toISOString(),
      included_credits_cents: includedCreditsCents,
    })
    .eq("id", profile.id)
    .select("*")
    .single();

  if (error || !updated) {
    throw new SupabaseBillingUnavailableError(
      "Failed to reset billing period",
      {
        cause: error,
      },
    );
  }

  await ensureAllowance(updated);
  return updated;
}

async function getModelRetailRate(modelId: string) {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("model_rates")
    .select("input_usd_per_1m_tokens_int,output_usd_per_1m_tokens_int")
    .eq("model_id", modelId)
    .maybeSingle();

  if (error) {
    throw new SupabaseBillingUnavailableError(
      "Failed to read model retail rate",
      {
        cause: error,
      },
    );
  }

  if (data) {
    return {
      inputCentsPer1m: data.input_usd_per_1m_tokens_int,
      outputCentsPer1m: data.output_usd_per_1m_tokens_int,
    };
  }

  return (
    MODEL_RETAIL_CENTS_PER_1M[modelId] ?? MODEL_RETAIL_CENTS_PER_1M.default
  );
}

export async function calculateUsageValueUsdInt(params: {
  modelId: string;
  tokensIn: number;
  tokensOut: number;
}) {
  if (params.tokensIn + params.tokensOut <= 0) {
    return 0;
  }

  const rate = await getModelRetailRate(params.modelId);
  const raw =
    params.tokensIn * rate.inputCentsPer1m +
    params.tokensOut * rate.outputCentsPer1m;
  return Math.max(1, Math.ceil(raw / 1_000_000));
}

function sortByCheapestModel(modelIds: string[]) {
  const score = (modelId: string) => {
    const rate =
      MODEL_RETAIL_CENTS_PER_1M[modelId] ?? MODEL_RETAIL_CENTS_PER_1M.default;
    return rate.inputCentsPer1m + rate.outputCentsPer1m;
  };
  return [...modelIds].sort((a, b) => score(a) - score(b));
}

export function resolveAutoModelRouting(params: {
  requestedModelId: string;
  planId: PlanId;
  mode?: string;
}) {
  const plan = getPlanById(params.planId);

  if (params.mode !== "smart") {
    return {
      modelId: params.requestedModelId,
      routed: false,
      reason: "manual",
    };
  }

  if (!plan.allowedModelIds.includes(params.requestedModelId)) {
    const fallback =
      AUTO_ROUTE_PRIORITY.find((id) => plan.allowedModelIds.includes(id)) ??
      sortByCheapestModel(plan.allowedModelIds)[0] ??
      params.requestedModelId;

    return {
      modelId: fallback,
      routed: fallback !== params.requestedModelId,
      reason: "plan_guardrail",
    };
  }

  const preferred = AUTO_ROUTE_PRIORITY.find((id) =>
    plan.allowedModelIds.includes(id),
  );
  if (preferred && preferred !== params.requestedModelId) {
    return {
      modelId: preferred,
      routed: true,
      reason: "cost_safe_auto",
    };
  }

  return {
    modelId: params.requestedModelId,
    routed: false,
    reason: "already_cost_safe",
  };
}

async function checkTokenQuota(params: { userId: string; planId: PlanId }) {
  const plan = getPlanById(params.planId);
  const admin = createSupabaseAdminClient();

  const now = new Date();
  const dayStart = startOfUtcDay(now).toISOString();
  const nextDay = startOfNextUtcDay(now).toISOString();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();

  const [dailyRows, monthlyRows] = await Promise.all([
    admin
      .from("usage_runs")
      .select("tokens_total")
      .eq("user_id", params.userId)
      .gte("created_at", dayStart)
      .lt("created_at", nextDay)
      .eq("status", "completed"),
    admin
      .from("usage_runs")
      .select("tokens_total")
      .eq("user_id", params.userId)
      .gte("created_at", monthStart)
      .lt("created_at", nextMonth)
      .eq("status", "completed"),
  ]);

  if (dailyRows.error || monthlyRows.error) {
    throw new SupabaseBillingUnavailableError("Failed to check token quotas", {
      cause: dailyRows.error ?? monthlyRows.error,
    });
  }

  const dailyUsed = (dailyRows.data ?? []).reduce(
    (sum, row) => sum + safeNumber(row.tokens_total),
    0,
  );
  const monthlyUsed = (monthlyRows.data ?? []).reduce(
    (sum, row) => sum + safeNumber(row.tokens_total),
    0,
  );

  if (dailyUsed >= plan.dailyTokenCap) {
    throw new SupabaseBillingQuotaExceededError("daily", new Date(nextDay));
  }

  if (monthlyUsed >= plan.monthlyTokenCap) {
    throw new SupabaseBillingQuotaExceededError("monthly", new Date(nextMonth));
  }
}

async function checkAutoPolicy(params: {
  userId: string;
  planId: PlanId;
  estimatedTokens: number;
  estimatedValueUsdInt: number;
}) {
  const policy = AUTO_POLICY_BY_PLAN[params.planId];

  if (params.estimatedTokens > policy.maxTokensPerRequest) {
    return { allowed: false as const, reason: "max_tokens_per_request" };
  }

  const admin = createSupabaseAdminClient();
  const now = new Date();
  const minuteAgo = new Date(now.getTime() - 60_000).toISOString();
  const dayStart = startOfUtcDay(now).toISOString();
  const nextDay = startOfNextUtcDay(now).toISOString();

  const [lastMinuteRuns, activeHolds, todayAutoUsage, todayAutoReserved] =
    await Promise.all([
      admin
        .from("usage_runs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", params.userId)
        .eq("mode", "smart")
        .gte("created_at", minuteAgo),
      admin
        .from("usage_holds")
        .select("id", { count: "exact", head: true })
        .eq("user_id", params.userId)
        .eq("mode", "smart")
        .eq("status", "active"),
      admin
        .from("usage_runs")
        .select("usage_value_usd_int")
        .eq("user_id", params.userId)
        .eq("billing_bucket", "included_auto")
        .gte("created_at", dayStart)
        .lt("created_at", nextDay),
      admin
        .from("usage_holds")
        .select("auto_reserved_value_usd_int")
        .eq("user_id", params.userId)
        .eq("mode", "smart")
        .eq("status", "active")
        .gte("created_at", dayStart)
        .lt("created_at", nextDay),
    ]);

  const policyError =
    lastMinuteRuns.error ??
    activeHolds.error ??
    todayAutoUsage.error ??
    todayAutoReserved.error;

  if (policyError) {
    throw new SupabaseBillingUnavailableError("Failed to check auto policy", {
      cause: policyError,
    });
  }

  if ((lastMinuteRuns.count ?? 0) >= policy.maxRequestsPerMinute) {
    return { allowed: false as const, reason: "max_requests_per_minute" };
  }

  if ((activeHolds.count ?? 0) >= policy.maxConcurrentHolds) {
    return { allowed: false as const, reason: "max_concurrent" };
  }

  const usedAutoValue = (todayAutoUsage.data ?? []).reduce(
    (sum, row) => sum + safeNumber(row.usage_value_usd_int),
    0,
  );

  const reservedAutoValue = (todayAutoReserved.data ?? []).reduce(
    (sum, row) => sum + safeNumber(row.auto_reserved_value_usd_int),
    0,
  );

  if (
    usedAutoValue + reservedAutoValue + params.estimatedValueUsdInt >
    policy.maxDailyIncludedAutoValueUsdInt
  ) {
    return { allowed: false as const, reason: "daily_included_auto_value" };
  }

  return { allowed: true as const };
}

export type MeteredRunStart = {
  runReferenceId: string;
  modelId: string;
  bucketHint: BillingBucket;
  planId: PlanId;
  heldCreditsInt: number;
  autoReservedValueUsdInt: number;
};

export async function startUsageRunMetering(params: {
  sessionUser: BillingSessionUser;
  runReferenceId: string;
  requestedModelId: string;
  mode?: string;
  estimatedPromptTokens: number;
  maxOutputTokens: number;
}) {
  if (BILLING_DISABLED) {
    return null;
  }

  if (isUnlimitedTesterEmail(params.sessionUser.email)) {
    return {
      runReferenceId: params.runReferenceId,
      modelId: params.requestedModelId,
      bucketHint: "included_plan",
      planId: "team",
      heldCreditsInt: 0,
      autoReservedValueUsdInt: 0,
    } satisfies MeteredRunStart;
  }

  try {
    let profile = await ensureBillingProfile(params.sessionUser);
    profile = await resetBillingPeriodIfNeeded(profile);
    await ensureAllowance(profile);

    const planId = normalizePlanId(profile.plan_id);
    const plan = getPlanById(planId);

    if (
      params.mode !== "smart" &&
      !plan.allowedModelIds.includes(params.requestedModelId)
    ) {
      const requiredPlan =
        PLANS.find((candidate) =>
          candidate.allowedModelIds.includes(params.requestedModelId),
        )?.id ?? "pro";
      throw new SupabaseBillingUpgradeRequiredError(requiredPlan);
    }

    await checkTokenQuota({ userId: profile.id, planId });

    const routed = resolveAutoModelRouting({
      requestedModelId: params.requestedModelId,
      planId,
      mode: params.mode,
    });

    const estimatedHeldCreditsInt = calculateUsageCostCents({
      modelId: routed.modelId,
      promptTokens: Math.ceil(params.estimatedPromptTokens * 1.1),
      completionTokens: Math.ceil(params.maxOutputTokens * 1.1),
    });

    const estimatedValueUsdInt = await calculateUsageValueUsdInt({
      modelId: routed.modelId,
      tokensIn: Math.ceil(params.estimatedPromptTokens * 1.1),
      tokensOut: Math.ceil(params.maxOutputTokens * 1.1),
    });

    const autoPolicy = await checkAutoPolicy({
      userId: profile.id,
      planId,
      estimatedTokens: params.estimatedPromptTokens + params.maxOutputTokens,
      estimatedValueUsdInt,
    });

    const useAuto = params.mode === "smart" && autoPolicy.allowed;

    if (!useAuto && getCreditsBalance(profile) < estimatedHeldCreditsInt) {
      throw new SupabaseBillingInsufficientCreditsError({
        availableCreditsInt: getCreditsBalance(profile),
        neededCreditsInt: estimatedHeldCreditsInt,
        suggestedAction: planId === "free" ? "upgrade" : "topup",
      });
    }

    const admin = createSupabaseAdminClient();
    const { data: rpcData, error: rpcError } = await admin.rpc(
      "billing_start_run",
      {
        p_subject_id: profile.id,
        p_model_id: routed.modelId,
        p_est_tokens_in: Math.ceil(params.estimatedPromptTokens * 1.1),
        p_est_tokens_out: Math.ceil(params.maxOutputTokens * 1.1),
        p_is_auto: useAuto,
        p_run_id: params.runReferenceId,
        p_requested_model_id: params.requestedModelId,
        p_plan_id: planId,
        p_mode: params.mode ?? undefined,
        p_provider_reference_id: `run:${params.runReferenceId}`,
      },
    );

    if (rpcError) {
      const message = getErrorMessage(rpcError);
      if (message.includes("BILLING_LOCKED")) {
        throw new SupabaseBillingLockedError(
          typeof rpcError.details === "string" ? rpcError.details : undefined,
        );
      }

      if (message.includes("INSUFFICIENT_CREDITS")) {
        throw new SupabaseBillingInsufficientCreditsError({
          availableCreditsInt: getCreditsBalance(profile),
          neededCreditsInt: estimatedHeldCreditsInt,
          suggestedAction: planId === "free" ? "upgrade" : "topup",
        });
      }

      if (message.includes("AUTO_GUARDRAIL_BLOCKED")) {
        throw new SupabaseBillingInsufficientCreditsError({
          availableCreditsInt: getCreditsBalance(profile),
          neededCreditsInt: estimatedHeldCreditsInt,
          suggestedAction: planId === "free" ? "upgrade" : "topup",
        });
      }

      throw new SupabaseBillingUnavailableError("Failed to reserve run hold", {
        cause: rpcError,
      });
    }

    const parsed = parseJsonObject(rpcData ?? null);

    return {
      runReferenceId: params.runReferenceId,
      modelId: routed.modelId,
      bucketHint:
        (parsed.bucket as BillingBucket | undefined) ?? "included_plan",
      planId,
      heldCreditsInt: safeNumber(parsed.held_credits_int),
      autoReservedValueUsdInt: safeNumber(parsed.auto_reserved_value_usd_int),
    } satisfies MeteredRunStart;
  } catch (error) {
    if (
      error instanceof SupabaseBillingUnavailableError ||
      error instanceof SupabaseBillingUpgradeRequiredError ||
      error instanceof SupabaseBillingQuotaExceededError ||
      error instanceof SupabaseBillingInsufficientCreditsError ||
      error instanceof SupabaseBillingLockedError
    ) {
      throw error;
    }

    throw new SupabaseBillingUnavailableError("Failed to start metered run", {
      cause: error,
    });
  }
}

export async function finalizeUsageRunMetering(params: {
  userId: string;
  userEmail?: string | null;
  runReferenceId: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  status: "completed" | "cancelled" | "failed";
  failureReason?: string;
}) {
  if (BILLING_DISABLED) {
    return null;
  }

  if (isUnlimitedTesterEmail(params.userEmail)) {
    return null;
  }

  const billedCreditsInt =
    params.status === "completed"
      ? calculateUsageCostCents({
          modelId: params.modelId,
          promptTokens: params.promptTokens,
          completionTokens: params.completionTokens,
        })
      : 0;

  const usageValueUsdInt =
    params.status === "completed"
      ? await calculateUsageValueUsdInt({
          modelId: params.modelId,
          tokensIn: params.promptTokens,
          tokensOut: params.completionTokens,
        })
      : 0;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("billing_finalize_run", {
    p_subject_id: params.userId,
    p_run_id: params.runReferenceId,
    p_actual_tokens_in: params.promptTokens,
    p_actual_tokens_out: params.completionTokens,
    p_model_id: params.modelId,
    p_status: params.status,
    p_reason: params.failureReason ?? undefined,
    p_usage_value_usd_int: usageValueUsdInt,
    p_billed_amount_int: billedCreditsInt,
    p_provider_reference_id: `run:${params.runReferenceId}`,
  });

  if (error) {
    if (getErrorMessage(error).includes("BILLING_LOCKED")) {
      throw new SupabaseBillingLockedError(
        typeof error.details === "string" ? error.details : undefined,
      );
    }

    throw new SupabaseBillingUnavailableError(
      "Failed to finalize metered run",
      {
        cause: error,
      },
    );
  }

  return parseJsonObject(data ?? null);
}

export async function releaseUsageRunHold(params: {
  userId: string;
  runReferenceId: string;
  reason: string;
}) {
  if (BILLING_DISABLED) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("billing_release_hold", {
    p_subject_id: params.userId,
    p_run_id: params.runReferenceId,
    p_reason: params.reason,
    p_provider_reference_id: `run:${params.runReferenceId}`,
  });

  if (error) {
    if (getErrorMessage(error).includes("BILLING_LOCKED")) {
      throw new SupabaseBillingLockedError(
        typeof error.details === "string" ? error.details : undefined,
      );
    }

    throw new SupabaseBillingUnavailableError("Failed to release run hold", {
      cause: error,
    });
  }

  return parseJsonObject(data ?? null);
}

export async function lockBillingSubject(params: {
  subjectId: string;
  reason: string;
  lockedAt?: string;
}) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("billing_lock_subject", {
    p_subject_id: params.subjectId,
    p_reason: params.reason,
    p_locked_at: params.lockedAt ?? new Date().toISOString(),
  });

  if (error) {
    throw new SupabaseBillingUnavailableError(
      "Failed to lock billing subject",
      {
        cause: error,
      },
    );
  }
}

export async function unlockBillingSubject(subjectId: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("billing_unlock_subject", {
    p_subject_id: subjectId,
  });

  if (error) {
    throw new SupabaseBillingUnavailableError(
      "Failed to unlock billing subject",
      {
        cause: error,
      },
    );
  }
}

export type IncludedUsageReport = {
  periodStartISO: string;
  periodEndISO: string;
  usageValueUsdInt: number;
  billedUsdInt: number;
  savedUsdInt: number;
  subscriptionBilledUsdInt: number;
  overageBilledUsdInt: number;
  rows: Array<{
    bucket: BillingBucket;
    modelId: string;
    tokens: number;
    usageValueUsdInt: number;
    billedUsdInt: number;
    included: boolean;
  }>;
};

function emptyIncludedUsageReport(
  periodStartISO: string,
  periodEndISO: string,
): IncludedUsageReport {
  return {
    periodStartISO,
    periodEndISO,
    usageValueUsdInt: 0,
    billedUsdInt: 0,
    savedUsdInt: 0,
    subscriptionBilledUsdInt: 0,
    overageBilledUsdInt: 0,
    rows: [],
  };
}

export async function getIncludedUsageReport(
  userId: string,
): Promise<IncludedUsageReport> {
  const profile = await ensureBillingProfile({ id: userId });
  const admin = createSupabaseAdminClient();

  const periodStartISO = profile.period_start_at;
  const periodEndISO = profile.period_end_at;

  const [usageRows, subscriptionRowsBySubject] = await Promise.all([
    admin
      .from("usage_runs")
      .select(
        "billing_bucket,model_id,tokens_total,usage_value_usd_int,billed_amount_usd_int",
      )
      .eq("user_id", userId)
      .gte("created_at", periodStartISO)
      .lt("created_at", periodEndISO),
    admin
      .from("credit_ledger_events")
      .select("amount_usd_int,type")
      .eq("subject_id", userId)
      .gte("created_at", periodStartISO)
      .lt("created_at", periodEndISO)
      .in("type", ["subscription_charge", "invoice_paid", "plan_change"]),
  ]);

  if (usageRows.error) {
    if (isSchemaMissingError(usageRows.error)) {
      return emptyIncludedUsageReport(periodStartISO, periodEndISO);
    }

    throw new SupabaseBillingUnavailableError("Failed to build usage report", {
      cause: usageRows.error,
    });
  }

  let subscriptionRowsResult = subscriptionRowsBySubject;
  if (
    subscriptionRowsResult.error &&
    isMissingSubjectIdColumnError(subscriptionRowsResult.error)
  ) {
    subscriptionRowsResult = await admin
      .from("credit_ledger_events")
      .select("amount_usd_int,type")
      .eq("user_id", userId)
      .gte("created_at", periodStartISO)
      .lt("created_at", periodEndISO)
      .in("type", ["subscription_charge", "invoice_paid", "plan_change"]);
  }

  const usageData = usageRows.data ?? [];
  let subscriptionData = subscriptionRowsResult.data ?? [];
  if (subscriptionRowsResult.error) {
    if (isSchemaMissingError(subscriptionRowsResult.error)) {
      subscriptionData = [];
    } else {
      throw new SupabaseBillingUnavailableError(
        "Failed to build usage report",
        {
          cause: subscriptionRowsResult.error,
        },
      );
    }
  }

  const usageValueUsdInt = usageData.reduce(
    (sum, row) => sum + safeNumber(row.usage_value_usd_int),
    0,
  );

  const overageBilledUsdInt = usageData.reduce(
    (sum, row) => sum + safeNumber(row.billed_amount_usd_int),
    0,
  );

  const subscriptionBilledUsdInt = subscriptionData.reduce(
    (sum, row) => sum + safeNumber(row.amount_usd_int),
    0,
  );

  const billedUsdInt = subscriptionBilledUsdInt + overageBilledUsdInt;

  const grouped = new Map<
    string,
    {
      bucket: BillingBucket;
      modelId: string;
      tokens: number;
      usageValueUsdInt: number;
      billedUsdInt: number;
    }
  >();

  for (const row of usageData) {
    const key = `${row.billing_bucket}:${row.model_id}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.tokens += safeNumber(row.tokens_total);
      existing.usageValueUsdInt += safeNumber(row.usage_value_usd_int);
      existing.billedUsdInt += safeNumber(row.billed_amount_usd_int);
      continue;
    }

    grouped.set(key, {
      bucket: row.billing_bucket,
      modelId: row.model_id,
      tokens: safeNumber(row.tokens_total),
      usageValueUsdInt: safeNumber(row.usage_value_usd_int),
      billedUsdInt: safeNumber(row.billed_amount_usd_int),
    });
  }

  const rows = Array.from(grouped.values()).map((row) => ({
    ...row,
    included:
      row.bucket === "included_plan" ||
      row.bucket === "included_auto" ||
      row.bucket === "bonus",
  }));

  rows.sort(
    (a, b) =>
      a.bucket.localeCompare(b.bucket) || a.modelId.localeCompare(b.modelId),
  );

  return {
    periodStartISO,
    periodEndISO,
    usageValueUsdInt,
    billedUsdInt,
    savedUsdInt: usageValueUsdInt - billedUsdInt,
    subscriptionBilledUsdInt,
    overageBilledUsdInt,
    rows,
  };
}
