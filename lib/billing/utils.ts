import type { BillingCadence, Currency, Plan } from "./types";

export const USD_TO_MNT = 3450;

export function convertCurrency(amount: number, from: Currency, to: Currency) {
  if (from === to) return amount;
  if (from === "USD" && to === "MNT") return amount * USD_TO_MNT;
  if (from === "MNT" && to === "USD") return amount / USD_TO_MNT;
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

export function getPlanPrice(plan: Plan, currency: Currency, cadence: BillingCadence) {
  return cadence === "annual" ? plan.annualPrice[currency] : plan.monthlyPrice[currency];
}

export function getIncludedCredits(plan: Plan, currency: Currency) {
  return plan.includedMonthlyCredits[currency];
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function toISO(date: Date) {
  return date.toISOString();
}
