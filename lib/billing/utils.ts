import type { BillingCadence, Currency, Plan } from "./types";

const DEFAULT_USD_TO_MNT = Number(
  process.env.NEXT_PUBLIC_USD_TO_MNT_RATE ?? "3568.5492",
);
let usdToMntRate = DEFAULT_USD_TO_MNT;

export function setUsdToMntRate(rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) return;
  usdToMntRate = rate;
}

export function getUsdToMntRate() {
  return usdToMntRate;
}

export function convertCurrency(amount: number, from: Currency, to: Currency) {
  if (from === to) return amount;
  if (from === "USD" && to === "MNT") return amount * usdToMntRate;
  if (from === "MNT" && to === "USD") return amount / usdToMntRate;
  return amount;
}

export function formatCurrency(amount: number, currency: Currency) {
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(amount);
  }

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.round(amount))} MNT`;
}

export function formatCredits(amount: number, currency: Currency) {
  if (currency === "USD") {
    return `${amount.toFixed(2)} USD`;
  }
  return `${Math.round(amount).toLocaleString("en-US")} MNT`;
}

export function getPlanPrice(
  plan: Plan,
  currency: Currency,
  cadence: BillingCadence,
) {
  const usdAmount =
    cadence === "annual" ? plan.annualPrice.USD : plan.monthlyPrice.USD;

  if (currency === "USD") {
    return usdAmount;
  }

  return Math.round(convertCurrency(usdAmount, "USD", "MNT"));
}

export function getIncludedCredits(plan: Plan, currency: Currency) {
  const usdAmount = plan.includedMonthlyCredits.USD;
  if (currency === "USD") {
    return usdAmount;
  }
  return Math.round(convertCurrency(usdAmount, "USD", "MNT"));
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function toISO(date: Date) {
  return date.toISOString();
}
