"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ContentColumn } from "@/components/layout";
import InteractiveBlock from "./InteractiveBlock";
import PptxBlock from "./PptxBlock";
import { splitInteractiveBlocks } from "@/lib/utils/interactiveBlocks";
import { ExpandableMessage } from "./ExpandableMessage";
import { UnifiedAnswerFlow } from "./UnifiedAnswerFlow";
import {
  PrismLight,
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
} from "./codeHighlight";
import { useI18n } from "@/lib/i18n";
import type { Message, Run, ToolCall } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useChatActions } from "@/lib/hooks/useChatActions";
import { useConversationStore } from "@/lib/stores";
import { rateRun } from "@/lib/actions/rateRun";

// ---------------------------------------------------------------------------
// Two-phase message content renderer
// Phase 1 (streaming/queued): raw text, zero markdown parsing cost
// Phase 2 (done/error):       full markdown with a subtle fade-in
// ---------------------------------------------------------------------------
interface MessageContentProps {
  text: string;
  status: string | undefined;
  errorMessage: string | undefined;
  prompt: string | undefined;
  isUser: boolean;
}

const MessageContent = memo(
  function MessageContent({
    text,
    status,
    errorMessage,
    prompt,
    isUser,
  }: MessageContentProps) {
    const { t } = useI18n();
    const isStreaming =
      !isUser && (status === "streaming" || status === "queued");

    // Phase 1 — plain text, no markdown parser, no layout thrash
    if (isStreaming) {
      return (
        <div
          className="whitespace-pre-wrap text-sm leading-relaxed"
          aria-live="polite"
          aria-atomic="false"
        >
          {text ||
            (status === "queued"
              ? t("chat.waitingForSlot")
              : t("chat.thinking"))}
          <span className="streaming-cursor" aria-hidden="true" />
        </div>
      );
    }

    // Phase 2 — full markdown render after stream completes
    const content =
      text || (status === "error" ? (errorMessage ?? t("chat.error")) : "");

    return (
      <div
        className={!isUser && status === "done" ? "fade-in-render" : undefined}
      >
        {splitInteractiveBlocks(content, !isUser ? prompt : undefined).map(
          (segment, i) =>
            segment.type === "interactive" ? (
              <InteractiveBlock key={i} html={segment.content} />
            ) : segment.type === "pptx" ? (
              <PptxBlock key={i} json={segment.content} />
            ) : (
              <ReactMarkdown
                key={i}
                remarkPlugins={[remarkGfm]}
                skipHtml
                components={{
                  p: ({ children }) => (
                    <p className="mb-2 last:mb-0">{children}</p>
                  ),
                  code: ({ className, children, ...props }) => {
                    const isInline = !className;
                    if (isInline) {
                      return (
                        <code
                          className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    }
                    const language =
                      className?.replace("language-", "") ?? "text";
                    const code = String(children).replace(/\n$/, "");
                    return <CodeBlock code={code} language={language} />;
                  },
                  pre: ({ children }) => <>{children}</>,
                }}
              >
                {segment.content}
              </ReactMarkdown>
            ),
        )}
      </div>
    );
  },
  // Only re-render when text or status actually changes
  (prev, next) =>
    prev.text === next.text &&
    prev.status === next.status &&
    prev.errorMessage === next.errorMessage,
);

interface MessageItemProps {
  message: Message;
  projectId?: string;
  run?: Run;
  prompt?: string;
  conversationId?: string;
  retryContent?: string;
  isTurnEnd?: boolean;
  onShowSources?: (run: Run) => void;
  onShowDisagreements?: (run: Run) => void;
}

export function MessageItem({
  message,
  projectId,
  run,
  prompt,
  conversationId,
  retryContent,
  isTurnEnd = false,
  onShowSources,
  onShowDisagreements,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const assistantRuns = message.runs ?? (run ? [run] : []);
  const unifiedRun = assistantRuns.find((entry) => entry.model === "Unified");
  const perspectiveRuns = assistantRuns.filter(
    (entry) => entry.model !== "Unified",
  );
  const showUnifiedFlow =
    !isUser && Boolean(unifiedRun) && perspectiveRuns.length >= 2;
  const selectedRun = showUnifiedFlow ? unifiedRun : run;
  const toolCalls = message.toolCalls ?? [];
  const text = selectedRun?.text?.trim() || message.content;
  const { sendMessage, respondToEditedMessage } = useChatActions();
  const { t, formatTime } = useI18n();
  const { updateMessageContent } = useConversationStore();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const [rating, setRating] = useState<1 | -1 | null>(
    selectedRun?.rating ?? null,
  );

  useEffect(() => {
    const el = editRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, isEditing]);

  const sentAt = useMemo(() => {
    if (!message.createdAt) return "";
    return formatTime(new Date(message.createdAt), {
      hour: "numeric",
      minute: "2-digit",
    });
  }, [formatTime, message.createdAt]);

  const displayContent = isUser ? message.content : text;
  const displayLineCount = displayContent.split("\n").length;

  return (
    <ContentColumn withPadding={false} className="w-full">
      <article
        role="article"
        aria-label={
          isUser ? t("chat.yourMessage") : t("chat.assistantResponse")
        }
        className={cn(
          "w-full space-y-1",
          isUser ? "flex justify-end" : "flex justify-start",
          isTurnEnd && "pb-4",
        )}
      >
        <div
          className={cn(
            "w-full flex flex-col",
            isUser ? "items-end group" : "items-start",
          )}
        >
          {!isUser && (
            <div className="mb-1 text-[11px] text-muted-foreground">
              {showUnifiedFlow
                ? t("chat.unifiedAnswer")
                : (selectedRun?.model ?? t("chat.assistant"))}
            </div>
          )}
          {showUnifiedFlow && unifiedRun ? (
            <div className="w-full max-w-[95%]">
              <UnifiedAnswerFlow
                prompt={prompt}
                unifiedRun={unifiedRun}
                perspectiveRuns={perspectiveRuns}
              />
            </div>
          ) : (
            <ExpandableMessage
              id={`message-${message.id}`}
              align={isUser ? "end" : "start"}
              collapsible={isUser}
              containerClassName={cn(
                isUser ? "ml-auto w-fit max-w-[85%]" : "w-full max-w-[85%]",
              )}
              contentClassName={cn(
                "message-bubble prose prose-sm dark:prose-invert max-w-none leading-relaxed break-words",
                "prose-p:my-2 prose-li:my-1 prose-ul:my-2 prose-ol:my-2",
                "prose-headings:my-3 prose-blockquote:my-2",
                isUser
                  ? cn(
                      "w-fit rounded-2xl bg-primary/15 px-4 py-3 text-foreground/90 whitespace-pre-wrap",
                      isEditing ? "bg-primary/10" : "",
                    )
                  : cn(
                      "w-full rounded-2xl bg-muted/20 px-4 py-3 text-foreground/90",
                      "chat-markdown",
                    ),
              )}
              fadeFromClassName={
                isUser ? "from-muted/50" : "from-[hsl(var(--app-panel))]"
              }
              contentLength={displayContent.length}
              contentLineCount={displayLineCount}
              longTextLabel={t("chat.showFullText")}
            >
              {isUser && isEditing ? (
                <div className="space-y-3">
                  <textarea
                    ref={editRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className="w-full min-h-[160px] rounded-xl border border-white/10 bg-background/60 p-4 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <div className="flex items-center justify-end gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(message.content);
                        setIsEditing(false);
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-muted-foreground transition hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = draft.trim();
                        if (!next || !conversationId) {
                          setIsEditing(false);
                          return;
                        }
                        updateMessageContent(conversationId, message.id, next);
                        respondToEditedMessage(
                          conversationId,
                          message.id,
                          next,
                        );
                        setIsEditing(false);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 px-3 py-1.5 text-foreground transition hover:bg-muted/40"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {t("common.save")}
                    </button>
                  </div>
                </div>
              ) : (
                <MessageContent
                  text={displayContent}
                  status={selectedRun?.status}
                  errorMessage={selectedRun?.error?.message}
                  prompt={!isUser ? prompt : undefined}
                  isUser={isUser}
                />
              )}
            </ExpandableMessage>
          )}
          {!isUser && toolCalls.length > 0 && (
            <ToolActivityList toolCalls={toolCalls} />
          )}

          {/* Action buttons for assistant messages */}
          {isUser && !isEditing && (
            <div className="mt-2 flex items-center justify-end gap-3 text-[11px] text-muted-foreground">
              {sentAt && (
                <span className="tabular-nums text-[11px]">{sentAt}</span>
              )}
              <button
                type="button"
                className="hover:text-foreground transition-colors"
                title={t("chat.retry")}
                aria-label={t("chat.retry")}
                onClick={() => sendMessage(message.content, projectId)}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="hover:text-foreground transition-colors"
                title={t("chat.edit")}
                aria-label={t("chat.edit")}
                onClick={() => {
                  setDraft(message.content);
                  setIsEditing(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <CopyButton text={message.content} />
              {message.editedAt ? (
                <span className="text-[11px] text-muted-foreground">
                  {t("chat.edited")}
                </span>
              ) : null}
            </div>
          )}
          {!isUser && selectedRun?.interrupted && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-[12px] text-muted-foreground">
              <span>{t("chat.responseInterrupted")}</span>
              {retryContent ? (
                <button
                  type="button"
                  onClick={() => sendMessage(retryContent, projectId)}
                  className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-foreground transition hover:bg-muted/40"
                >
                  {t("chat.retry")}
                </button>
              ) : null}
            </div>
          )}
          {!isUser && selectedRun && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <CopyButton text={text} />
                <button
                  type="button"
                  disabled={
                    !selectedRun?.id || selectedRun.status === "streaming"
                  }
                  className={cn(
                    "transition-colors",
                    rating === 1 ? "text-green-500" : "hover:text-foreground",
                  )}
                  title={t("chat.upvote")}
                  onClick={async () => {
                    if (!selectedRun?.id) return;
                    const next = rating === 1 ? null : (1 as const);
                    setRating(next);
                    try {
                      const result = await rateRun(selectedRun.id, 1);
                      setRating(result.rating);
                    } catch {
                      setRating(rating); // revert on error
                    }
                  }}
                >
                  <ThumbsUp
                    className={cn("h-4 w-4", rating === 1 && "fill-current")}
                  />
                </button>
                <button
                  type="button"
                  disabled={
                    !selectedRun?.id || selectedRun.status === "streaming"
                  }
                  className={cn(
                    "transition-colors",
                    rating === -1
                      ? "text-destructive"
                      : "hover:text-foreground",
                  )}
                  title={t("chat.downvote")}
                  onClick={async () => {
                    if (!selectedRun?.id) return;
                    const next = rating === -1 ? null : (-1 as const);
                    setRating(next);
                    try {
                      const result = await rateRun(selectedRun.id, -1);
                      setRating(result.rating);
                    } catch {
                      setRating(rating); // revert on error
                    }
                  }}
                >
                  <ThumbsDown
                    className={cn("h-4 w-4", rating === -1 && "fill-current")}
                  />
                </button>
                <div className="relative flex items-center group">
                  <button
                    type="button"
                    className="hover:text-foreground transition-colors"
                    title={t("chat.tryAgain")}
                    onClick={() =>
                      retryContent
                        ? sendMessage(retryContent, projectId)
                        : undefined
                    }
                    disabled={!retryContent}
                    aria-label={t("chat.tryAgain")}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  {retryContent && (
                    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-max -translate-x-1/2 rounded-md bg-black/90 px-2.5 py-2 text-[11px] text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                      <div className="font-medium">
                        {t("chat.tryAgainEllipsis")}
                      </div>
                      <div className="text-[10px] text-white/70">
                        {t("chat.usedModel", {
                          model: selectedRun.model ?? t("chat.assistant"),
                        })}
                      </div>
                    </div>
                  )}
                </div>
                {selectedRun.status === "error" && (
                  <span className="flex items-center gap-1 text-destructive">
                    <TriangleAlert className="h-3 w-3" />
                    {t("chat.error")}
                  </span>
                )}
              </div>

              {selectedRun.sources && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onShowSources?.(selectedRun)}
                >
                  {t("chat.sources")}
                </Button>
              )}
              {selectedRun.disagreements && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onShowDisagreements?.(selectedRun)}
                >
                  {t("chat.disagreements")}
                </Button>
              )}
            </div>
          )}
        </div>
      </article>
    </ContentColumn>
  );
}

/** Copy button with feedback */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard errors
    }
  };

  return (
    <button
      type="button"
      className="hover:text-foreground transition-colors"
      title={t("common.copy")}
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
}

function LoaderSpinner() {
  return <Loader2 className="h-4 w-4 animate-spin" />;
}

/** Code block with copy functionality */
function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();
  const normalizedLanguage = normalizeLanguage(language);
  const isSupported = SUPPORTED_LANGUAGES.has(normalizedLanguage);
  const label = isSupported
    ? normalizedLanguage.toUpperCase()
    : t("common.text");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="code-block my-3 overflow-hidden">
      <div className="code-block__header">
        <span className="code-block__label">{label}</span>
        <button type="button" onClick={handleCopy} className="code-block__copy">
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {copied ? t("common.copied") : t("common.copy")}
        </button>
      </div>
      <PrismLight
        language={isSupported ? normalizedLanguage : undefined}
        useInlineStyles={false}
        className="code-block__pre"
        codeTagProps={{ className: "code-block__code" }}
      >
        {code}
      </PrismLight>
    </div>
  );
}

function ToolActivityList({ toolCalls }: { toolCalls: ToolCall[] }) {
  return (
    <div className="mt-3 w-full max-w-[85%] space-y-2">
      {toolCalls.map((toolCall) => (
        <div
          key={toolCall.id}
          className="rounded-xl border border-border/70 bg-[hsl(var(--app-panel)/0.62)] px-3 py-2 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium">
              {toolCall.name}
              {toolCall.toolVersion ? ` v${toolCall.toolVersion}` : ""}
            </div>
            <span className="text-muted-foreground">{toolCall.status}</span>
          </div>
          {toolCall.actualCost && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              Cost: {toolCall.actualCost.totalTokens ?? 0} tokens
              {typeof toolCall.actualCost.externalCostUsd === "number"
                ? ` · $${toolCall.actualCost.externalCostUsd.toFixed(4)}`
                : ""}
            </div>
          )}
          {toolCall.sources && toolCall.sources.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {toolCall.sources.slice(0, 4).map((source) => (
                <a
                  key={`${toolCall.id}-${source.url}`}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                  {source.title ?? source.url}
                </a>
              ))}
            </div>
          )}
          {toolCall.artifacts && toolCall.artifacts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {toolCall.artifacts.slice(0, 4).map((artifact, index) => (
                <span
                  key={`${toolCall.id}-artifact-${index}`}
                  className="rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground"
                >
                  {artifact.type ?? "artifact"}:{" "}
                  {artifact.title ??
                    artifact.storagePath ??
                    artifact.downloadUrl ??
                    artifact.id ??
                    "generated"}
                </span>
              ))}
            </div>
          )}
          {toolCall.error && (
            <div className="mt-2 text-[11px] text-destructive">
              {toolCall.error}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Re-export as MessageBubble for backwards compatibility
export { MessageItem as MessageBubble };
