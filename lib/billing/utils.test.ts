import { describe, expect, it } from "vitest";

import { getPlanById } from "@/lib/billing/plans";
import {
  addMonths,
  convertCurrency,
  formatCredits,
  formatCurrency,
  getIncludedCredits,
  getPlanPrice,
  getUsdToMntRate,
  setUsdToMntRate,
  toISO,
} from "@/lib/billing/utils";

describe("billing utils", () => {
  it("supports currency conversion both ways", () => {
    setUsdToMntRate(3500);
    expect(convertCurrency(10, "USD", "MNT")).toBe(35000);
    expect(convertCurrency(35000, "MNT", "USD")).toBe(10);
    expect(getUsdToMntRate()).toBe(3500);
  });

  it("formats currency and credits", () => {
    expect(formatCurrency(12.34, "USD", "en")).toContain("$");
    expect(formatCurrency(12000, "MNT", "en")).toContain("MNT");
    expect(formatCredits(1.2, "USD", "en")).toContain("USD");
  });

  it("returns plan pricing and included credits", () => {
    const plan = getPlanById("plus");
    expect(getPlanPrice(plan, "USD", "monthly")).toBe(plan.monthlyPrice.USD);
    expect(getIncludedCredits(plan, "USD")).toBe(
      plan.includedMonthlyCredits.USD,
    );
  });

  it("handles date helpers", () => {
    const date = new Date("2025-01-01T00:00:00.000Z");
    const next = addMonths(date, 2);

    expect(next.getUTCMonth()).toBe(2);
    expect(toISO(date)).toBe("2025-01-01T00:00:00.000Z");
  });
});
