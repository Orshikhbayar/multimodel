import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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
    setCurrentConversation: (id: string) => void;
    updateConversationTitle: (id: string, title: string) => void;
    removeConversation: (id: string) => void;
    addProject: (name: string, description?: string) => void;
    resetConversations: () => void;

    // Message operations
    addMessages: (conversationId: string, messages: Message[]) => void;
    appendRunChunk: (
        conversationId: string,
        messageId: string,
        runId: string,
        chunk: string
    ) => void;
    completeRun: (
        conversationId: string,
        messageId: string,
        runId: string,
        payload?: Partial<Run>
    ) => void;
    markRunError: (
        conversationId: string,
        messageId: string,
        runId: string,
        error?: string
    ) => void;
}

export type ConversationStore = ConversationStoreState & ConversationStoreActions;

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

export const useConversationStore = create<ConversationStore>()(
    persist(
        (set, get) => ({
            conversations: [],
            projects: defaultProjects,
            currentConversationId: null,

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
                        conv.id === id ? { ...conv, title } : conv
                    ),
                })),

            removeConversation: (id) =>
                set((state) => {
                    const nextConversations = state.conversations.filter((conv) => conv.id !== id);
                    const nextCurrent =
                        state.currentConversationId === id
                            ? nextConversations[0]?.id ?? null
                            : state.currentConversationId;
                    return { conversations: nextConversations, currentConversationId: nextCurrent };
                }),

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

            resetConversations: () =>
                set({
                    conversations: [],
                    projects: defaultProjects,
                    currentConversationId: null,
                }),

            addMessages: (conversationId, messages) =>
                set((state) => ({
                    conversations: state.conversations.map((conv) =>
                        conv.id === conversationId
                            ? { ...conv, messages: [...conv.messages, ...messages] }
                            : conv
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
                                            ? { ...r, status: "streaming" as RunStatus, text: `${r.text ?? ""}${chunk}` }
                                            : r
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
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                conversations: state.conversations,
                projects: state.projects,
                currentConversationId: state.currentConversationId,
            }),
        }
    )
);
