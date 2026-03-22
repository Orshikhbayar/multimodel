import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("zustand/middleware", async () => {
  const actual =
    await vi.importActual<typeof import("zustand/middleware")>(
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

const { useSettingsStore } = await import("@/lib/stores/settingsStore");

describe("settingsStore", () => {
  beforeEach(() => {
    useSettingsStore.getState().resetSettings();
  });

  it("updates mode and instructions", () => {
    act(() => {
      useSettingsStore.getState().setMode("compare");
      useSettingsStore.getState().setInstructions("Test instructions");
    });

    expect(useSettingsStore.getState().mode).toBe("compare");
    expect(useSettingsStore.getState().instructions).toBe("Test instructions");
  });

  it("resets to default mode and clears instructions", () => {
    act(() => {
      useSettingsStore.getState().setMode("compare");
      useSettingsStore.getState().setInstructions("some instructions");
    });

    act(() => {
      useSettingsStore.getState().resetSettings();
    });

    expect(useSettingsStore.getState().mode).toBe("compare");
    expect(useSettingsStore.getState().instructions).toBe("");
  });
});
