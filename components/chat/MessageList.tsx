"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageItem } from "./MessageItem";
import { ContentColumn } from "@/components/layout";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/lib/stores";
import type { Conversation, ModelSlot, Run } from "@/lib/types";

interface MessageListProps {
  conversation?: Conversation;
  projectId?: string;
  activeTab: string;
  slots: ModelSlot[];
  onShowSources: (run: Run) => void;
  onShowDisagreements: (run: Run) => void;
}

export function MessageList({
  conversation,
  projectId,
  activeTab,
  slots,
  onShowSources,
  onShowDisagreements,
}: MessageListProps) {
  const { t } = useI18n();
  const { mode } = useSettingsStore();
  const isMultiModelMode = mode === "compare" || mode === "team";
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLElement | null>(null);
  const stickToBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
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

  // Most recent user message content preceding each index, computed in one
  // O(n) pass. The previous per-message `[...messages.slice(0, index)]
  // .reverse().find(...)` ran twice per assistant message on every render —
  // O(n²) with array copies on every streaming token.
  const precedingUserContent = useMemo(() => {
    const result: (string | undefined)[] = new Array(messages.length);
    let lastUserContent: string | undefined;
    for (let i = 0; i < messages.length; i += 1) {
      result[i] = lastUserContent;
      if (messages[i].role === "user") {
        lastUserContent = messages[i].content;
      }
    }
    return result;
  }, [messages]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector(
      "[data-scroll-container]",
    ) as HTMLElement | null;
    viewportRef.current = viewport;
    if (!viewport) return;

    const updateStickiness = () => {
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      const atBottom = distanceFromBottom <= 48;
      stickToBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
    };

    updateStickiness();
    viewport.addEventListener("scroll", updateStickiness, { passive: true });
    return () => viewport.removeEventListener("scroll", updateStickiness);
  }, []);

  useEffect(() => {
    const shouldStick = stickToBottomRef.current;
    const isNewMessage = messages.length > prevCountRef.current;

    if (shouldStick || isNewMessage) {
      const viewport = viewportRef.current;
      if (viewport) {
        // Use instant during streaming (rapid token arrival) to avoid rubber-band lag.
        // Use smooth only when a brand-new message appears.
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: isNewMessage ? "smooth" : "instant",
        });
      }
    }

    prevCountRef.current = messages.length;
  }, [messages, activeTab]);

  const scrollToBottom = () => {
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    }
  };

  return (
    <div className="relative flex-1 min-h-0">
      {/* role="log" is already an implicit polite live region — an explicit
          aria-live here doubled screen-reader announcements. */}
      <ScrollArea
        ref={scrollAreaRef}
        className="h-full rounded-2xl bg-[hsl(var(--app-panel))] shadow-inner"
        role="log"
        aria-label={t("accessibility.chatMessages")}
      >
        <ContentColumn
          className="space-y-6 py-6 pb-6"
          maxWidth="var(--chat-max-width)"
        >
          {messages.map((message, index) => {
            const nextMessage = messages[index + 1];
            const isTurnEnd =
              message.role === "assistant" &&
              (!nextMessage || nextMessage.role === "user");
            // retryContent and prompt are the same value: the content of
            // the user message that precedes this assistant message.
            const precedingUser =
              message.role === "assistant"
                ? precedingUserContent[index]
                : undefined;
            // In compare/team mode, pass all runs so MessageItem can render them
            // In single mode, find the active tab's run
            const run = message.runs
              ? isMultiModelMode
                ? message.runs[0] // MessageItem reads message.runs directly
                : activeIsSlot
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
                projectId={projectId}
                conversationId={conversation?.id}
                run={message.role === "assistant" ? run : undefined}
                prompt={precedingUser}
                retryContent={precedingUser}
                isTurnEnd={isTurnEnd}
                onShowSources={onShowSources}
                onShowDisagreements={onShowDisagreements}
              />
            );
          })}
        </ContentColumn>
      </ScrollArea>

      {/* Scroll-to-bottom floating button */}
      <div
        className={cn(
          "absolute bottom-4 left-1/2 -translate-x-1/2 z-50 transition-opacity duration-200",
          isAtBottom ? "opacity-0 pointer-events-none" : "opacity-100",
        )}
      >
        <button
          type="button"
          onClick={scrollToBottom}
          title={t("chat.scrollToBottom")}
          aria-label={t("chat.scrollToBottom")}
          className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground shadow-md hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          {t("chat.scrollToBottom")}
        </button>
      </div>
    </div>
  );
}

// Re-export as ChatThread for backwards compatibility
export { MessageList as ChatThread };
