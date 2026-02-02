import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { AppSettings } from "./types";

const STORAGE_VERSION = 1;

const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  locale: "en",
  reduceMotion: false,
};

interface AppSettingsStoreState extends AppSettings {
  setTheme: (theme: AppSettings["theme"]) => void;
  setLocale: (locale: string) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
  resetSettings: (options?: { keepTheme?: boolean }) => void;
}

export type AppSettingsStore = AppSettingsStoreState;

export const useAppSettingsStore = create<AppSettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      resetSettings: (options) => {
        const keepTheme = options?.keepTheme;
        set({
          ...DEFAULT_SETTINGS,
          theme: keepTheme ? get().theme : DEFAULT_SETTINGS.theme,
        });
      },
    }),
    {
      name: "multi-model-app-settings",
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (state) => {
        if (!state) return DEFAULT_SETTINGS;
        const typed = state as AppSettingsStore;
        return {
          ...DEFAULT_SETTINGS,
          ...typed,
        } as AppSettingsStore;
      },
      partialize: (state) => ({
        theme: state.theme,
        locale: state.locale,
        reduceMotion: state.reduceMotion,
      }),
    },
  ),
);

export { DEFAULT_SETTINGS };
