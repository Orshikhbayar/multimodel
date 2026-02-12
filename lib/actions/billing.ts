"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  ensureBillingUser,
  getBalanceCents,
  getIncludedCreditsCentsForPlan,
  getSubscriptionPriceCents,
  recordBillingTransaction,
  resetPeriodIfNeeded,
} from "@/lib/billing/service";
import {
  getPlanById,
  getTopUpPackById,
} from "@/lib/billing/plans";
import { getUsdToMntRate } from "@/lib/billing/fx";
import type {
  BillingCadence,
  Currency,
  PlanId,
  TopUpPackId,
} from "@/lib/billing/types";

export type BillingSummary = {
  currentPlanId: PlanId;
  billingCadence: BillingCadence;
  currency: Currency;
  periodStartISO: string;
  periodEndISO: string;
  includedCreditsCents: number;
  topUpCreditsCents: number;
  includedCreditsUsd: number;
  topUpCreditsUsd: number;
  totalCreditsUsd: number;
  monthlyPriceUsd: number;
  annualPriceUsd: number;
  includedMonthlyCreditsUsd: number;
  dailyTokenCap: number;
  monthlyTokenCap: number;
};

export type BillingTransactionView = {
  id: string;
  type: string;
  amountPaid: number;
  creditDeltaUsd: number;
  balanceAfterUsd: number;
  currency: Currency;
  referenceId: string | null;
  createdAtISO: string;
  note?: string;
};

function normalizePlanId(value: string): PlanId {
  if (value === "free" || value === "plus" || value === "pro" || value === "team") {
    return value;
  }
  return "free";
}

function normalizeCadence(value: string): BillingCadence {
  return value === "annual" ? "annual" : "monthly";
}

function normalizeCurrency(value: string): Currency {
  return value === "MNT" ? "MNT" : "USD";
}

function toSummary(user: {
  planId: string;
  billingCadence: string;
  billingCurrency: string;
  periodStartAt: Date;
  periodEndAt: Date;
  includedCreditsCents: number;
  topUpCreditsCents: number;
}): BillingSummary {
  const planId = normalizePlanId(user.planId);
  const plan = getPlanById(planId);

  return {
    currentPlanId: planId,
    billingCadence: normalizeCadence(user.billingCadence),
    currency: normalizeCurrency(user.billingCurrency),
    periodStartISO: user.periodStartAt.toISOString(),
    periodEndISO: user.periodEndAt.toISOString(),
    includedCreditsCents: user.includedCreditsCents,
    topUpCreditsCents: user.topUpCreditsCents,
    includedCreditsUsd: user.includedCreditsCents / 100,
    topUpCreditsUsd: user.topUpCreditsCents / 100,
    totalCreditsUsd: getBalanceCents(user) / 100,
    monthlyPriceUsd: plan.monthlyPrice.USD,
    annualPriceUsd: plan.annualPrice.USD,
    includedMonthlyCreditsUsd: plan.includedMonthlyCredits.USD,
    dailyTokenCap: plan.dailyTokenCap,
    monthlyTokenCap: plan.monthlyTokenCap,
  };
}

async function requireBillingUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const billingUser = await ensureBillingUser({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });

  return resetPeriodIfNeeded(billingUser.id);
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

export async function getBillingSummary(): Promise<BillingSummary | null> {
  const user = await requireBillingUser();
  if (!user) {
    return null;
  }

  return toSummary(user);
}

export async function getBillingTransactions(options?: {
  limit?: number;
  offset?: number;
}): Promise<BillingTransactionView[]> {
  const user = await requireBillingUser();
  if (!user) {
    return [];
  }

  const limit = Math.max(1, Math.min(100, options?.limit ?? 100));
  const offset = Math.max(0, options?.offset ?? 0);

  const records = await prisma.billingTransaction.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
    skip: offset,
  });

  return records.map((record) => ({
    id: record.id,
    type: record.type,
    amountPaid:
      record.currency === "MNT"
        ? record.amountPaidCents
        : record.amountPaidCents / 100,
    creditDeltaUsd: record.creditDeltaCents / 100,
    balanceAfterUsd: record.balanceAfterCents / 100,
    currency: normalizeCurrency(record.currency),
    referenceId: record.referenceId,
    createdAtISO: record.createdAt.toISOString(),
    note: record.type,
  }));
}

export async function changePlan(params: {
  planId: PlanId;
  cadence: BillingCadence;
}): Promise<BillingSummary | null> {
  const user = await requireBillingUser();
  if (!user) {
    return null;
  }

  const nextPlan = getPlanById(params.planId);
  const nextIncludedCreditsCents = getIncludedCreditsCentsForPlan(params.planId);
  const subscriptionPriceCents = getSubscriptionPriceCents(params.planId, params.cadence);
  const now = new Date();
  const nextPeriodEnd = addUtcMonths(now, params.cadence === "annual" ? 12 : 1);

  const updated = await prisma.$transaction(async (tx) => {
    const nextUser = await tx.user.update({
      where: { id: user.id },
      data: {
        planId: params.planId,
        billingCadence: params.cadence,
        periodStartAt: now,
        periodEndAt: nextPeriodEnd,
        includedCreditsCents: nextIncludedCreditsCents,
      },
    });

    await tx.billingTransaction.create({
      data: {
        userId: user.id,
        type: "plan_change",
        amountPaidCents: subscriptionPriceCents,
        creditDeltaCents: nextIncludedCreditsCents - user.includedCreditsCents,
        balanceAfterCents: getBalanceCents(nextUser),
        currency: "USD",
        referenceId: `plan:${params.planId}:${now.toISOString()}`,
        metadata: {
          previousPlanId: user.planId,
          nextPlanId: params.planId,
          cadence: params.cadence,
          includedCreditsCents: nextIncludedCreditsCents,
          planName: nextPlan.name,
        },
      },
    });

    return nextUser;
  });

  return toSummary(updated);
}

export async function purchaseTopUp(params: {
  packId: TopUpPackId;
  displayCurrency: Currency;
}): Promise<BillingSummary | null> {
  const user = await requireBillingUser();
  if (!user) {
    return null;
  }

  const pack = getTopUpPackById(params.packId);
  if (!pack) {
    throw new Error("Invalid top-up pack");
  }

  const creditCents = Math.round(pack.creditUsd * 100);
  const amountPaidCents =
    params.displayCurrency === "USD"
      ? Math.round(pack.payPriceUsd * 100)
      : Math.round(pack.payPriceUsd * (await getUsdToMntRate()).usdToMnt);

  const updated = await prisma.$transaction(async (tx) => {
    const nextUser = await tx.user.update({
      where: { id: user.id },
      data: {
        topUpCreditsCents: user.topUpCreditsCents + creditCents,
        billingCurrency: params.displayCurrency,
      },
    });

    await tx.billingTransaction.create({
      data: {
        userId: user.id,
        type: "topup",
        amountPaidCents,
        creditDeltaCents: creditCents,
        balanceAfterCents: getBalanceCents(nextUser),
        currency: params.displayCurrency,
        referenceId: `topup:${pack.id}:${Date.now()}`,
        metadata: {
          packId: pack.id,
          payPriceUsd: pack.payPriceUsd,
          creditUsd: pack.creditUsd,
        },
      },
    });

    return nextUser;
  });

  return toSummary(updated);
}

export async function setBillingCurrency(currency: Currency): Promise<BillingSummary | null> {
  const user = await requireBillingUser();
  if (!user) {
    return null;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { billingCurrency: currency },
  });

  await recordBillingTransaction({
    userId: updated.id,
    type: "currency_change",
    amountPaidCents: 0,
    creditDeltaCents: 0,
    balanceAfterCents: getBalanceCents(updated),
    currency,
    referenceId: `currency:${currency}:${Date.now()}`,
  });

  return toSummary(updated);
}
