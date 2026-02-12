import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { normalizeLocale } from "@/lib/i18n/locale";
import { getInitialFromName } from "./utils";
import type { UserPlanId, UserProfile } from "./types";

const STORAGE_VERSION = 1;

const DEFAULT_USER: UserProfile = {
  id: "guest",
  email: "",
  name: "Guest",
  avatarInitial: "G",
  plan: "free",
  locale: "en",
};

interface UserStoreState {
  user: UserProfile;
  setUser: (user: UserProfile) => void;
  updateProfile: (payload: { name?: string; email?: string }) => void;
  setPlan: (plan: UserPlanId) => void;
  setLocale: (locale: string) => void;
  resetUser: () => void;
}

export type UserStore = UserStoreState;

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      user: DEFAULT_USER,
      setUser: (user) => set({ user }),
      updateProfile: ({ name, email }) =>
        set((state) => {
          const nextName = name ?? state.user.name;
          const nextEmail = email ?? state.user.email;
          return {
            user: {
              ...state.user,
              name: nextName,
              email: nextEmail,
              avatarInitial: getInitialFromName(
                nextName || nextEmail,
                state.user.avatarInitial,
              ),
            },
          };
        }),
      setPlan: (plan) =>
        set((state) => ({
          user: {
            ...state.user,
            plan,
          },
        })),
      setLocale: (locale) =>
        set((state) => ({
          user: {
            ...state.user,
            locale: normalizeLocale(locale),
          },
        })),
      resetUser: () => set({ user: DEFAULT_USER }),
    }),
    {
      name: "multi-model-user",
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (state) => {
        if (!state) return { user: DEFAULT_USER };
        const typed = state as UserStore;
        if (!typed.user) {
          return { user: DEFAULT_USER };
        }
        return {
          user: {
            ...DEFAULT_USER,
            ...typed.user,
            locale: normalizeLocale(typed.user.locale),
          },
        } as UserStore;
      },
      partialize: (state) => ({ user: state.user }),
    },
  ),
);

export { DEFAULT_USER };
