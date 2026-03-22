import { describe, expect, it } from "vitest";

import {
  getNextPlanForModel,
  getNextPlanForSlots,
  getPlanById,
  PLAN_ORDER,
  PLANS,
} from "@/lib/billing/plans";

describe("billing plans", () => {
  it("exposes expected plan ordering", () => {
    expect(PLAN_ORDER).toEqual(["free", "pro"]);
    expect(PLANS.length).toBe(2);
  });

  it("resolves known plan and defaults to free", () => {
    expect(getPlanById("pro").id).toBe("pro");
    expect(getPlanById("free").id).toBe("free");
  });

  it("finds next plan for model", () => {
    const plan = getNextPlanForModel("openai/gpt-4o");
    expect(plan?.id).toBeTruthy();
  });

  it("finds next plan for slot count", () => {
    const plan = getNextPlanForSlots(3);
    expect(plan?.maxEnabledModels).toBeGreaterThanOrEqual(3);
  });
});
