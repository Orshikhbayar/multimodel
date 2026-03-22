import { describe, expect, it } from "vitest";

import { generateRuns } from "@/lib/hooks/runGeneration";
import type { ModelSlot } from "@/lib/types";

function buildSlot(slotId: string, label: string, enabled: boolean): ModelSlot {
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
  it("returns only the enabled slot when one model is enabled", () => {
    const slots: ModelSlot[] = [
      buildSlot("slot-1", "Claude 3.5", true),
      buildSlot("slot-2", "Gemini 2.0", false),
    ];

    const runs = generateRuns("single", slots);

    expect(runs).toHaveLength(1);
    expect(runs[0]?.model).toBe("Claude 3.5");
    expect(runs[0]?.status).toBe("queued");
  });

  it("returns a run per enabled model for compare mode", () => {
    const slots: ModelSlot[] = [
      buildSlot("slot-1", "Claude 3.5", true),
      buildSlot("slot-2", "Gemini 2.0", true),
    ];

    const runs = generateRuns("compare", slots);

    expect(runs).toHaveLength(2);
    expect(runs.every((run) => run.status === "queued")).toBe(true);
  });

  it("creates only perspective runs for single mode with multiple enabled models", () => {
    const slots: ModelSlot[] = [
      buildSlot("slot-1", "Claude 3.5", true),
      buildSlot("slot-2", "Gemini 2.0", true),
    ];

    const runs = generateRuns("single", slots);

    expect(runs).toHaveLength(2);
    expect(runs.every((run) => run.status === "queued")).toBe(true);
  });
});
