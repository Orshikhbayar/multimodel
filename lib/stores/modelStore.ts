import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { getModelById, DEFAULT_SLOT_MODEL_IDS } from "@/lib/modelCatalog";
import type { ModelSlot, SlotStatus } from "@/lib/types";

const buildSlot = (slotId: string, modelId: string, enabled = true): ModelSlot => {
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
        buildSlot(`slot-${index + 1}`, modelId, true)
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
                                : slot
                        ),
                    };
                }),

            toggleSlot: (slotId) =>
                set((state) => {
                    const enabledCount = state.slots.filter((slot) => slot.enabled).length;
                    const nextSlots = state.slots.map((slot) => {
                        if (slot.slotId !== slotId) return slot;
                        // Don't allow disabling the last enabled slot
                        if (slot.enabled && enabledCount <= 1) return slot;
                        return { ...slot, enabled: !slot.enabled };
                    });

                    const activeSlot = nextSlots.find((slot) => slot.slotId === state.activeSlotId);
                    const hasEnabledActive = activeSlot?.enabled;
                    const fallbackActive =
                        nextSlots.find((slot) => slot.enabled)?.slotId ?? state.activeSlotId;

                    return {
                        slots: nextSlots,
                        activeSlotId: hasEnabledActive ? state.activeSlotId : fallbackActive,
                    };
                }),

            updateSlotStatus: (slotId, status) =>
                set((state) => ({
                    slots: state.slots.map((slot) =>
                        slot.slotId === slotId ? { ...slot, status } : slot
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
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                slots: state.slots,
                activeSlotId: state.activeSlotId,
            }),
        }
    )
);
