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
  const retryContentByIndex = useMemo(() => {
    let lastUser = "";
    return messages.map((message) => {
      if (message.role === "user") {
        lastUser = message.content;
      }
      return lastUser;
    });
  }, [messages]);
  const slotIds = useMemo(
    () => new Set(slots.map((slot) => slot.slotId)),
    [slots],
  );
  const slotById = useMemo(
    () => new Map(slots.map((slot) => [slot.slotId, slot])),
    [slots],
  );
  const activeIsSlot = slotIds.has(activeTab);
  const activeSlot = activeIsSlot ? slotById.get(activeTab) : undefined;
  const stickToBottomRef = useRef(true);
  const prevCountRef = useRef(0);

  // Get run for a message based on active tab
  const getRunForMessage = useCallback(
    (message: (typeof messages)[0]) => {
      if (!message.runs) return undefined;
      if (activeIsSlot) {
        return (
          message.runs.find((r) => r.slotId === activeTab) ??
          (activeSlot
            ? message.runs.find((r) => r.model === activeSlot.label)
            : undefined) ??
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
    getItemKey: useCallback(
      (index: number) => messages[index]?.id ?? index,
      [messages],
    ),
  });

  useEffect(() => {
    const viewport = parentRef.current;
    if (!viewport) return;

    const updateStickiness = () => {
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      stickToBottomRef.current = distanceFromBottom <= 48;
    };

    updateStickiness();
    viewport.addEventListener("scroll", updateStickiness, { passive: true });
    return () => viewport.removeEventListener("scroll", updateStickiness);
  }, []);

  // Auto-scroll to bottom when appropriate
  useEffect(() => {
    if (messages.length === 0) return;

    const shouldStick = stickToBottomRef.current;
    const isNewMessage = messages.length > prevCountRef.current;

    if (shouldStick || isNewMessage) {
      virtualizer.scrollToIndex(messages.length - 1, {
        align: "end",
        behavior: isNewMessage ? "smooth" : "auto",
      });
    }

    prevCountRef.current = messages.length;
  }, [messages, activeTab, virtualizer]);

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
          maxWidth="var(--chat-max-width)"
          style={{
            transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
          }}
        >
          {virtualItems.map((virtualRow) => {
            const message = messages[virtualRow.index];
            if (!message) return null;

            const run =
              message.role === "assistant"
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
                  conversationId={conversation?.id}
                  run={run}
                  retryContent={
                    message.role === "assistant"
                      ? retryContentByIndex[virtualRow.index]
                      : undefined
                  }
                  isTurnEnd={
                    message.role === "assistant" &&
                    (!messages[virtualRow.index + 1] ||
                      messages[virtualRow.index + 1]?.role === "user")
                  }
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
