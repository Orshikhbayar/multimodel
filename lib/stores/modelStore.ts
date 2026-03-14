import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { getModelById, DEFAULT_SLOT_MODEL_IDS } from "@/lib/modelCatalog";
import type { ModelSlot, SlotStatus } from "@/lib/types";

const buildSlot = (
  slotId: string,
  modelId: string,
  enabled = true,
): ModelSlot => {
  const model = getModelById(modelId);
  return {
    slotId,
    providerId: model?.providerId ?? "misc",
    modelId: model?.id ?? modelId,
    label: model?.label ?? modelId,
    enabled,
    status: "idle",
  };
};

const createDefaultSlots = (): ModelSlot[] =>
  DEFAULT_SLOT_MODEL_IDS.map((modelId, index) =>
    buildSlot(`slot-${index + 1}`, modelId, true),
  );

interface ModelStoreState {
  slots: ModelSlot[];
  activeSlotId: string;
}

interface ModelStoreActions {
  setActiveSlot: (slotId: string) => void;
  setSlotModel: (slotId: string, modelId: string) => void;
  toggleSlot: (slotId: string) => void;
  updateSlotStatus: (slotId: string, status: SlotStatus) => void;
  resetSlots: () => void;
}

export type ModelStore = ModelStoreState & ModelStoreActions;

const initialSlots = createDefaultSlots();
const STORAGE_VERSION = 1;

type PersistedModelStoreState = Pick<ModelStoreState, "slots" | "activeSlotId">;

const migrateSlots = (value: unknown): ModelSlot[] => {
  if (!Array.isArray(value)) return createDefaultSlots();

  const migrated = value
    .map((slot, index) => {
      if (!slot || typeof slot !== "object") return null;
      const candidate = slot as Partial<ModelSlot>;
      const fallbackModelId =
        initialSlots[index]?.modelId ??
        DEFAULT_SLOT_MODEL_IDS[index] ??
        initialSlots[0]?.modelId ??
        "gpt-4o-mini";
      const slotId =
        typeof candidate.slotId === "string"
          ? candidate.slotId
          : `slot-${index + 1}`;
      const modelId =
        typeof candidate.modelId === "string"
          ? candidate.modelId
          : fallbackModelId;
      const enabled =
        typeof candidate.enabled === "boolean" ? candidate.enabled : true;

      return buildSlot(slotId, modelId, enabled);
    })
    .filter((slot): slot is ModelSlot => slot !== null);

  if (migrated.length === 0) return createDefaultSlots();
  if (!migrated.some((slot) => slot.enabled)) {
    migrated[0] = { ...migrated[0], enabled: true };
  }
  return migrated;
};

export const useModelStore = create<ModelStore>()(
  persist(
    (set) => ({
      slots: initialSlots,
      activeSlotId: initialSlots[0]?.slotId ?? "slot-1",

      setActiveSlot: (slotId) => set({ activeSlotId: slotId }),

      setSlotModel: (slotId, modelId) =>
        set((state) => {
          const model = getModelById(modelId);
          return {
            slots: state.slots.map((slot) =>
              slot.slotId === slotId
                ? {
                    ...slot,
                    modelId: model?.id ?? modelId,
                    providerId: model?.providerId ?? slot.providerId,
                    label: model?.label ?? slot.label,
                    status: "idle" as const,
                  }
                : slot,
            ),
          };
        }),

      toggleSlot: (slotId) =>
        set((state) => {
          const enabledCount = state.slots.filter(
            (slot) => slot.enabled,
          ).length;
          const nextSlots = state.slots.map((slot) => {
            if (slot.slotId !== slotId) return slot;
            // Don't allow disabling the last enabled slot
            if (slot.enabled && enabledCount <= 1) return slot;
            return { ...slot, enabled: !slot.enabled };
          });

          const activeSlot = nextSlots.find(
            (slot) => slot.slotId === state.activeSlotId,
          );
          const hasEnabledActive = activeSlot?.enabled;
          const fallbackActive =
            nextSlots.find((slot) => slot.enabled)?.slotId ??
            state.activeSlotId;

          return {
            slots: nextSlots,
            activeSlotId: hasEnabledActive
              ? state.activeSlotId
              : fallbackActive,
          };
        }),

      updateSlotStatus: (slotId, status) =>
        set((state) => ({
          slots: state.slots.map((slot) =>
            slot.slotId === slotId ? { ...slot, status } : slot,
          ),
        })),

      resetSlots: () => {
        const slots = createDefaultSlots();
        set({
          slots,
          activeSlotId: slots[0]?.slotId ?? "slot-1",
        });
      },
    }),
    {
      name: "multi-model-slots",
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState) => {
        const state = persistedState as Partial<PersistedModelStoreState> | undefined;
        const slots = migrateSlots(state?.slots);
        const activeSlotId =
          typeof state?.activeSlotId === "string" &&
          slots.some((slot) => slot.slotId === state.activeSlotId)
            ? state.activeSlotId
            : (slots.find((slot) => slot.enabled)?.slotId ??
              slots[0]?.slotId ??
              "slot-1");

        return {
          slots,
          activeSlotId,
        };
      },
      partialize: (state) => ({
        slots: state.slots,
        activeSlotId: state.activeSlotId,
      }),
    },
  ),
);
