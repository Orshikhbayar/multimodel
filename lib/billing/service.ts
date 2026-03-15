import { getPlanById } from "@/lib/billing/plans";
import {
  calculateUsageCostCents,
  estimatePromptTokensFromMessages,
  estimateUsageHoldCents,
} from "@/lib/billing/cost";
import type { BillingCadence, Currency, PlanId } from "@/lib/billing/types";

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

export {
  calculateUsageCostCents,
  estimatePromptTokensFromMessages,
  estimateUsageHoldCents,
};

export function getBalanceCents(user: {
  includedCreditsCents: number;
  topUpCreditsCents: number;
  bonusCreditsCents?: number;
}) {
  return (
    (user.includedCreditsCents ?? 0) +
    (user.topUpCreditsCents ?? 0) +
    (user.bonusCreditsCents ?? 0)
  );
}

function toUsdCents(amountUsd: number): number {
  return Math.round(amountUsd * 100);
}

export function getIncludedCreditsCentsForPlan(planId: PlanId) {
  return toUsdCents(getPlanById(planId).includedMonthlyCredits.USD);
}

export function getSubscriptionPriceCents(
  planId: PlanId,
  cadence: BillingCadence,
) {
  const plan = getPlanById(planId);
  return toUsdCents(
    cadence === "annual" ? plan.annualPrice.USD : plan.monthlyPrice.USD,
  );
}

function removed(method: string): never {
  throw new BillingUnavailableError(
    `${method} was removed from billing/service. Use Supabase RPCs via billing/supabaseService instead.`,
  );
}

export async function ensureBillingUser(_sessionUser: BillingSessionUser) {
  removed("ensureBillingUser");
}

export async function resetPeriodIfNeeded(_userId: string) {
  removed("resetPeriodIfNeeded");
}

export async function checkQuota(
  _userId: string,
  _planId: string,
): Promise<QuotaCheck> {
  removed("checkQuota");
}

export async function reserveUsageHold(_params: {
  userId: string;
  referenceId: string;
  modelId: string;
  estimatedPromptTokens: number;
  maxOutputTokens: number;
}) {
  removed("reserveUsageHold");
}

export async function settleUsageHold(_params: {
  userId: string;
  hold: UsageHold;
  modelId: string;
  provider?: string;
  promptTokens: number;
  completionTokens: number;
  runId?: string;
}) {
  removed("settleUsageHold");
}

export async function refundUsageHold(_params: {
  userId: string;
  hold: UsageHold;
  reason: string;
}) {
  removed("refundUsageHold");
}

export async function recordBillingTransaction(_params: {
  userId: string;
  type: string;
  amountPaidCents: number;
  creditDeltaCents: number;
  balanceAfterCents: number;
  currency: Currency;
  referenceId?: string;
  metadata?: unknown;
}) {
  removed("recordBillingTransaction");
}
