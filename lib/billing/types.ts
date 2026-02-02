export type PlanId = "free" | "plus" | "pro" | "team";
export type Currency = "USD" | "MNT";
export type BillingCadence = "monthly" | "annual";

export type PlanFeatures = {
  webSearch: boolean;
  tools: boolean;
  images: boolean;
  projects: boolean;
};

export type Plan = {
  id: PlanId;
  name: string;
  monthlyPrice: Record<Currency, number>;
  annualPrice: Record<Currency, number>;
  includedMonthlyCredits: Record<Currency, number>;
  maxEnabledModels: number;
  features: PlanFeatures;
  allowedModelIds: string[];
};

export type BillingTransaction = {
  id: string;
  type: "subscription" | "topup" | "usage";
  amount: number;
  currency: Currency;
  createdAtISO: string;
  note?: string;
};

export type BillingState = {
  currency: Currency;
  billingCadence: BillingCadence;
  currentPlanId: PlanId;
  periodStartISO: string;
  periodEndISO: string;
  includedCreditsRemaining: number;
  topUpCreditsBalance: number;
  transactions: BillingTransaction[];
};
