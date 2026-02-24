import { describe, expect, it } from "vitest";

import {
  getNextPlanForModel,
  getNextPlanForSlots,
  getPlanById,
  getTopUpPackById,
  getTopUpPayPrice,
  PLAN_ORDER,
  PLANS,
  TOP_UP_PACKS,
} from "@/lib/billing/plans";

describe("billing plans", () => {
  it("exposes expected plan ordering", () => {
    expect(PLAN_ORDER).toEqual(["free", "plus", "pro", "team"]);
    expect(PLANS.length).toBeGreaterThanOrEqual(4);
  });

  it("resolves known plan and defaults to free", () => {
    expect(getPlanById("plus").id).toBe("plus");
    expect(getPlanById("free").id).toBe("free");
  });

  it("finds next plan for model", () => {
    const plan = getNextPlanForModel("openai/gpt-5.2-codex");
    expect(plan?.id).toBeTruthy();
  });

  it("finds next plan for slot count", () => {
    const plan = getNextPlanForSlots(3);
    expect(plan?.maxEnabledModels).toBeGreaterThanOrEqual(3);
  });

  it("handles top-up packs and MNT conversion", () => {
    const pack = getTopUpPackById("starter");
    expect(pack).toBeDefined();
    expect(TOP_UP_PACKS.length).toBeGreaterThan(0);
    expect(getTopUpPayPrice(pack!, "USD")).toBe(pack!.payPriceUsd);
    expect(getTopUpPayPrice(pack!, "MNT")).toBeGreaterThan(pack!.payPriceUsd);
  });
});
