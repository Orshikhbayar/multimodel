import { describe, expect, it } from "vitest";

import {
  BillingUnavailableError,
  getBalanceCents,
  getIncludedCreditsCentsForPlan,
  getSubscriptionPriceCents,
  recordBillingTransaction,
} from "@/lib/billing/service";

describe("billing service extras", () => {
  it("computes balance and plan pricing helpers", () => {
    expect(
      getBalanceCents({
        includedCreditsCents: 100,
        topUpCreditsCents: 50,
      }),
    ).toBe(150);

    expect(getIncludedCreditsCentsForPlan("plus")).toBeGreaterThan(0);
    expect(getSubscriptionPriceCents("pro", "monthly")).toBeGreaterThan(0);
  });

  it("throws BillingUnavailableError for removed transaction recorder", async () => {
    await expect(
      recordBillingTransaction({
        userId: "user-1",
        type: "topup",
        amountPaidCents: 100,
        creditDeltaCents: 100,
        balanceAfterCents: 200,
        currency: "USD",
        referenceId: "ref-1",
      }),
    ).rejects.toBeInstanceOf(BillingUnavailableError);
  });
});
