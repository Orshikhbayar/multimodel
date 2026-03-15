import { describe, expect, it } from "vitest";

import {
  BillingUnavailableError,
  ensureBillingUser,
  refundUsageHold,
  resetPeriodIfNeeded,
  settleUsageHold,
} from "@/lib/billing/service";

describe("billing service critical compatibility", () => {
  it("throws BillingUnavailableError for removed legacy paths", async () => {
    await expect(
      ensureBillingUser({ id: "user-1", email: "u@example.com" }),
    ).rejects.toBeInstanceOf(BillingUnavailableError);

    await expect(resetPeriodIfNeeded("user-1")).rejects.toBeInstanceOf(
      BillingUnavailableError,
    );

    await expect(
      settleUsageHold({
        userId: "user-1",
        hold: {
          id: "h1",
          userId: "user-1",
          amountCents: 10,
          includedDebitedCents: 5,
          topUpDebitedCents: 5,
          referenceId: "run-1",
        },
        modelId: "openai/gpt-4.1",
        promptTokens: 10,
        completionTokens: 10,
      }),
    ).rejects.toBeInstanceOf(BillingUnavailableError);

    await expect(
      refundUsageHold({
        userId: "user-1",
        hold: {
          id: "h2",
          userId: "user-1",
          amountCents: 10,
          includedDebitedCents: 5,
          topUpDebitedCents: 5,
          referenceId: "run-2",
        },
        reason: "cancelled",
      }),
    ).rejects.toBeInstanceOf(BillingUnavailableError);
  });
});
