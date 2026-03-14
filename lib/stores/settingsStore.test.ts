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
      useSettingsStore.getState().setMode("debate");
      useSettingsStore.getState().setInstructions("Test instructions");
    });

    expect(useSettingsStore.getState().mode).toBe("debate");
    expect(useSettingsStore.getState().instructions).toBe("Test instructions");
  });

  it("applies workflow preset", () => {
    act(() => {
      useSettingsStore.getState().applyWorkflowPreset("engineer");
    });

    const state = useSettingsStore.getState();
    expect(state.workflowPreset).toBe("engineer");
    expect(state.mode).toBe("expert");
  });

  it("completes and dismisses onboarding", () => {
    act(() => {
      useSettingsStore.getState().completeOnboarding("marketing");
    });
    expect(useSettingsStore.getState().onboardingCompleted).toBe(true);

    act(() => {
      useSettingsStore.getState().dismissOnboarding();
    });
    expect(useSettingsStore.getState().onboardingCompleted).toBe(true);
  });

  it("applies workflow pack selection defaults", () => {
    act(() => {
      useSettingsStore.getState().selectWorkflowPack("online-seller");
    });

    const state = useSettingsStore.getState();
    expect(state.selectedWorkflowPackId).toBe("online-seller");
    expect(state.workflowPreset).toBe("marketing");
    expect(state.mode).toBe("debate");
    expect(state.instructions).toContain("customer-facing");
  });
});
