import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CollaborationMode, InteractionMode } from "@/lib/types";

export interface ModeOption {
  value: InteractionMode;
  label: string;
  description: string;
  bestFor: string;
  outputStyle: string;
}

export const MODE_OPTIONS: ModeOption[] = [
  {
    value: "single",
    label: "Single",
    description: "One model answers your prompt.",
    bestFor: "Quick questions and focused tasks.",
    outputStyle: "One response from your selected model.",
  },
  {
    value: "compare",
    label: "Compare",
    description:
      "Multiple models answer simultaneously — compare side by side.",
    bestFor: "Finding the best answer and exploring different perspectives.",
    outputStyle: "Multiple responses shown side by side.",
  },
  {
    value: "team",
    label: "Team",
    description:
      "Multiple models collaborate — one judges and unifies the best answer.",
    bestFor: "Getting the strongest answer from combined AI perspectives.",
    outputStyle: "Unified synthesis backed by individual model perspectives.",
  },
];

interface SettingsStoreState {
  mode: InteractionMode;
  instructions: string;
  collaborationMode: CollaborationMode;
  webSearchEnabled: boolean;
}

interface SettingsStoreActions {
  setMode: (mode: InteractionMode) => void;
  setInstructions: (text: string) => void;
  setCollaborationMode: (mode: CollaborationMode) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
  resetSettings: () => void;
}

export type SettingsStore = SettingsStoreState & SettingsStoreActions;

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      mode: "compare",
      instructions: "",
      collaborationMode: "none",
      webSearchEnabled: false,

      setMode: (mode) => set({ mode }),
      setInstructions: (text) => set({ instructions: text }),
      setCollaborationMode: (collaborationMode) => set({ collaborationMode }),
      setWebSearchEnabled: (webSearchEnabled) => set({ webSearchEnabled }),
      resetSettings: () =>
        set({
          mode: "compare",
          instructions: "",
          collaborationMode: "none",
          webSearchEnabled: false,
        }),
    }),
    {
      name: "multi-model-settings",
      version: 5,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted) => {
        const state = (persisted as Partial<SettingsStore> | null) ?? {};
        // Map old modes to new ones
        let mode: InteractionMode = "compare";
        const oldMode = (state as { mode?: string }).mode;
        if (
          oldMode === "single" ||
          oldMode === "compare" ||
          oldMode === "team"
        ) {
          mode = oldMode;
        } else if (
          oldMode === "smart" ||
          oldMode === "conversation" ||
          oldMode === "ensemble"
        ) {
          mode = "compare";
        }
        return {
          mode,
          instructions: state.instructions ?? "",
          collaborationMode: "none",
          webSearchEnabled: false,
        };
      },
    },
  ),
);
