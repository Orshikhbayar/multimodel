import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, useAppSettingsStore } from "@/lib/state/settingsStore";

describe("app settings store", () => {
  it("updates locale/theme/motion", () => {
    act(() => {
      useAppSettingsStore.getState().setTheme("dark");
      useAppSettingsStore.getState().setLocale("mn-MN");
      useAppSettingsStore.getState().setReduceMotion(true);
    });

    const state = useAppSettingsStore.getState();
    expect(state.theme).toBe("dark");
    expect(state.locale).toBe("mn");
    expect(state.reduceMotion).toBe(true);
  });

  it("resets settings and optionally keeps theme", () => {
    act(() => {
      useAppSettingsStore.getState().setTheme("dark");
      useAppSettingsStore.getState().resetSettings({ keepTheme: true });
    });
    expect(useAppSettingsStore.getState().theme).toBe("dark");

    act(() => {
      useAppSettingsStore.getState().resetSettings();
    });
    expect(useAppSettingsStore.getState().theme).toBe(DEFAULT_SETTINGS.theme);
  });
});
