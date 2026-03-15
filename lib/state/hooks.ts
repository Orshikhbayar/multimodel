import { useAppSettingsStore } from "./settingsStore";
import { useSessionStore } from "./sessionStore";
import { useUserStore } from "./userStore";

export function useUser() {
  return useUserStore((state) => state.user);
}

export function useSettings() {
  return useAppSettingsStore((state) => ({
    theme: state.theme,
    locale: state.locale,
    reduceMotion: state.reduceMotion,
    setTheme: state.setTheme,
    setLocale: state.setLocale,
    setReduceMotion: state.setReduceMotion,
    resetSettings: state.resetSettings,
  }));
}

export function useSession() {
  return useSessionStore((state) => ({
    isAuthenticated: state.isAuthenticated,
    lastActiveAt: state.lastActiveAt,
  }));
}
