"use client";

import { useEffect, useMemo, useRef } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageItem } from "./MessageItem";
import { ContentColumn } from "@/components/layout";
import type { Conversation, ModelSlot, Run } from "@/lib/types";

interface MessageListProps {
  conversation?: Conversation;
  activeTab: string;
  slots: ModelSlot[];
  onShowSources: (run: Run) => void;
  onShowDisagreements: (run: Run) => void;
}

export function MessageList({
  conversation,
  activeTab,
  slots,
  onShowSources,
  onShowDisagreements,
}: MessageListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const messages = useMemo(() => conversation?.messages ?? [], [conversation]);
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
  let lastUserContent: string | undefined;

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector(
      "[data-scroll-container]",
    ) as HTMLElement | null;
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

  useEffect(() => {
    const shouldStick = stickToBottomRef.current;
    const isNewMessage = messages.length > prevCountRef.current;
    const behavior = isNewMessage ? "smooth" : "auto";

    if (shouldStick || isNewMessage) {
      bottomRef.current?.scrollIntoView({ behavior });
    }

    prevCountRef.current = messages.length;
  }, [messages, activeTab]);

  return (
    <ScrollArea
      ref={scrollAreaRef}
      className="flex-1 rounded-2xl bg-[hsl(var(--app-panel))] shadow-inner"
      role="log"
      aria-label="Chat messages"
      aria-live="polite"
    >
      <ContentColumn
        className="space-y-6 py-6 pb-28"
        id="main-content"
        maxWidth="var(--chat-max-width)"
      >
        {messages.map((message, index) => {
          const nextMessage = messages[index + 1];
          const isTurnEnd =
            message.role === "assistant" &&
            (!nextMessage || nextMessage.role === "user");
          if (message.role === "user") {
            lastUserContent = message.content;
          }
          const run = message.runs
            ? activeIsSlot
              ? (message.runs.find((r) => r.slotId === activeTab) ??
                (activeSlot
                  ? message.runs.find((r) => r.model === activeSlot.label)
                  : undefined) ??
                message.runs[0])
              : (message.runs.find((r) => r.model === activeTab) ??
                message.runs[0])
            : undefined;
          return (
            <MessageItem
              key={message.id}
              message={message}
              conversationId={conversation?.id}
              run={message.role === "assistant" ? run : undefined}
              retryContent={
                message.role === "assistant" ? lastUserContent : undefined
              }
              isTurnEnd={isTurnEnd}
              onShowSources={onShowSources}
              onShowDisagreements={onShowDisagreements}
            />
          );
        })}
        <div ref={bottomRef} />
      </ContentColumn>
    </ScrollArea>
  );
}

// Re-export as ChatThread for backwards compatibility
export { MessageList as ChatThread };
