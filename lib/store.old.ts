import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { DEBATE_TAKES, SOURCE_LIBRARY, startMockStream } from "./mockStream";
import { DEFAULT_SLOT_MODEL_IDS, getModelById } from "./modelCatalog";
import type {
  Conversation,
  InteractionMode,
  Message,
  ModelSlot,
  Project,
  Run,
  RunStatus,
} from "./types";

export const MODE_OPTIONS: {
  value: InteractionMode;
  label: string;
  description: string;
}[] = [
  { value: "smart", label: "Smart", description: "Parallel default responses" },
  {
    value: "conversation",
    label: "Conversation",
    description: "Parallel chat with each model",
  },
  {
    value: "ensemble",
    label: "Ensemble",
    description: "Parallel then unified synthesis",
  },
  {
    value: "expert",
    label: "Expert",
    description: "Answer + critique + revised output",
  },
  {
    value: "debate",
    label: "Debate",
    description: "Pro/con runs then a summary",
  },
  {
    value: "simulation",
    label: "Simulation",
    description: "Role-play to stress test answers",
  },
  {
    value: "web",
    label: "Web-Aided",
    description: "Grounded with mocked citations",
  },
];

const defaultProjects: Project[] = [
  {
    id: "proj-ops",
    name: "Ops Automation",
    description: "Triage and automate support + billing questions",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
  },
  {
    id: "proj-research",
    name: "Research Notebook",
    description: "Multi-model research spikes with citations",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 10,
  },
];

const seedConversation: Conversation = {
  id: "conv-seed",
  title: "Research kickoff",
  createdAt: Date.now() - 1000 * 60 * 60 * 12,
  projectId: defaultProjects[1].id,
  messages: [
    {
      id: "seed-user-1",
      role: "user",
      content:
        "Summarize takeaways from the AI team about parallel model workflows.",
      createdAt: Date.now() - 1000 * 60 * 60 * 12,
    },
    {
      id: "seed-assistant-1",
      role: "assistant",
      content: "",
      createdAt: Date.now() - 1000 * 60 * 60 * 12 + 5000,
      runs: [
        {
          id: "seed-run-gpt",
          model: "GPT-4.1",
          slotId: "slot-1",
          status: "done",
          text: "GPT-4.1: suggests using a steering prompt + safety rail, then delegating fact finding to grounded workers.",
          sources: SOURCE_LIBRARY.slice(0, 2),
        },
        {
          id: "seed-run-claude",
          model: "Claude 3.5",
          slotId: "slot-2",
          status: "done",
          text: "Claude 3.5: recommends keeping plans human-auditable and logging why a model was chosen for each subtask.",
        },
        {
          id: "seed-run-unified",
          model: "Unified",
          status: "done",
          text: "Unified: use 2-3 diverse models in parallel, capture disagreements, and publish a short brief with links to evidence.",
          disagreements: DEBATE_TAKES,
        },
      ],
    },
  ],
};

type RunSeed = Run & { delay?: number };

const buildSlot = (
  slotId: string,
  modelId: string,
  enabled = true,
): ModelSlot => {
  const model = getModelById(modelId);
  return {
    slotId,
    providerId: model?.providerId ?? "misc",
    modelId: model?.id ?? modelId,
    label: model?.label ?? modelId,
    enabled,
    status: "idle",
  };
};

const createDefaultSlots = (): ModelSlot[] =>
  DEFAULT_SLOT_MODEL_IDS.map((modelId, index) =>
    buildSlot(`slot-${index + 1}`, modelId, true),
  );

const initialSlots = createDefaultSlots();

interface ChatState {
  conversations: Conversation[];
  projects: Project[];
  currentConversationId: string | null;
  slots: ModelSlot[];
  activeSlotId: string;
  mode: InteractionMode;
  instructions: string;
  streamHandles: Record<string, () => void>;
  createConversation: (title?: string, projectId?: string) => string;
  setCurrentConversation: (id: string) => void;
  updateConversationTitle: (id: string, title: string) => void;
  addProject: (name: string, description?: string) => void;
  removeConversation: (id: string) => void;
  setActiveSlot: (slotId: string) => void;
  setSlotModel: (slotId: string, modelId: string) => void;
  toggleSlot: (slotId: string) => void;
  setMode: (mode: InteractionMode) => void;
  setInstructions: (text: string) => void;
  resetSettings: () => void;
  sendMessage: (content: string) => void;
  appendRunChunk: (
    conversationId: string,
    messageId: string,
    runId: string,
    chunk: string,
  ) => void;
  completeRun: (
    conversationId: string,
    messageId: string,
    runId: string,
    payload?: Partial<Run>,
  ) => void;
  markRunError: (
    conversationId: string,
    messageId: string,
    runId: string,
    error?: string,
  ) => void;
  registerStream: (runId: string, stop: () => void) => void;
  clearStreams: () => void;
}

const runSeedsForMode = (
  mode: InteractionMode,
  slots: ModelSlot[],
): RunSeed[] => {
  const enabledSlots = slots.filter((slot) => slot.enabled);
  const pickedSlots = enabledSlots.length ? enabledSlots : slots;
  const pickedLabels = pickedSlots.map((slot) => slot.label);

  const baseRuns: RunSeed[] = pickedSlots.map((slot) => ({
    id: nanoid(),
    model: slot.label,
    slotId: slot.slotId,
    status: "streaming",
    text: "",
  }));

  switch (mode) {
    case "ensemble":
      return [
        ...baseRuns,
        {
          id: nanoid(),
          model: "Unified",
          status: "streaming",
          text: "",
          delay: 1200,
        },
      ];
    case "expert": {
      const lead = pickedLabels[0] ?? "Lead Expert";
      const critic = pickedLabels[1] ?? "Critique";
      return [
        ...baseRuns,
        {
          id: nanoid(),
          model: `${lead} (lead)`,
          status: "streaming",
          text: "",
        },
        {
          id: nanoid(),
          model: `${critic} (critique)`,
          status: "streaming",
          text: "",
          delay: 600,
        },
        {
          id: nanoid(),
          model: "Revised",
          status: "streaming",
          text: "",
          delay: 1200,
        },
      ];
    }
    case "debate":
      return [
        ...baseRuns,
        {
          id: nanoid(),
          model: `${pickedLabels[0] ?? "Model A"} (pro)`,
          status: "streaming",
          text: "",
        },
        {
          id: nanoid(),
          model: `${pickedLabels[1] ?? "Model B"} (con)`,
          status: "streaming",
          text: "",
          delay: 400,
        },
        {
          id: nanoid(),
          model: "Unified",
          status: "streaming",
          text: "",
          delay: 1200,
        },
      ];
    case "simulation":
      return [
        ...baseRuns,
        {
          id: nanoid(),
          model: `${pickedLabels[0] ?? "Planner"} (planner)`,
          status: "streaming",
          text: "",
        },
        {
          id: nanoid(),
          model: `${pickedLabels[1] ?? "Skeptic"} (skeptic)`,
          status: "streaming",
          text: "",
          delay: 500,
        },
        {
          id: nanoid(),
          model: "Unified",
          status: "streaming",
          text: "",
          delay: 1100,
        },
      ];
    default:
      return baseRuns;
  }
};

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [seedConversation],
      projects: defaultProjects,
      currentConversationId: seedConversation.id,
      slots: initialSlots,
      activeSlotId: initialSlots[0]?.slotId ?? "slot-1",
      mode: "ensemble",
      instructions:
        "Keep answers concise, cite disagreements, and surface sources.",
      streamHandles: {},

      createConversation: (title = "New chat", projectId) => {
        const id = nanoid();
        const conversation: Conversation = {
          id,
          title,
          projectId,
          createdAt: Date.now(),
          messages: [],
        };
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          currentConversationId: id,
        }));
        return id;
      },

      setCurrentConversation: (id) => set({ currentConversationId: id }),

      updateConversationTitle: (id, title) =>
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id ? { ...conv, title } : conv,
          ),
        })),

      addProject: (name, description) =>
        set((state) => ({
          projects: [
            {
              id: nanoid(),
              name,
              description,
              createdAt: Date.now(),
            },
            ...state.projects,
          ],
        })),

      removeConversation: (id) =>
        set((state) => {
          const nextConversations = state.conversations.filter(
            (conv) => conv.id !== id,
          );
          const nextCurrent =
            state.currentConversationId === id
              ? (nextConversations[0]?.id ?? null)
              : state.currentConversationId;
          return {
            conversations: nextConversations,
            currentConversationId: nextCurrent,
          };
        }),

      setActiveSlot: (slotId) => set({ activeSlotId: slotId }),
      setSlotModel: (slotId, modelId) =>
        set((state) => {
          const model = getModelById(modelId);
          return {
            slots: state.slots.map((slot) =>
              slot.slotId === slotId
                ? {
                    ...slot,
                    modelId: model?.id ?? modelId,
                    providerId: model?.providerId ?? slot.providerId,
                    label: model?.label ?? slot.label,
                    status: "idle",
                  }
                : slot,
            ),
          };
        }),
      toggleSlot: (slotId) =>
        set((state) => {
          const enabledCount = state.slots.filter(
            (slot) => slot.enabled,
          ).length;
          const nextSlots = state.slots.map((slot) => {
            if (slot.slotId !== slotId) return slot;
            if (slot.enabled && enabledCount <= 1) return slot;
            return { ...slot, enabled: !slot.enabled };
          });
          const activeSlot = nextSlots.find(
            (slot) => slot.slotId === state.activeSlotId,
          );
          const hasEnabledActive = activeSlot?.enabled;
          const fallbackActive =
            nextSlots.find((slot) => slot.enabled)?.slotId ??
            state.activeSlotId;
          return {
            slots: nextSlots,
            activeSlotId: hasEnabledActive
              ? state.activeSlotId
              : fallbackActive,
          };
        }),
      setMode: (mode) => set({ mode }),
      setInstructions: (text) => set({ instructions: text }),
      resetSettings: () =>
        set(() => {
          const slots = createDefaultSlots();
          return {
            slots,
            activeSlotId: slots[0]?.slotId ?? "slot-1",
            mode: "ensemble",
            instructions: "",
          };
        }),

      registerStream: (runId, stop) =>
        set((state) => ({
          streamHandles: { ...state.streamHandles, [runId]: stop },
        })),

      clearStreams: () => {
        const handles = get().streamHandles;
        Object.values(handles).forEach((stop) => stop?.());
        set({ streamHandles: {} });
      },

      sendMessage: (content: string) => {
        const state = get();
        const conversationId =
          state.currentConversationId ?? state.createConversation("New chat");
        const runs = runSeedsForMode(state.mode, state.slots);
        const userMessage: Message = {
          id: nanoid(),
          role: "user",
          content,
          createdAt: Date.now(),
        };
        const assistantMessage: Message = {
          id: nanoid(),
          role: "assistant",
          content: "",
          createdAt: Date.now(),
          runs,
        };

        set((current) => ({
          conversations: current.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: [...conv.messages, userMessage, assistantMessage],
                }
              : conv,
          ),
          slots: current.slots.map((slot) =>
            runs.some((run) => run.slotId === slot.slotId)
              ? { ...slot, status: "streaming" }
              : slot,
          ),
        }));

        runs.forEach((run) => {
          const stop = startMockStream({
            model: run.model,
            mode: state.mode,
            delay: run.delay ?? 100,
            onToken: (chunk) =>
              get().appendRunChunk(
                conversationId,
                assistantMessage.id,
                run.id,
                chunk,
              ),
            onDone: (payload) =>
              get().completeRun(
                conversationId,
                assistantMessage.id,
                run.id,
                payload,
              ),
            onError: () =>
              get().markRunError(
                conversationId,
                assistantMessage.id,
                run.id,
                "error",
              ),
          });

          get().registerStream(run.id, stop);
        });
      },

      appendRunChunk: (conversationId, messageId, runId, chunk) =>
        set((state) => ({
          conversations: state.conversations.map((conv) => {
            if (conv.id !== conversationId) return conv;
            return {
              ...conv,
              messages: conv.messages.map((msg) => {
                if (msg.id !== messageId || !msg.runs) return msg;
                return {
                  ...msg,
                  runs: msg.runs.map((r) =>
                    r.id === runId
                      ? {
                          ...r,
                          status: "streaming",
                          text: `${r.text ?? ""}${chunk}`,
                        }
                      : r,
                  ),
                };
              }),
            };
          }),
        })),

      completeRun: (conversationId, messageId, runId, payload = {}) =>
        set((state) => {
          let slotId: string | undefined;
          const conversations = state.conversations.map((conv) => {
            if (conv.id !== conversationId) return conv;
            return {
              ...conv,
              messages: conv.messages.map((msg) => {
                if (msg.id !== messageId || !msg.runs) return msg;
                return {
                  ...msg,
                  runs: msg.runs.map((r) => {
                    if (r.id !== runId) return r;
                    slotId = r.slotId;
                    return {
                      ...r,
                      ...payload,
                      status:
                        (payload.status as RunStatus | undefined) ?? "done",
                      text: payload.text ?? r.text,
                      sources: payload.sources ?? r.sources,
                      disagreements: payload.disagreements ?? r.disagreements,
                    };
                  }),
                };
              }),
            };
          });

          const slots = slotId
            ? state.slots.map((slot) =>
                slot.slotId === slotId
                  ? { ...slot, status: "done" as const }
                  : slot,
              )
            : state.slots;

          return { conversations, slots };
        }),

      markRunError: (conversationId, messageId, runId, error) =>
        set((state) => {
          let slotId: string | undefined;
          const conversations = state.conversations.map((conv) => {
            if (conv.id !== conversationId) return conv;
            return {
              ...conv,
              messages: conv.messages.map((msg) => {
                if (msg.id !== messageId || !msg.runs) return msg;
                return {
                  ...msg,
                  runs: msg.runs.map((r) => {
                    if (r.id !== runId) return r;
                    slotId = r.slotId;
                    return {
                      ...r,
                      status: "error" as const,
                      text: error ?? r.text,
                    };
                  }),
                };
              }),
            };
          });

          const slots = slotId
            ? state.slots.map((slot) =>
                slot.slotId === slotId
                  ? { ...slot, status: "error" as const }
                  : slot,
              )
            : state.slots;

          return { conversations, slots };
        }),
    }),
    {
      name: "multi-model-chat",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        conversations: state.conversations,
        projects: state.projects,
        currentConversationId: state.currentConversationId,
        slots: state.slots,
        activeSlotId: state.activeSlotId,
        mode: state.mode,
        instructions: state.instructions,
      }),
    },
  ),
);
