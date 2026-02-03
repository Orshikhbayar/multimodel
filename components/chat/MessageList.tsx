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
  const bottomRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  return (
    <ScrollArea
      className="flex-1 rounded-2xl bg-[hsl(var(--app-panel))] shadow-inner"
      role="log"
      aria-label="Chat messages"
      aria-live="polite"
    >
      <ContentColumn className="space-y-6 py-6 pb-28" id="main-content">
        {messages.map((message) => {
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
              run={message.role === "assistant" ? run : undefined}
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
