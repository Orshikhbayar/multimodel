"use client";

import { useCallback, useEffect, useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { MessageBubble } from "@/components/MessageBubble";
import { ChatContentContainer } from "@/components/ChatContentContainer";
import type { Conversation, ModelSlot, Run } from "@/lib/types";

interface VirtualizedChatThreadProps {
    conversation?: Conversation;
    activeTab: string;
    slots: ModelSlot[];
    onShowSources: (run: Run) => void;
    onShowDisagreements: (run: Run) => void;
}

/**
 * Virtualized chat thread for long conversations
 * Uses @tanstack/react-virtual for windowed rendering
 */
export function VirtualizedChatThread({
    conversation,
    activeTab,
    slots,
    onShowSources,
    onShowDisagreements,
}: VirtualizedChatThreadProps) {
    const parentRef = useRef<HTMLDivElement>(null);
    const messages = useMemo(() => conversation?.messages ?? [], [conversation]);
    const slotIds = useMemo(() => new Set(slots.map((slot) => slot.slotId)), [slots]);
    const slotById = useMemo(
        () => new Map(slots.map((slot) => [slot.slotId, slot])),
        [slots],
    );
    const activeIsSlot = slotIds.has(activeTab);
    const activeSlot = activeIsSlot ? slotById.get(activeTab) : undefined;

    // Get run for a message based on active tab
    const getRunForMessage = useCallback(
        (message: typeof messages[0]) => {
            if (!message.runs) return undefined;
            if (activeIsSlot) {
                return (
                    message.runs.find((r) => r.slotId === activeTab) ??
                    (activeSlot ? message.runs.find((r) => r.model === activeSlot.label) : undefined) ??
                    message.runs[0]
                );
            }
            return message.runs.find((r) => r.model === activeTab) ?? message.runs[0];
        },
        [activeTab, activeIsSlot, activeSlot],
    );

    // Virtualizer configuration
    const virtualizer = useVirtualizer({
        count: messages.length,
        getScrollElement: () => parentRef.current,
        estimateSize: useCallback(() => 120, []), // Estimated row height
        overscan: 5, // Render 5 items above/below viewport
        getItemKey: useCallback((index: number) => messages[index]?.id ?? index, [messages]),
    });

    // Auto-scroll to bottom on new messages
    const prevLengthRef = useRef(messages.length);
    useEffect(() => {
        if (messages.length > prevLengthRef.current) {
            // New message added, scroll to bottom
            virtualizer.scrollToIndex(messages.length - 1, {
                align: "end",
                behavior: "smooth",
            });
        }
        prevLengthRef.current = messages.length;
    }, [messages.length, virtualizer]);

    // Scroll to bottom on initial render if there are messages
    useEffect(() => {
        if (messages.length > 0) {
            virtualizer.scrollToIndex(messages.length - 1, {
                align: "end",
            });
        }
    }, []);

    const virtualItems = virtualizer.getVirtualItems();

    return (
        <div
            ref={parentRef}
            className="flex-1 overflow-auto rounded-2xl bg-[hsl(var(--app-panel))] shadow-inner"
            style={{ contain: "strict" }}
        >
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                }}
            >
                <ChatContentContainer
                    className="absolute top-0 left-0 w-full"
                    style={{
                        transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
                    }}
                >
                    {virtualItems.map((virtualRow) => {
                        const message = messages[virtualRow.index];
                        if (!message) return null;

                        const run = message.role === "assistant"
                            ? getRunForMessage(message)
                            : undefined;

                        return (
                            <div
                                key={virtualRow.key}
                                data-index={virtualRow.index}
                                ref={virtualizer.measureElement}
                                className="py-3"
                            >
                                <MessageBubble
                                    message={message}
                                    run={run}
                                    onShowSources={onShowSources}
                                    onShowDisagreements={onShowDisagreements}
                                />
                            </div>
                        );
                    })}
                </ChatContentContainer>
            </div>
        </div>
    );
}
