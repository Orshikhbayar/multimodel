import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';

// We need to mock zustand persist middleware before importing the store
vi.mock('zustand/middleware', async () => {
    const actual = await vi.importActual('zustand/middleware');
    return {
        ...actual,
        persist: (config: unknown) => config,
        createJSONStorage: () => ({
            getItem: () => null,
            setItem: () => { },
            removeItem: () => { },
        }),
    };
});

// Import store after mocking
const { useConversationStore } = await import('@/lib/stores/conversationStore');

describe('conversationStore', () => {
    beforeEach(() => {
        // Reset store state before each test
        const store = useConversationStore.getState();
        useConversationStore.setState({
            conversations: [],
            projects: store.projects, // Keep default projects
            currentConversationId: null,
        });
    });

    describe('createConversation', () => {
        it('creates a new conversation with default title', () => {
            const { createConversation } = useConversationStore.getState();

            act(() => {
                const id = createConversation();
                expect(id).toBeDefined();
            });

            const { conversations, currentConversationId } = useConversationStore.getState();
            expect(conversations).toHaveLength(1);
            expect(conversations[0].title).toBe('New chat');
            expect(currentConversationId).toBe(conversations[0].id);
        });

        it('creates a conversation with custom title', () => {
            const { createConversation } = useConversationStore.getState();

            act(() => {
                createConversation('My Custom Chat');
            });

            const { conversations } = useConversationStore.getState();
            expect(conversations[0].title).toBe('My Custom Chat');
        });

        it('creates a conversation with project association', () => {
            const { createConversation } = useConversationStore.getState();

            act(() => {
                createConversation('Project Chat', 'proj-ops');
            });

            const { conversations } = useConversationStore.getState();
            expect(conversations[0].projectId).toBe('proj-ops');
        });
    });

    describe('addMessages', () => {
        it('adds messages to a conversation', () => {
            const { createConversation, addMessages } = useConversationStore.getState();

            let convId: string;
            act(() => {
                convId = createConversation();
            });

            act(() => {
                addMessages(convId!, [
                    {
                        id: 'msg-1',
                        role: 'user',
                        content: 'Hello!',
                        createdAt: Date.now(),
                    },
                ]);
            });

            const { conversations } = useConversationStore.getState();
            const conv = conversations.find(c => c.id === convId);
            expect(conv?.messages).toHaveLength(1);
            expect(conv?.messages[0].content).toBe('Hello!');
        });
    });

    describe('appendRunChunk', () => {
        it('appends streaming chunks to a run', () => {
            const { createConversation, addMessages, appendRunChunk } = useConversationStore.getState();

            let convId: string;
            act(() => {
                convId = createConversation();
            });

            act(() => {
                addMessages(convId!, [
                    {
                        id: 'msg-1',
                        role: 'assistant',
                        content: '',
                        createdAt: Date.now(),
                        runs: [
                            {
                                id: 'run-1',
                                model: 'gpt-4',
                                status: 'streaming',
                                text: '',
                            },
                        ],
                    },
                ]);
            });

            act(() => {
                appendRunChunk(convId!, 'msg-1', 'run-1', 'Hello ');
                appendRunChunk(convId!, 'msg-1', 'run-1', 'World!');
            });

            const { conversations } = useConversationStore.getState();
            const conv = conversations.find(c => c.id === convId);
            const run = conv?.messages[0].runs?.[0];
            expect(run?.text).toBe('Hello World!');
            expect(run?.status).toBe('streaming');
        });
    });

    describe('completeRun', () => {
        it('marks a run as done with final payload', () => {
            const { createConversation, addMessages, completeRun } = useConversationStore.getState();

            let convId: string;
            act(() => {
                convId = createConversation();
            });

            act(() => {
                addMessages(convId!, [
                    {
                        id: 'msg-1',
                        role: 'assistant',
                        content: '',
                        createdAt: Date.now(),
                        runs: [
                            {
                                id: 'run-1',
                                model: 'gpt-4',
                                status: 'streaming',
                                text: 'Streaming text',
                            },
                        ],
                    },
                ]);
            });

            act(() => {
                completeRun(convId!, 'msg-1', 'run-1', {
                    text: 'Final text',
                    sources: [{ title: 'Source', url: 'https://example.com' }],
                });
            });

            const { conversations } = useConversationStore.getState();
            const conv = conversations.find(c => c.id === convId);
            const run = conv?.messages[0].runs?.[0];
            expect(run?.status).toBe('done');
            expect(run?.text).toBe('Final text');
            expect(run?.sources).toHaveLength(1);
        });
    });

    describe('markRunError', () => {
        it('marks a run as errored', () => {
            const { createConversation, addMessages, markRunError } = useConversationStore.getState();

            let convId: string;
            act(() => {
                convId = createConversation();
            });

            act(() => {
                addMessages(convId!, [
                    {
                        id: 'msg-1',
                        role: 'assistant',
                        content: '',
                        createdAt: Date.now(),
                        runs: [
                            {
                                id: 'run-1',
                                model: 'gpt-4',
                                status: 'streaming',
                                text: '',
                            },
                        ],
                    },
                ]);
            });

            act(() => {
                markRunError(convId!, 'msg-1', 'run-1', 'API Error');
            });

            const { conversations } = useConversationStore.getState();
            const conv = conversations.find(c => c.id === convId);
            const run = conv?.messages[0].runs?.[0];
            expect(run?.status).toBe('error');
            expect(run?.text).toBe('API Error');
        });
    });

    describe('removeConversation', () => {
        it('removes a conversation and selects next one', () => {
            const { createConversation, removeConversation } = useConversationStore.getState();

            let id1 = "";
            let id2 = "";
            act(() => {
                id1 = createConversation('First');
                id2 = createConversation('Second');
            });

            // id2 should be current (most recent)
            expect(useConversationStore.getState().currentConversationId).toBe(id2!);

            act(() => {
                removeConversation(id2!);
            });

            const state = useConversationStore.getState();
            expect(state.conversations).toHaveLength(1);
            expect(state.currentConversationId).toBe(id1);
        });
    });
});
