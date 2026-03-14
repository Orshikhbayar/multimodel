"use server";

import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getIncludedUsageReport,
  type IncludedUsageReport,
  SupabaseBillingUnavailableError,
} from "@/lib/billing/supabaseService";
import { getPlanById, getTopUpPackById } from "@/lib/billing/plans";
import { getUsdToMntRate } from "@/lib/billing/fx";
import { isUnlimitedTesterEmail } from "@/lib/testerAccess";
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

export type IncludedUsageReportView = IncludedUsageReport;

type BillingProfileRow = {
  id: string;
  plan_id: string;
  billing_cadence: string;
  billing_currency: string;
  period_start_at: string;
  period_end_at: string;
  included_credits_cents: number;
  top_up_credits_cents: number;
  bonus_credits_cents: number;
};

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

function normalizeCadence(value: string): BillingCadence {
  return value === "annual" ? "annual" : "monthly";
}

function normalizeCurrency(value: string): Currency {
  return value === "MNT" ? "MNT" : "USD";
}

function getBalanceCents(
  profile: Pick<
    BillingProfileRow,
    "included_credits_cents" | "top_up_credits_cents" | "bonus_credits_cents"
  >,
) {
  return (
    profile.included_credits_cents +
    profile.top_up_credits_cents +
    profile.bonus_credits_cents
  );
}

function toSummary(profile: BillingProfileRow): BillingSummary {
  const planId = normalizePlanId(profile.plan_id);
  const plan = getPlanById(planId);

  const totalBalanceCents = getBalanceCents(profile);

  return {
    currentPlanId: planId,
    billingCadence: normalizeCadence(profile.billing_cadence),
    currency: normalizeCurrency(profile.billing_currency),
    periodStartISO: profile.period_start_at,
    periodEndISO: profile.period_end_at,
    includedCreditsCents: profile.included_credits_cents,
    topUpCreditsCents: profile.top_up_credits_cents,
    includedCreditsUsd: profile.included_credits_cents / 100,
    topUpCreditsUsd: profile.top_up_credits_cents / 100,
    totalCreditsUsd: totalBalanceCents / 100,
    monthlyPriceUsd: plan.monthlyPrice.USD,
    annualPriceUsd: plan.annualPrice.USD,
    includedMonthlyCreditsUsd: plan.includedMonthlyCredits.USD,
    dailyTokenCap: plan.dailyTokenCap,
    monthlyTokenCap: plan.monthlyTokenCap,
  };
}

function toUnlimitedTesterSummary(profile: BillingProfileRow): BillingSummary {
  const base = toSummary(profile);
  return {
    ...base,
    currentPlanId: "team",
    includedCreditsCents: 100_000_000,
    topUpCreditsCents: 0,
    includedCreditsUsd: 1_000_000,
    topUpCreditsUsd: 0,
    totalCreditsUsd: 1_000_000,
    dailyTokenCap: Number.MAX_SAFE_INTEGER,
    monthlyTokenCap: Number.MAX_SAFE_INTEGER,
  };
}

async function ensureBillingProfile(user: {
  id: string;
  email?: string | null;
}): Promise<BillingProfileRow> {
  const admin = createSupabaseAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("profiles")
    .select(
      "id,plan_id,billing_cadence,billing_currency,period_start_at,period_end_at,included_credits_cents,top_up_credits_cents,bonus_credits_cents",
    )
    .eq("id", user.id)
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

  const { data: created, error: createError } = await admin.rpc(
    "billing_ensure_profile",
    {
      p_subject_id: user.id,
      p_email: user.email ?? undefined,
    },
  );

  if (createError || !created) {
    throw new SupabaseBillingUnavailableError(
      "Failed to create billing profile",
      {
        cause: createError,
      },
    );
  }

  return created as BillingProfileRow;
}

async function resetPeriodIfNeeded(
  profile: BillingProfileRow,
): Promise<BillingProfileRow> {
  const now = new Date();
  const periodEnd = new Date(profile.period_end_at);
  if (now < periodEnd) {
    return profile;
  }

  const admin = createSupabaseAdminClient();
  const { data: updated, error } = await admin.rpc(
    "billing_reset_period_if_needed",
    {
      p_subject_id: profile.id,
    },
  );

  if (error || !updated) {
    throw new SupabaseBillingUnavailableError(
      "Failed to reset billing period",
      {
        cause: error,
      },
    );
  }

  return updated as BillingProfileRow;
}

async function requireBillingProfile() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const profile = await ensureBillingProfile({
    id: session.user.id,
    email: session.user.email,
  });

  return resetPeriodIfNeeded(profile);
}

export async function getBillingSummary(): Promise<BillingSummary | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const profile = await ensureBillingProfile({
    id: session.user.id,
    email: session.user.email,
  }).then(resetPeriodIfNeeded);

  if (!profile) {
    return null;
  }

  if (isUnlimitedTesterEmail(session.user.email)) {
    return toUnlimitedTesterSummary(profile);
  }

  return toSummary(profile);
}

export async function getBillingTransactions(options?: {
  limit?: number;
  offset?: number;
}): Promise<BillingTransactionView[]> {
  const profile = await requireBillingProfile();
  if (!profile) {
    return [];
  }

  const limit = Math.max(1, Math.min(100, options?.limit ?? 100));
  const offset = Math.max(0, options?.offset ?? 0);

  const admin = createSupabaseAdminClient();
  const rangeStart = offset;
  const rangeEnd = offset + limit - 1;

  const { data, error } = await admin
    .from("credit_ledger_events")
    .select("id,type,amount_usd_int,credit_delta_int,reference_id,created_at")
    .eq("subject_id", profile.id)
    .order("created_at", { ascending: false })
    .range(rangeStart, rangeEnd);

  if (error) {
    throw new SupabaseBillingUnavailableError(
      "Failed to read billing transactions",
      {
        cause: error,
      },
    );
  }

  const balanceAfterUsd = getBalanceCents(profile) / 100;
  return (data ?? []).map((record) => ({
    id: record.id,
    type: record.type,
    amountPaid: Number((record.amount_usd_int / 100).toFixed(2)),
    creditDeltaUsd: Number((record.credit_delta_int / 100).toFixed(2)),
    balanceAfterUsd,
    currency: "USD",
    referenceId: record.reference_id,
    createdAtISO: record.created_at,
    note: record.type,
  }));
}

export async function changePlan(params: {
  planId: PlanId;
  cadence: BillingCadence;
}): Promise<BillingSummary | null> {
  const profile = await requireBillingProfile();
  if (!profile) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const providerReferenceId = `plan:${profile.id}:${params.planId}:${params.cadence}:${Date.now()}`;
  const { data: updated, error: rpcError } = await admin.rpc(
    "billing_change_plan_in_app",
    {
      p_subject_id: profile.id,
      p_plan_id: params.planId,
      p_cadence: params.cadence,
      p_reference_id: providerReferenceId,
      p_provider_reference_id: providerReferenceId,
    },
  );

  if (rpcError || !updated) {
    throw new SupabaseBillingUnavailableError("Failed to change plan", {
      cause: rpcError,
    });
  }

  return toSummary(updated as BillingProfileRow);
}

export async function purchaseTopUp(params: {
  packId: TopUpPackId;
  displayCurrency: Currency;
}): Promise<BillingSummary | null> {
  const profile = await requireBillingProfile();
  if (!profile) {
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

  const admin = createSupabaseAdminClient();
  const providerReferenceId = `topup:${profile.id}:${pack.id}:${Date.now()}`;
  const { data: updated, error: rpcError } = await admin.rpc(
    "billing_purchase_topup_manual",
    {
      p_subject_id: profile.id,
      p_credit_delta_int: creditCents,
      p_amount_int: amountPaidCents,
      p_currency: params.displayCurrency,
      p_reference_id: providerReferenceId,
      p_provider_reference_id: providerReferenceId,
      p_metadata: {
        pack_id: pack.id,
        pay_price_usd: pack.payPriceUsd,
        credit_usd: pack.creditUsd,
      },
    },
  );

  if (rpcError || !updated) {
    throw new SupabaseBillingUnavailableError("Failed to apply top-up", {
      cause: rpcError,
    });
  }

  return toSummary(updated as BillingProfileRow);
}

export async function setBillingCurrency(
  currency: Currency,
): Promise<BillingSummary | null> {
  const profile = await requireBillingProfile();
  if (!profile) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const providerReferenceId = `currency:${profile.id}:${currency}:${Date.now()}`;
  const { data: updated, error: rpcError } = await admin.rpc(
    "billing_set_currency",
    {
      p_subject_id: profile.id,
      p_currency: currency,
      p_reference_id: providerReferenceId,
      p_provider_reference_id: providerReferenceId,
    },
  );

  if (rpcError || !updated) {
    throw new SupabaseBillingUnavailableError(
      "Failed to set billing currency",
      {
        cause: rpcError,
      },
    );
  }

  return toSummary(updated as BillingProfileRow);
}

export async function getIncludedUsage(): Promise<IncludedUsageReportView | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  return getIncludedUsageReport(session.user.id);
}
