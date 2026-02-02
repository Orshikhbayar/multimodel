import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { SessionState } from "./types";

const STORAGE_VERSION = 1;

const DEFAULT_SESSION: SessionState = {
  isAuthenticated: false,
  lastActiveAt: null,
  authToken: null,
};

interface SessionStoreState extends SessionState {
  signIn: (token?: string) => void;
  signOut: () => void;
  touch: () => void;
}

export type SessionStore = SessionStoreState;

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SESSION,
      signIn: (token) =>
        set({
          isAuthenticated: true,
          authToken: token ?? null,
          lastActiveAt: new Date().toISOString(),
        }),
      signOut: () => set({ ...DEFAULT_SESSION }),
      touch: () => set({ lastActiveAt: new Date().toISOString() }),
    }),
    {
      name: "multi-model-session",
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (state) => {
        if (!state) return DEFAULT_SESSION;
        const typed = state as SessionStore;
        return {
          ...DEFAULT_SESSION,
          ...typed,
        } as SessionStore;
      },
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        lastActiveAt: state.lastActiveAt,
        authToken: state.authToken,
      }),
    },
  ),
);

export { DEFAULT_SESSION };
