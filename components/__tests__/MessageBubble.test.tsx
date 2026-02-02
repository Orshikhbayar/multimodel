import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageBubble } from '../MessageBubble';
import type { Message, Run } from '@/lib/types';

// Mock lucide-react with all icons used in MessageBubble
vi.mock('lucide-react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('lucide-react')>();
    return {
        ...actual,
        Check: () => <span data-testid="check-icon">Check</span>,
        Copy: () => <span data-testid="copy-icon">Copy</span>,
        RotateCcw: () => <span data-testid="rotate-icon">Rotate</span>,
        ThumbsDown: () => <span data-testid="thumbs-down-icon">ThumbsDown</span>,
        ThumbsUp: () => <span data-testid="thumbs-up-icon">ThumbsUp</span>,
        TriangleAlert: () => <span data-testid="triangle-alert-icon">Alert</span>,
    };
});

describe('MessageBubble', () => {
    const mockOnShowSources = vi.fn();
    const mockOnShowDisagreements = vi.fn();

    const createUserMessage = (content: string): Message => ({
        id: 'msg-user-1',
        role: 'user',
        content,
        createdAt: Date.now(),
    });

    const createAssistantMessage = (run: Run): Message => ({
        id: 'msg-assistant-1',
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        runs: [run],
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('User Messages', () => {
        it('renders user message content', () => {
            const message = createUserMessage('Hello, AI!');

            render(
                <MessageBubble
                    message={message}
                    onShowSources={mockOnShowSources}
                    onShowDisagreements={mockOnShowDisagreements}
                />
            );

            expect(screen.getByText('Hello, AI!')).toBeInTheDocument();
        });

        it('does not show action buttons for user messages', () => {
            const message = createUserMessage('Test');

            render(
                <MessageBubble
                    message={message}
                    onShowSources={mockOnShowSources}
                    onShowDisagreements={mockOnShowDisagreements}
                />
            );

            // User messages should not have copy/thumbs buttons
            expect(screen.queryByTestId('copy-icon')).not.toBeInTheDocument();
            expect(screen.queryByTestId('thumbs-up-icon')).not.toBeInTheDocument();
        });
    });

    describe('Assistant Messages', () => {
        it('renders assistant message with completed run', () => {
            const run: Run = {
                id: 'run-1',
                model: 'GPT-4',
                status: 'done',
                text: 'Here is my response.',
            };
            const message = createAssistantMessage(run);

            render(
                <MessageBubble
                    message={message}
                    run={run}
                    onShowSources={mockOnShowSources}
                    onShowDisagreements={mockOnShowDisagreements}
                />
            );

            expect(screen.getByText(/Here is my response/)).toBeInTheDocument();
        });

        it('shows action buttons for assistant messages with run', () => {
            const run: Run = {
                id: 'run-1',
                model: 'GPT-4',
                status: 'done',
                text: 'Response text',
            };
            const message = createAssistantMessage(run);

            render(
                <MessageBubble
                    message={message}
                    run={run}
                    onShowSources={mockOnShowSources}
                    onShowDisagreements={mockOnShowDisagreements}
                />
            );

            // Assistant messages should have action buttons
            expect(screen.getByTestId('copy-icon')).toBeInTheDocument();
            expect(screen.getByTestId('thumbs-up-icon')).toBeInTheDocument();
            expect(screen.getByTestId('thumbs-down-icon')).toBeInTheDocument();
            expect(screen.getByTestId('rotate-icon')).toBeInTheDocument();
        });

        it('shows error indicator for failed run', () => {
            const run: Run = {
                id: 'run-1',
                model: 'GPT-4',
                status: 'error',
                text: 'API Error occurred',
            };
            const message = createAssistantMessage(run);

            render(
                <MessageBubble
                    message={message}
                    run={run}
                    onShowSources={mockOnShowSources}
                    onShowDisagreements={mockOnShowDisagreements}
                />
            );

            expect(screen.getByTestId('triangle-alert-icon')).toBeInTheDocument();
            expect(screen.getByText('error')).toBeInTheDocument();
        });
    });

    describe('Sources and Disagreements', () => {
        it('shows sources button when run has sources', () => {
            const run: Run = {
                id: 'run-1',
                model: 'GPT-4',
                status: 'done',
                text: 'Response with sources',
                sources: [
                    { title: 'Wikipedia', url: 'https://wikipedia.org' },
                ],
            };
            const message = createAssistantMessage(run);

            render(
                <MessageBubble
                    message={message}
                    run={run}
                    onShowSources={mockOnShowSources}
                    onShowDisagreements={mockOnShowDisagreements}
                />
            );

            const sourcesButton = screen.getByRole('button', { name: /sources/i });
            expect(sourcesButton).toBeInTheDocument();

            fireEvent.click(sourcesButton);
            expect(mockOnShowSources).toHaveBeenCalledWith(run);
        });

        it('shows disagreements button when run has disagreements', () => {
            const run: Run = {
                id: 'run-1',
                model: 'GPT-4',
                status: 'done',
                text: 'Response with disagreements',
                disagreements: [
                    {
                        claim: 'The sky is blue',
                        models: [
                            { model: 'GPT-4', stance: 'Agree' },
                            { model: 'Claude', stance: 'Disagree' },
                        ],
                    },
                ],
            };
            const message = createAssistantMessage(run);

            render(
                <MessageBubble
                    message={message}
                    run={run}
                    onShowSources={mockOnShowSources}
                    onShowDisagreements={mockOnShowDisagreements}
                />
            );

            const disagreementsButton = screen.getByRole('button', { name: /disagreements/i });
            expect(disagreementsButton).toBeInTheDocument();

            fireEvent.click(disagreementsButton);
            expect(mockOnShowDisagreements).toHaveBeenCalledWith(run);
        });

        it('does not show sources button when no sources', () => {
            const run: Run = {
                id: 'run-1',
                model: 'GPT-4',
                status: 'done',
                text: 'Plain response',
            };
            const message = createAssistantMessage(run);

            render(
                <MessageBubble
                    message={message}
                    run={run}
                    onShowSources={mockOnShowSources}
                    onShowDisagreements={mockOnShowDisagreements}
                />
            );

            expect(screen.queryByRole('button', { name: /sources/i })).not.toBeInTheDocument();
        });
    });
});
