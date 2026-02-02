import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { InteractionMode } from "@/lib/types";

export const MODE_OPTIONS: { value: InteractionMode; label: string; description: string }[] = [
    { value: "smart", label: "Smart", description: "Parallel default responses" },
    { value: "conversation", label: "Conversation", description: "Parallel chat with each model" },
    { value: "ensemble", label: "Ensemble", description: "Parallel then unified synthesis" },
    { value: "expert", label: "Expert", description: "Answer + critique + revised output" },
    { value: "debate", label: "Debate", description: "Pro/con runs then a summary" },
    { value: "simulation", label: "Simulation", description: "Role-play to stress test answers" },
    { value: "web", label: "Web-Aided", description: "Grounded with mocked citations" },
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

const DEFAULT_INSTRUCTIONS = "Keep answers concise, cite disagreements, and surface sources.";

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
        }
    )
);
