import { describe, expect, it } from "vitest";

import {
  BILLING_DEFAULTS,
  estimateChatCost,
  estimateChatCostForSlots,
  estimateImageCost,
  estimateTokenCostUsd,
} from "@/lib/billing/estimator";

describe("billing estimator", () => {
  it("exposes default output token limit", () => {
    expect(BILLING_DEFAULTS.maxOutputTokens).toBeGreaterThan(0);
  });

  it("estimates chat cost in USD", () => {
    const cost = estimateChatCost({
      modelId: "openai/gpt-4.1",
      input: "hello world",
      currency: "USD",
    });

    expect(cost).toBeGreaterThan(0);
  });

  it("estimates token cost in USD with six decimals", () => {
    const cost = estimateTokenCostUsd({
      modelId: "openai/gpt-5.2",
      inputTokens: 100,
      outputTokens: 200,
    });

    expect(cost).toBeGreaterThan(0);
    expect(Number(cost.toFixed(6))).toBe(cost);
  });

  it("aggregates slot costs", () => {
    const total = estimateChatCostForSlots({
      modelIds: ["openai/gpt-4.1", "openai/gpt-5-mini"],
      input: "test",
      currency: "USD",
    });

    expect(total).toBeGreaterThan(0);
  });

  it("estimates image cost", () => {
    const cost = estimateImageCost({
      modelId: "openai/gpt-5.2",
      size: "medium",
      currency: "USD",
    });

    expect(cost).toBeGreaterThanOrEqual(0.05);
  });
});
