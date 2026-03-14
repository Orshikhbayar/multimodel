import { describe, expect, it } from "vitest";

import { generateRuns } from "@/lib/hooks/runGeneration";
import type { ModelSlot } from "@/lib/types";

function buildSlot(
  slotId: string,
  label: string,
  enabled: boolean,
): ModelSlot {
  return {
    slotId,
    providerId: "openai",
    modelId: `openai/${label.toLowerCase().replace(/\s+/g, "-")}`,
    label,
    enabled,
    status: "idle",
  };
}

describe("generateRuns", () => {
  it("does not create Unified run for ensemble when only one model is enabled", () => {
    const slots: ModelSlot[] = [
      buildSlot("slot-1", "Claude 3.5", true),
      buildSlot("slot-2", "Gemini 2.0", false),
    ];

    const runs = generateRuns("ensemble", slots);

    expect(runs).toHaveLength(1);
    expect(runs[0]?.model).toBe("Claude 3.5");
    expect(runs[0]?.status).toBe("queued");
    expect(runs.some((run) => run.model === "Unified")).toBe(false);
  });

  it("creates Unified run for ensemble when at least two models are enabled", () => {
    const slots: ModelSlot[] = [
      buildSlot("slot-1", "Claude 3.5", true),
      buildSlot("slot-2", "Gemini 2.0", true),
    ];

    const runs = generateRuns("ensemble", slots);
    const perspectiveRuns = runs.filter((run) => run.model !== "Unified");
    const unifiedRuns = runs.filter((run) => run.model === "Unified");

    expect(perspectiveRuns).toHaveLength(2);
    expect(perspectiveRuns.every((run) => run.status === "queued")).toBe(true);
    expect(unifiedRuns).toHaveLength(1);
    expect(unifiedRuns[0]?.status).toBe("streaming");
  });

  it("creates only perspective runs for conversation mode", () => {
    const slots: ModelSlot[] = [
      buildSlot("slot-1", "Claude 3.5", true),
      buildSlot("slot-2", "Gemini 2.0", true),
    ];

    const runs = generateRuns("conversation", slots);

    expect(runs).toHaveLength(2);
    expect(runs.every((run) => run.model !== "Unified")).toBe(true);
    expect(runs.every((run) => run.status === "queued")).toBe(true);
  });
});
