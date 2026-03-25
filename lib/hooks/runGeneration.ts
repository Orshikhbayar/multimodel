import type { InteractionMode, ModelSlot, Run } from "@/lib/types";

export const UNIFIED_MODEL_NAME = "Unified";

export function generateRuns(mode: InteractionMode, slots: ModelSlot[]): Run[] {
  const enabledSlots = slots.filter((slot) => slot.enabled);
  const pickedSlots = enabledSlots.length ? enabledSlots : slots.slice(0, 1);

  const baseRuns: Run[] = pickedSlots.map((slot) => ({
    id: crypto.randomUUID(),
    model: slot.label,
    slotId: slot.slotId,
    status: "queued",
    text: "",
  }));

  // Only in "team" mode: add a Unified judge run
  if (mode === "team" && pickedSlots.length >= 2) {
    baseRuns.push({
      id: crypto.randomUUID(),
      model: UNIFIED_MODEL_NAME,
      status: "queued",
      text: "",
    });
  }

  return baseRuns;
}
