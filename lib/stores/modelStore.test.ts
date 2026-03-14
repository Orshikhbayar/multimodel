import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("zustand/middleware", async () => {
  const actual = await vi.importActual<typeof import("zustand/middleware")>(
    "zustand/middleware",
  );
  return {
    ...actual,
    persist: (config: unknown) => config,
    createJSONStorage: () => ({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }),
  };
});

const { useModelStore } = await import("@/lib/stores/modelStore");

describe("modelStore", () => {
  beforeEach(() => {
    useModelStore.getState().resetSlots();
  });

  it("sets active slot", () => {
    const first = useModelStore.getState().slots[0]?.slotId;
    const second = useModelStore.getState().slots[1]?.slotId;

    act(() => {
      useModelStore.getState().setActiveSlot(second!);
    });

    expect(useModelStore.getState().activeSlotId).toBe(second);
    expect(useModelStore.getState().activeSlotId).not.toBe(first);
  });

  it("updates slot model", () => {
    const slot = useModelStore.getState().slots[0];

    act(() => {
      useModelStore.getState().setSlotModel(slot.slotId, "openai/gpt-4.1");
    });

    const updated = useModelStore
      .getState()
      .slots.find((entry) => entry.slotId === slot.slotId);
    expect(updated?.modelId).toBe("openai/gpt-4.1");
    expect(updated?.status).toBe("idle");
  });

  it("does not allow disabling last enabled slot", () => {
    const slots = useModelStore.getState().slots;

    act(() => {
      slots.slice(1).forEach((slot) => useModelStore.getState().toggleSlot(slot.slotId));
    });

    const onlyEnabled = useModelStore.getState().slots.find((slot) => slot.enabled)!;

    act(() => {
      useModelStore.getState().toggleSlot(onlyEnabled.slotId);
    });

    const enabledCount = useModelStore.getState().slots.filter((slot) => slot.enabled).length;
    expect(enabledCount).toBe(1);
  });

  it("updates slot status and resets slots", () => {
    const slot = useModelStore.getState().slots[0];

    act(() => {
      useModelStore.getState().updateSlotStatus(slot.slotId, "streaming");
    });
    expect(useModelStore.getState().slots[0].status).toBe("streaming");

    act(() => {
      useModelStore.getState().resetSlots();
    });
    expect(useModelStore.getState().slots[0].status).toBe("idle");
  });
});
