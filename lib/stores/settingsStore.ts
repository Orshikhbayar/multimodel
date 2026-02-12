import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { InteractionMode } from "@/lib/types";

export const MODE_OPTIONS: {
  value: InteractionMode;
  label: string;
  description: string;
}[] = [
  {
    value: "smart",
    label: "Auto",
    description: "Picks the best default behavior for most prompts.",
  },
  {
    value: "conversation",
    label: "Parallel Answers",
    description: "Each enabled model replies on its own.",
  },
  {
    value: "ensemble",
    label: "Combined Answer",
    description: "Models reply, then a single combined summary is produced.",
  },
  {
    value: "expert",
    label: "Expert Review",
    description: "One model answers, critiques itself, then improves the result.",
  },
  {
    value: "debate",
    label: "Pros and Cons",
    description: "Models argue different sides before a final summary.",
  },
  {
    value: "simulation",
    label: "Role-play",
    description: "Runs scenario-style responses to stress test decisions.",
  },
  {
    value: "web",
    label: "Web-backed",
    description: "Uses web-grounded behavior when available.",
  },
];

interface SettingsStoreState {
  mode: InteractionMode;
  instructions: string;
}

interface SettingsStoreActions {
  setMode: (mode: InteractionMode) => void;
  setInstructions: (text: string) => void;
  resetSettings: () => void;
}

export type SettingsStore = SettingsStoreState & SettingsStoreActions;

const DEFAULT_INSTRUCTIONS =
  "Keep answers concise, cite disagreements, and surface sources.";

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      mode: "ensemble",
      instructions: DEFAULT_INSTRUCTIONS,

      setMode: (mode) => set({ mode }),
      setInstructions: (text) => set({ instructions: text }),
      resetSettings: () =>
        set({
          mode: "ensemble",
          instructions: DEFAULT_INSTRUCTIONS,
        }),
    }),
    {
      name: "multi-model-settings",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
