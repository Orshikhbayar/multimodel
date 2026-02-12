import { Prisma } from "@prisma/client";

import prisma from "@/lib/db";
import { getPlanById } from "./plans";
import type { BillingCadence, Currency, PlanId } from "./types";

const DEFAULT_PLAN_ID: PlanId = "free";
const DEFAULT_BILLING_CADENCE: BillingCadence = "monthly";
const DEFAULT_BILLING_CURRENCY: Currency = "USD";

const MODEL_PRICING_USD_PER_1K: Record<
  string,
  { promptPer1k: number; completionPer1k: number }
> = {
  "openai/gpt-4.1": { promptPer1k: 0.01, completionPer1k: 0.03 },
  "openai/gpt-5-mini": { promptPer1k: 0.012, completionPer1k: 0.036 },
  "openai/gpt-5.2": { promptPer1k: 0.018, completionPer1k: 0.054 },
  "openai/gpt-5.2-codex": { promptPer1k: 0.02, completionPer1k: 0.06 },
  "openai/gpt-5.1": { promptPer1k: 0.016, completionPer1k: 0.048 },
  "openai/gpt-4o": { promptPer1k: 0.0025, completionPer1k: 0.01 },
  "openai/gpt-4o-mini": { promptPer1k: 0.00015, completionPer1k: 0.0006 },
  "anthropic/claude-sonnet-4": { promptPer1k: 0.012, completionPer1k: 0.036 },
  "anthropic/claude-opus-4.1": { promptPer1k: 0.0185, completionPer1k: 0.0555 },
  "anthropic/claude-3.5": { promptPer1k: 0.0115, completionPer1k: 0.0345 },
  "anthropic/claude-opus-4": { promptPer1k: 0.018, completionPer1k: 0.054 },
  "google/gemini-3-flash-preview": {
    promptPer1k: 0.0065,
    completionPer1k: 0.0195,
  },
  "google/gemini-3-pro-preview": { promptPer1k: 0.014, completionPer1k: 0.042 },
  "google/gemini-3-pro-image-preview": {
    promptPer1k: 0.02,
    completionPer1k: 0.06,
  },
  "google/gemini-2.5-flash": { promptPer1k: 0.005, completionPer1k: 0.015 },
  "google/gemini-2.0": { promptPer1k: 0.0125, completionPer1k: 0.0375 },
  "xai/grok-4": { promptPer1k: 0.0135, completionPer1k: 0.0405 },
  "xai/grok-3": { promptPer1k: 0.011, completionPer1k: 0.033 },
  "deepseek/deepseek-reasoner": { promptPer1k: 0.009, completionPer1k: 0.027 },
  "deepseek/deepseek-chat": { promptPer1k: 0.006, completionPer1k: 0.018 },
  "gpt-4.1": { promptPer1k: 0.01, completionPer1k: 0.03 },
  "gpt-5.2": { promptPer1k: 0.018, completionPer1k: 0.054 },
  "gpt-5.2-codex": { promptPer1k: 0.02, completionPer1k: 0.06 },
  "gpt-5-mini": { promptPer1k: 0.012, completionPer1k: 0.036 },
  "gpt-4o": { promptPer1k: 0.0025, completionPer1k: 0.01 },
  "gpt-4o-mini": { promptPer1k: 0.00015, completionPer1k: 0.0006 },
  default: { promptPer1k: 0.00015, completionPer1k: 0.0006 },
};

export type BillingSessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

export type UsageHold = {
  id: string;
  userId: string;
  amountCents: number;
  includedDebitedCents: number;
  topUpDebitedCents: number;
  referenceId: string;
};

export type QuotaCheck = {
  allowed: boolean;
  reason?: "daily" | "monthly";
  used: number;
  limit: number;
  resetAt: Date;
  daily: {
    used: number;
    limit: number;
    remaining: number;
    resetAt: Date;
  };
  monthly: {
    used: number;
    limit: number;
    remaining: number;
    resetAt: Date;
  };
};

export class BillingUnavailableError extends Error {
  code = "BILLING_UNAVAILABLE" as const;

  constructor(message = "Billing unavailable", options?: { cause?: unknown }) {
    super(message);
    this.name = "BillingUnavailableError";
    if (options?.cause) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class InsufficientCreditsError extends Error {
  code = "INSUFFICIENT_CREDITS" as const;
  availableCreditsCents: number;

  constructor(availableCreditsCents: number) {
    super("Insufficient credits");
    this.name = "InsufficientCreditsError";
    this.availableCreditsCents = availableCreditsCents;
  }
}

function toUsdCents(amountUsd: number): number {
  return Math.round(amountUsd * 100);
}

function asPlanId(value: string): PlanId {
  if (value === "free" || value === "plus" || value === "pro" || value === "team") {
    return value;
  }
  return DEFAULT_PLAN_ID;
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

export function getBalanceCents(user: {
  includedCreditsCents: number;
  topUpCreditsCents: number;
}) {
  return Math.max(0, user.includedCreditsCents + user.topUpCreditsCents);
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

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfNextUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function getModelPricing(modelId: string) {
  return MODEL_PRICING_USD_PER_1K[modelId] ?? MODEL_PRICING_USD_PER_1K.default;
}

export function calculateUsageCostCents(params: {
  modelId: string;
  promptTokens: number;
  completionTokens: number;
}) {
  const pricing = getModelPricing(params.modelId);
  const usd =
    (params.promptTokens / 1000) * pricing.promptPer1k +
    (params.completionTokens / 1000) * pricing.completionPer1k;

  const cents = Math.round(usd * 100);
  if (params.promptTokens + params.completionTokens <= 0) {
    return 0;
  }
  return Math.max(1, cents);
}

export function estimatePromptTokensFromMessages(
  messages: Array<{ content: string }>,
): number {
  const totalChars = messages.reduce(
    (sum, message) => sum + (message.content?.length ?? 0),
    0,
  );
  return Math.max(1, Math.ceil(totalChars / 3));
}

export function estimateUsageHoldCents(params: {
  modelId: string;
  estimatedPromptTokens: number;
  maxOutputTokens: number;
}) {
  // Use a small safety multiplier to avoid under-reserving due tokenization differences.
  const promptTokens = Math.ceil(params.estimatedPromptTokens * 1.1);
  const completionTokens = Math.ceil(params.maxOutputTokens * 1.1);
  return calculateUsageCostCents({
    modelId: params.modelId,
    promptTokens,
    completionTokens,
  });
}

export async function ensureBillingUser(sessionUser: BillingSessionUser) {
  try {
    const existing = await prisma.user.findUnique({ where: { id: sessionUser.id } });
    if (existing) {
      const transactionCount = await prisma.billingTransaction.count({
        where: { userId: existing.id },
      });

      if (
        transactionCount === 0 &&
        existing.includedCreditsCents === 0 &&
        existing.topUpCreditsCents === 0
      ) {
        const now = new Date();
        const planId = asPlanId(existing.planId);
        const includedCreditsCents = toUsdCents(
          getPlanById(planId).includedMonthlyCredits.USD,
        );

        const initialized = await prisma.user.update({
          where: { id: existing.id },
          data: {
            includedCreditsCents,
            periodStartAt: now,
            periodEndAt: addUtcMonths(now, 1),
            billingCurrency: DEFAULT_BILLING_CURRENCY,
            billingCadence: DEFAULT_BILLING_CADENCE,
            planId,
          },
        });

        await prisma.billingTransaction.create({
          data: {
            userId: existing.id,
            type: "period_init",
            amountPaidCents: 0,
            creditDeltaCents: includedCreditsCents,
            balanceAfterCents: getBalanceCents(initialized),
            currency: "USD",
            referenceId: `period:init:${now.toISOString()}`,
            metadata: { planId },
          },
        });

        return initialized;
      }

      return existing;
    }

    if (sessionUser.email) {
      const byEmail = await prisma.user.findUnique({ where: { email: sessionUser.email } });
      if (byEmail) {
        return byEmail;
      }
    }

    const now = new Date();
    const plan = getPlanById(DEFAULT_PLAN_ID);

    return await prisma.user.create({
      data: {
        id: sessionUser.id,
        email: sessionUser.email ?? `${sessionUser.id}@demo.local`,
        name: sessionUser.name ?? "User",
        planId: DEFAULT_PLAN_ID,
        billingCadence: DEFAULT_BILLING_CADENCE,
        billingCurrency: DEFAULT_BILLING_CURRENCY,
        periodStartAt: now,
        periodEndAt: addUtcMonths(now, 1),
        includedCreditsCents: toUsdCents(plan.includedMonthlyCredits.USD),
        topUpCreditsCents: 0,
      },
    });
  } catch (error) {
    throw new BillingUnavailableError("Failed to provision billing user", {
      cause: error,
    });
  }
}

export async function resetPeriodIfNeeded(userId: string) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BillingUnavailableError("Billing user not found");
    }

    const now = new Date();
    if (now < user.periodEndAt) {
      return user;
    }

    const nextPlan = getPlanById(asPlanId(user.planId));
    const nextIncludedCents = toUsdCents(nextPlan.includedMonthlyCredits.USD);

    const updated = await prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.update({
        where: { id: user.id },
        data: {
          periodStartAt: now,
          periodEndAt: addUtcMonths(now, 1),
          includedCreditsCents: nextIncludedCents,
        },
      });

      await tx.billingTransaction.create({
        data: {
          userId: user.id,
          type: "period_reset",
          amountPaidCents: 0,
          creditDeltaCents: nextIncludedCents - user.includedCreditsCents,
          balanceAfterCents: getBalanceCents(nextUser),
          currency: "USD",
          referenceId: `period:${nextUser.periodStartAt.toISOString()}`,
          metadata: {
            previousIncludedCreditsCents: user.includedCreditsCents,
            nextIncludedCreditsCents: nextIncludedCents,
            planId: nextUser.planId,
          },
        },
      });

      return nextUser;
    });

    return updated;
  } catch (error) {
    if (error instanceof BillingUnavailableError) {
      throw error;
    }
    throw new BillingUnavailableError("Failed to reset billing period", {
      cause: error,
    });
  }
}

export async function checkQuota(userId: string, planId: string): Promise<QuotaCheck> {
  const now = new Date();
  const plan = getPlanById(asPlanId(planId));
  const dayStart = startOfUtcDay(now);
  const nextDay = startOfNextUtcDay(now);
  const monthStart = startOfUtcMonth(now);
  const nextMonth = startOfNextUtcMonth(now);

  try {
    const [dailyUsage, monthlyUsage] = await Promise.all([
      prisma.usageRecord.aggregate({
        where: {
          userId,
          createdAt: {
            gte: dayStart,
            lt: nextDay,
          },
        },
        _sum: {
          totalTokens: true,
        },
      }),
      prisma.usageRecord.aggregate({
        where: {
          userId,
          createdAt: {
            gte: monthStart,
            lt: nextMonth,
          },
        },
        _sum: {
          totalTokens: true,
        },
      }),
    ]);

    const dailyUsed = dailyUsage._sum.totalTokens ?? 0;
    const monthlyUsed = monthlyUsage._sum.totalTokens ?? 0;

    const dailyRemaining = Math.max(0, plan.dailyTokenCap - dailyUsed);
    const monthlyRemaining = Math.max(0, plan.monthlyTokenCap - monthlyUsed);

    if (dailyUsed >= plan.dailyTokenCap) {
      return {
        allowed: false,
        reason: "daily",
        used: dailyUsed,
        limit: plan.dailyTokenCap,
        resetAt: nextDay,
        daily: {
          used: dailyUsed,
          limit: plan.dailyTokenCap,
          remaining: dailyRemaining,
          resetAt: nextDay,
        },
        monthly: {
          used: monthlyUsed,
          limit: plan.monthlyTokenCap,
          remaining: monthlyRemaining,
          resetAt: nextMonth,
        },
      };
    }

    if (monthlyUsed >= plan.monthlyTokenCap) {
      return {
        allowed: false,
        reason: "monthly",
        used: monthlyUsed,
        limit: plan.monthlyTokenCap,
        resetAt: nextMonth,
        daily: {
          used: dailyUsed,
          limit: plan.dailyTokenCap,
          remaining: dailyRemaining,
          resetAt: nextDay,
        },
        monthly: {
          used: monthlyUsed,
          limit: plan.monthlyTokenCap,
          remaining: monthlyRemaining,
          resetAt: nextMonth,
        },
      };
    }

    return {
      allowed: true,
      used: dailyUsed,
      limit: plan.dailyTokenCap,
      resetAt: nextDay,
      daily: {
        used: dailyUsed,
        limit: plan.dailyTokenCap,
        remaining: dailyRemaining,
        resetAt: nextDay,
      },
      monthly: {
        used: monthlyUsed,
        limit: plan.monthlyTokenCap,
        remaining: monthlyRemaining,
        resetAt: nextMonth,
      },
    };
  } catch (error) {
    throw new BillingUnavailableError("Failed to check quota", {
      cause: error,
    });
  }
}

export async function reserveUsageHold(params: {
  userId: string;
  referenceId: string;
  modelId: string;
  estimatedPromptTokens: number;
  maxOutputTokens: number;
}) {
  const amountCents = estimateUsageHoldCents({
    modelId: params.modelId,
    estimatedPromptTokens: params.estimatedPromptTokens,
    maxOutputTokens: params.maxOutputTokens,
  });

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: params.userId } });
      if (!user) {
        throw new BillingUnavailableError("Billing user not found");
      }

      const available = getBalanceCents(user);
      if (available < amountCents) {
        throw new InsufficientCreditsError(available);
      }

      const includedDebitedCents = Math.min(user.includedCreditsCents, amountCents);
      const topUpDebitedCents = amountCents - includedDebitedCents;

      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          includedCreditsCents: user.includedCreditsCents - includedDebitedCents,
          topUpCreditsCents: user.topUpCreditsCents - topUpDebitedCents,
        },
      });

      const holdTx = await tx.billingTransaction.create({
        data: {
          userId: user.id,
          type: "usage_hold",
          amountPaidCents: 0,
          creditDeltaCents: -amountCents,
          balanceAfterCents: getBalanceCents(updated),
          currency: "USD",
          referenceId: params.referenceId,
          metadata: {
            modelId: params.modelId,
            estimatedPromptTokens: params.estimatedPromptTokens,
            maxOutputTokens: params.maxOutputTokens,
            includedDebitedCents,
            topUpDebitedCents,
          },
        },
      });

      return {
        id: holdTx.id,
        userId: user.id,
        amountCents,
        includedDebitedCents,
        topUpDebitedCents,
        referenceId: params.referenceId,
      } satisfies UsageHold;
    });
  } catch (error) {
    if (
      error instanceof BillingUnavailableError ||
      error instanceof InsufficientCreditsError
    ) {
      throw error;
    }

    throw new BillingUnavailableError("Failed to reserve usage hold", {
      cause: error,
    });
  }
}

export async function settleUsageHold(params: {
  userId: string;
  hold: UsageHold;
  modelId: string;
  provider?: string;
  promptTokens: number;
  completionTokens: number;
  runId?: string;
}) {
  const requestedCostCents = calculateUsageCostCents({
    modelId: params.modelId,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
  });

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: params.userId } });
      if (!user) {
        throw new BillingUnavailableError("Billing user not found");
      }

      const actualFromIncluded = Math.min(
        params.hold.includedDebitedCents,
        requestedCostCents,
      );
      const afterIncluded = requestedCostCents - actualFromIncluded;
      const actualFromTopUp = Math.min(params.hold.topUpDebitedCents, afterIncluded);
      let uncoveredCents = afterIncluded - actualFromTopUp;

      let extraFromIncluded = 0;
      let extraFromTopUp = 0;

      if (uncoveredCents > 0) {
        extraFromIncluded = Math.min(user.includedCreditsCents, uncoveredCents);
        uncoveredCents -= extraFromIncluded;
      }

      if (uncoveredCents > 0) {
        extraFromTopUp = Math.min(user.topUpCreditsCents, uncoveredCents);
        uncoveredCents -= extraFromTopUp;
      }

      const refundIncluded = params.hold.includedDebitedCents - actualFromIncluded;
      const refundTopUp = params.hold.topUpDebitedCents - actualFromTopUp;

      const nextIncluded = Math.max(
        0,
        user.includedCreditsCents + refundIncluded - extraFromIncluded,
      );
      const nextTopUp = Math.max(0, user.topUpCreditsCents + refundTopUp - extraFromTopUp);

      const nextUser = await tx.user.update({
        where: { id: user.id },
        data: {
          includedCreditsCents: nextIncluded,
          topUpCreditsCents: nextTopUp,
        },
      });

      const chargedCostCents =
        requestedCostCents - Math.max(0, uncoveredCents);
      const deltaCents =
        refundIncluded + refundTopUp - extraFromIncluded - extraFromTopUp;

      await tx.billingTransaction.create({
        data: {
          userId: user.id,
          type: "usage_settle",
          amountPaidCents: 0,
          creditDeltaCents: deltaCents,
          balanceAfterCents: getBalanceCents(nextUser),
          currency: "USD",
          referenceId: params.hold.referenceId,
          metadata: {
            holdId: params.hold.id,
            requestedCostCents,
            chargedCostCents,
            uncoveredCents,
          },
        },
      });

      await tx.usageRecord.create({
        data: {
          userId: user.id,
          runId: params.runId ?? null,
          model: params.modelId,
          provider: params.provider ?? "openai",
          promptTokens: params.promptTokens,
          completionTokens: params.completionTokens,
          totalTokens: params.promptTokens + params.completionTokens,
          estimatedCostUsd: chargedCostCents / 100,
        },
      });

      return {
        requestedCostCents,
        chargedCostCents,
        uncoveredCents,
        balanceAfterCents: getBalanceCents(nextUser),
      };
    });
  } catch (error) {
    if (error instanceof BillingUnavailableError) {
      throw error;
    }

    throw new BillingUnavailableError("Failed to settle usage hold", {
      cause: error,
    });
  }
}

export async function refundUsageHold(params: {
  userId: string;
  hold: UsageHold;
  reason: string;
}) {
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: params.userId } });
      if (!user) {
        throw new BillingUnavailableError("Billing user not found");
      }

      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          includedCreditsCents:
            user.includedCreditsCents + params.hold.includedDebitedCents,
          topUpCreditsCents: user.topUpCreditsCents + params.hold.topUpDebitedCents,
        },
      });

      await tx.billingTransaction.create({
        data: {
          userId: user.id,
          type: "usage_refund",
          amountPaidCents: 0,
          creditDeltaCents: params.hold.amountCents,
          balanceAfterCents: getBalanceCents(updated),
          currency: "USD",
          referenceId: params.hold.referenceId,
          metadata: {
            holdId: params.hold.id,
            reason: params.reason,
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof BillingUnavailableError) {
      throw error;
    }

    throw new BillingUnavailableError("Failed to refund usage hold", {
      cause: error,
    });
  }
}

export function getIncludedCreditsCentsForPlan(planId: PlanId) {
  return toUsdCents(getPlanById(planId).includedMonthlyCredits.USD);
}

export function getSubscriptionPriceCents(planId: PlanId, cadence: BillingCadence) {
  const plan = getPlanById(planId);
  return toUsdCents(
    cadence === "annual" ? plan.annualPrice.USD : plan.monthlyPrice.USD,
  );
}

export async function recordBillingTransaction(params: {
  userId: string;
  type: string;
  amountPaidCents: number;
  creditDeltaCents: number;
  balanceAfterCents: number;
  currency: Currency;
  referenceId?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    return await prisma.billingTransaction.create({
      data: {
        userId: params.userId,
        type: params.type,
        amountPaidCents: params.amountPaidCents,
        creditDeltaCents: params.creditDeltaCents,
        balanceAfterCents: params.balanceAfterCents,
        currency: params.currency,
        referenceId: params.referenceId,
        metadata: params.metadata,
      },
    });
  } catch (error) {
    throw new BillingUnavailableError("Failed to record billing transaction", {
      cause: error,
    });
  }
}
