import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { normalizeLocale } from "@/lib/i18n/locale";
import type {
  Conversation,
  Message,
  Project,
  Run,
  RunStatus,
} from "@/lib/types";

interface ConversationStoreState {
  conversations: Conversation[];
  projects: Project[];
  currentConversationId: string | null;
}

interface ConversationStoreActions {
  createConversation: (title?: string, projectId?: string) => string;
  setCurrentConversation: (id: string | null) => void;
  updateConversationTitle: (id: string, title: string) => void;
  removeConversation: (id: string) => void;
  addProject: (name: string, description?: string) => Project;
  resetConversations: () => void;
  updateMessageContent: (
    conversationId: string,
    messageId: string,
    content: string,
  ) => void;
  replaceTurnAssistant: (
    conversationId: string,
    userMessageId: string,
    newAssistantMessages: Message[],
  ) => void;
  interruptStreamingRuns: (conversationId: string) => void;

  // Message operations
  addMessages: (conversationId: string, messages: Message[]) => void;
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
}

export type ConversationStore = ConversationStoreState &
  ConversationStoreActions;
const STORAGE_VERSION = 1;

type PersistedConversationStoreState = Pick<
  ConversationStoreState,
  "conversations" | "projects" | "currentConversationId"
>;

const defaultProjectsEn: Project[] = [
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

const defaultProjectsMn: Project[] = [
  {
    id: "proj-ops",
    name: "Үйл ажиллагааны автоматжуулалт",
    description: "Дэмжлэг ба төлбөрийн асуултыг ангилж автоматжуулна",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
  },
  {
    id: "proj-research",
    name: "Судалгааны дэвтэр",
    description: "Эшлэлтэй олон загварын судалгааны туршилтууд",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 10,
  },
];

function getSeedLocale(): "en" | "mn" {
  if (typeof window === "undefined") return "en";
  try {
    const raw = window.localStorage.getItem("multi-model-app-settings");
    if (!raw) return "en";
    const parsed = JSON.parse(raw) as { state?: { locale?: string } };
    return normalizeLocale(parsed.state?.locale) === "mn" ? "mn" : "en";
  } catch {
    return "en";
  }
}

function getDefaultChatTitle(): string {
  return getSeedLocale() === "mn" ? "Нэргүй чат" : "Untitled chat";
}

function getDefaultProjects(): Project[] {
  const source =
    getSeedLocale() === "mn" ? defaultProjectsMn : defaultProjectsEn;
  return source.map((project) => ({ ...project }));
}

export const useConversationStore = create<ConversationStore>()(
  persist(
    (set) => ({
      conversations: [],
      projects: getDefaultProjects(),
      currentConversationId: null,

      createConversation: (title = getDefaultChatTitle(), projectId) => {
        const id = crypto.randomUUID();
        set((state) => {
          const safeTitle = title.trim() || getDefaultChatTitle();
          const safeProjectId =
            typeof projectId === "string" &&
            state.projects.some((project) => project.id === projectId)
              ? projectId
              : undefined;

          const conversation: Conversation = {
            id,
            title: safeTitle,
            projectId: safeProjectId,
            createdAt: Date.now(),
            messages: [],
          };

          return {
            conversations: [conversation, ...state.conversations],
            currentConversationId: id,
          };
        });
        return id;
      },

      setCurrentConversation: (id) => set({ currentConversationId: id }),

      updateConversationTitle: (id, title) =>
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id ? { ...conv, title } : conv,
          ),
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

      addProject: (name, description) => {
        const project: Project = {
          id: crypto.randomUUID(),
          name,
          description,
          createdAt: Date.now(),
        };

        set((state) => ({
          projects: [project, ...state.projects],
        }));

        return project;
      },

      resetConversations: () =>
        set({
          conversations: [],
          projects: getDefaultProjects(),
          currentConversationId: null,
        }),

      updateMessageContent: (conversationId, messageId, content) =>
        set((state) => ({
          conversations: state.conversations.map((conv) => {
            if (conv.id !== conversationId) return conv;
            return {
              ...conv,
              messages: conv.messages.map((msg) =>
                msg.id === messageId
                  ? msg.content === content
                    ? msg
                    : {
                        ...msg,
                        content,
                        editedAt: Date.now(),
                      }
                  : msg,
              ),
            };
          }),
        })),

      replaceTurnAssistant: (
        conversationId,
        userMessageId,
        newAssistantMessages,
      ) =>
        set((state) => ({
          conversations: state.conversations.map((conv) => {
            if (conv.id !== conversationId) return conv;
            const userIndex = conv.messages.findIndex(
              (msg) => msg.id === userMessageId,
            );
            if (userIndex === -1) return conv;

            let endExclusive = conv.messages.length;
            for (let i = userIndex + 1; i < conv.messages.length; i += 1) {
              if (conv.messages[i]?.role === "user") {
                endExclusive = i;
                break;
              }
            }

            return {
              ...conv,
              messages: [
                ...conv.messages.slice(0, userIndex + 1),
                ...newAssistantMessages,
                ...conv.messages.slice(endExclusive),
              ],
            };
          }),
        })),

      interruptStreamingRuns: (conversationId) =>
        set((state) => ({
          conversations: state.conversations.map((conv) => {
            if (conv.id !== conversationId) return conv;
            return {
              ...conv,
              messages: conv.messages.map((msg) => {
                if (!msg.runs) return msg;
                return {
                  ...msg,
                  runs: msg.runs.map((run) =>
                    run.status === "streaming" || run.status === "queued"
                      ? {
                          ...run,
                          status: "done" as RunStatus,
                          interrupted: true,
                        }
                      : run,
                  ),
                };
              }),
            };
          }),
        })),

      addMessages: (conversationId, messages) =>
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? { ...conv, messages: [...conv.messages, ...messages] }
              : conv,
          ),
        })),

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
                          status: "streaming" as RunStatus,
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
        set((state) => ({
          conversations: state.conversations.map((conv) => {
            if (conv.id !== conversationId) return conv;
            return {
              ...conv,
              messages: conv.messages.map((msg) => {
                if (msg.id !== messageId || !msg.runs) return msg;
                return {
                  ...msg,
                  runs: msg.runs.map((r) => {
                    if (r.id !== runId) return r;
                    return {
                      ...r,
                      ...payload,
                      status: (payload.status ?? "done") as RunStatus,
                      text: payload.text ?? r.text,
                      sources: payload.sources ?? r.sources,
                      disagreements: payload.disagreements ?? r.disagreements,
                    };
                  }),
                };
              }),
            };
          }),
        })),

      markRunError: (conversationId, messageId, runId, error) =>
        set((state) => ({
          conversations: state.conversations.map((conv) => {
            if (conv.id !== conversationId) return conv;
            return {
              ...conv,
              messages: conv.messages.map((msg) => {
                if (msg.id !== messageId || !msg.runs) return msg;
                return {
                  ...msg,
                  runs: msg.runs.map((r) => {
                    if (r.id !== runId) return r;
                    return {
                      ...r,
                      status: "error" as RunStatus,
                      text: error ?? r.text,
                    };
                  }),
                };
              }),
            };
          }),
        })),
    }),
    {
      name: "multi-model-conversations",
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState) => {
        const state = persistedState as
          | Partial<PersistedConversationStoreState>
          | undefined;
        const conversations = Array.isArray(state?.conversations)
          ? state.conversations
          : [];
        const projects =
          Array.isArray(state?.projects) && state.projects.length > 0
            ? state.projects
            : getDefaultProjects();
        const currentConversationId =
          typeof state?.currentConversationId === "string" &&
          conversations.some((conversation) => {
            return conversation.id === state.currentConversationId;
          })
            ? state.currentConversationId
            : null;

        return {
          conversations,
          projects,
          currentConversationId,
        };
      },
      partialize: (state) => ({
        conversations: state.conversations,
        projects: state.projects,
        currentConversationId: state.currentConversationId,
      }),
    },
  ),
);
