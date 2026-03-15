import { describe, expect, it } from "vitest";

import {
  BillingUnavailableError,
  calculateUsageCostCents,
  checkQuota,
  estimatePromptTokensFromMessages,
  estimateUsageHoldCents,
  reserveUsageHold,
} from "@/lib/billing/service";

describe("billing service compatibility", () => {
  it("calculates deterministic model-weighted usage cost", () => {
    const cents = calculateUsageCostCents({
      modelId: "openai/gpt-4.1",
      promptTokens: 1000,
      completionTokens: 1000,
    });

    expect(cents).toBe(4);
  });

  it("estimates hold with safety margin", () => {
    const holdCents = estimateUsageHoldCents({
      modelId: "openai/gpt-4.1",
      estimatedPromptTokens: 1000,
      maxOutputTokens: 1000,
    });

    expect(holdCents).toBeGreaterThan(0);
  });

  it("estimates prompt tokens from message content", () => {
    const tokens = estimatePromptTokensFromMessages([
      { content: "hello world" },
      { content: "abc" },
    ]);

    expect(tokens).toBe(Math.ceil(("hello world".length + 3) / 3));
  });

  it("throws BillingUnavailableError for removed mutation helpers", async () => {
    await expect(checkQuota("user-1", "free")).rejects.toBeInstanceOf(
      BillingUnavailableError,
    );

    await expect(
      reserveUsageHold({
        userId: "user-1",
        referenceId: "run-1",
        modelId: "openai/gpt-4.1",
        estimatedPromptTokens: 100,
        maxOutputTokens: 100,
      }),
    ).rejects.toBeInstanceOf(BillingUnavailableError);
  });
});
