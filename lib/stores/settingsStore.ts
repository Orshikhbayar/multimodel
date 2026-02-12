import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { InteractionMode } from "@/lib/types";

export type WorkflowPreset = "general" | "engineer" | "marketing";

export interface ModeOption {
  value: InteractionMode;
  label: string;
  description: string;
  bestFor: string;
  outputStyle: string;
}

export interface WorkflowPresetOption {
  value: WorkflowPreset;
  label: string;
  description: string;
  recommendedMode: InteractionMode;
  instructions: string;
}

export const MODE_OPTIONS: ModeOption[] = [
  {
    value: "smart",
    label: "Auto",
    description: "Picks the best default behavior for most prompts.",
    bestFor: "Quick everyday prompts when you do not want to tune settings.",
    outputStyle: "Balanced answer with minimal setup.",
  },
  {
    value: "conversation",
    label: "Parallel Answers",
    description: "Each enabled model replies on its own.",
    bestFor: "Comparing styles, strengths, and model-specific opinions.",
    outputStyle: "Multiple separate responses from your selected models.",
  },
  {
    value: "ensemble",
    label: "Combined Answer",
    description: "Models reply, then a single combined summary is produced.",
    bestFor: "One final answer that blends ideas from multiple models.",
    outputStyle: "Per-model drafts plus one synthesized final response.",
  },
  {
    value: "expert",
    label: "Expert Review",
    description: "One model answers, critiques itself, then improves the result.",
    bestFor: "High-quality drafts where reasoning and self-checking matter.",
    outputStyle: "Draft, critique, then revised final output.",
  },
  {
    value: "debate",
    label: "Pros and Cons",
    description: "Models argue different sides before a final summary.",
    bestFor: "Decisions, tradeoffs, and strategic choices.",
    outputStyle: "Contrasting viewpoints followed by a neutral summary.",
  },
  {
    value: "simulation",
    label: "Role-play",
    description: "Runs scenario-style responses to stress test decisions.",
    bestFor: "User interviews, objection handling, and scenario planning.",
    outputStyle: "Simulated roles with situational responses.",
  },
  {
    value: "web",
    label: "Web-backed",
    description: "Uses web-grounded behavior when available.",
    bestFor: "Fresh information and citation-heavy prompts.",
    outputStyle: "Grounded answer with source-oriented output.",
  },
];

export const WORKFLOW_PRESETS: WorkflowPresetOption[] = [
  {
    value: "general",
    label: "General",
    description: "Balanced default for mixed tasks.",
    recommendedMode: "ensemble",
    instructions:
      "Keep answers concise, cite disagreements, and surface sources.",
  },
  {
    value: "engineer",
    label: "Engineer",
    description: "Code-first workflow for debugging and implementation.",
    recommendedMode: "expert",
    instructions:
      "Prioritize correctness and implementation details. Explain assumptions, edge cases, and concrete tests. Use concise code and actionable steps.",
  },
  {
    value: "marketing",
    label: "Marketing",
    description: "Messaging-first workflow for campaigns and content.",
    recommendedMode: "debate",
    instructions:
      "Prioritize clarity, audience fit, and conversion impact. Offer 2-3 message variants with CTA ideas, channels, and measurable success metrics.",
  },
];

interface SettingsStoreState {
  mode: InteractionMode;
  instructions: string;
  workflowPreset: WorkflowPreset;
  onboardingCompleted: boolean;
}

interface SettingsStoreActions {
  setMode: (mode: InteractionMode) => void;
  setInstructions: (text: string) => void;
  setWorkflowPreset: (preset: WorkflowPreset) => void;
  applyWorkflowPreset: (preset: WorkflowPreset) => void;
  completeOnboarding: (preset: WorkflowPreset) => void;
  dismissOnboarding: () => void;
  resetSettings: () => void;
}

export type SettingsStore = SettingsStoreState & SettingsStoreActions;

const DEFAULT_PRESET: WorkflowPreset = "general";
const presetById = Object.fromEntries(
  WORKFLOW_PRESETS.map((preset) => [preset.value, preset]),
) as Record<WorkflowPreset, WorkflowPresetOption>;
const DEFAULT_PRESET_CONFIG = presetById[DEFAULT_PRESET];

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      mode: DEFAULT_PRESET_CONFIG.recommendedMode,
      instructions: DEFAULT_PRESET_CONFIG.instructions,
      workflowPreset: DEFAULT_PRESET,
      onboardingCompleted: false,

      setMode: (mode) => set({ mode }),
      setInstructions: (text) => set({ instructions: text }),
      setWorkflowPreset: (workflowPreset) => set({ workflowPreset }),
      applyWorkflowPreset: (workflowPreset) => {
        const preset = presetById[workflowPreset] ?? DEFAULT_PRESET_CONFIG;
        set({
          workflowPreset,
          mode: preset.recommendedMode,
          instructions: preset.instructions,
        });
      },
      completeOnboarding: (workflowPreset) => {
        const preset = presetById[workflowPreset] ?? DEFAULT_PRESET_CONFIG;
        set({
          workflowPreset,
          mode: preset.recommendedMode,
          instructions: preset.instructions,
          onboardingCompleted: true,
        });
      },
      dismissOnboarding: () => set({ onboardingCompleted: true }),
      resetSettings: () =>
        set({
          mode: DEFAULT_PRESET_CONFIG.recommendedMode,
          instructions: DEFAULT_PRESET_CONFIG.instructions,
          workflowPreset: DEFAULT_PRESET,
          onboardingCompleted: false,
        }),
    }),
    {
      name: "multi-model-settings",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted) => {
        const state = (persisted as Partial<SettingsStore> | null) ?? {};
        return {
          mode: state.mode ?? DEFAULT_PRESET_CONFIG.recommendedMode,
          instructions:
            state.instructions ?? DEFAULT_PRESET_CONFIG.instructions,
          workflowPreset: state.workflowPreset ?? DEFAULT_PRESET,
          onboardingCompleted: state.onboardingCompleted ?? false,
        };
      },
    },
  ),
);
