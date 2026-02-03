"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Check,
  Copy,
  Pencil,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ContentColumn } from "@/components/layout";
import { ExpandableMessage } from "./ExpandableMessage";
import type { Message, Run } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useChatActions } from "@/lib/hooks/useChatActions";
import { useConversationStore } from "@/lib/stores";

interface MessageItemProps {
  message: Message;
  run?: Run;
  conversationId?: string;
  retryContent?: string;
  onShowSources?: (run: Run) => void;
  onShowDisagreements?: (run: Run) => void;
}

export function MessageItem({
  message,
  run,
  conversationId,
  retryContent,
  onShowSources,
  onShowDisagreements,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const text = run?.text?.trim() || message.content;
  const lineCount = text.split("\n").length;
  const isLong = text.length > 600 || lineCount > 12;
  const { sendMessage } = useChatActions();
  const { updateMessageContent } = useConversationStore();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  useEffect(() => {
    if (!isEditing) {
      setDraft(message.content);
    }
  }, [isEditing, message.content]);

  const sentAt = useMemo(() => {
    if (!message.createdAt) return "";
    return new Date(message.createdAt).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }, [message.createdAt]);

  return (
    <ContentColumn withPadding={false} className="w-full">
      <article
        role="article"
        aria-label={isUser ? "Your message" : "Assistant response"}
        className={cn(
          "w-full",
          isUser ? "flex justify-end" : "flex justify-start",
        )}
      >
        <div
          className={cn(
            "w-full",
            isUser && "flex flex-col items-end group",
          )}
        >
          <ExpandableMessage
            id={`message-${message.id}`}
            align={isUser ? "end" : "start"}
            collapsible={isUser}
            containerClassName={cn(
              isUser ? "max-w-[92%] sm:max-w-[85%] lg:max-w-[80%]" : "w-full",
            )}
            contentClassName={cn(
              "message-bubble prose prose-sm dark:prose-invert",
              isUser
                ? cn(
                    "ml-auto w-fit max-w-full",
                    "text-foreground/90",
                    isLong ? "px-0 py-0" : "px-0 py-0",
                  )
                : "text-foreground/90",
            )}
            fadeFromClassName={
              isUser ? "from-muted/50" : "from-[hsl(var(--app-panel))]"
            }
            contentLength={text.length}
            contentLineCount={lineCount}
            longTextLabel="Show full text"
          >
            {isUser && isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="w-full min-h-[120px] rounded-xl border bg-background/80 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex items-center justify-end gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(message.content);
                      setIsEditing(false);
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground transition hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
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
                      setIsEditing(false);
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-foreground transition hover:bg-muted/40"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                skipHtml
                components={{
                  p: ({ children }) => (
                    <p className="mb-3 last:mb-0">{children}</p>
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
                {text || (run?.status === "streaming" ? "Thinking..." : "")}
              </ReactMarkdown>
            )}
          </ExpandableMessage>

          {/* Action buttons for assistant messages */}
          {isUser && !isEditing && (
            <div className="mt-2 flex items-center justify-end gap-3 text-[11px] text-muted-foreground opacity-0 transition group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
              {sentAt && (
                <span className="tabular-nums text-[11px]">{sentAt}</span>
              )}
              <button
                type="button"
                className="hover:text-foreground transition-colors"
                title="Retry"
                onClick={() => sendMessage(message.content)}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="hover:text-foreground transition-colors"
                title="Edit"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <CopyButton text={message.content} />
            </div>
          )}
          {!isUser && run?.interrupted && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-[12px] text-muted-foreground">
              <span>Response was interrupted</span>
              {retryContent ? (
                <button
                  type="button"
                  onClick={() => sendMessage(retryContent)}
                  className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-foreground transition hover:bg-muted/40"
                >
                  Retry
                </button>
              ) : null}
            </div>
          )}
          {!isUser && run && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <CopyButton text={text} />
                <button
                  type="button"
                  className="hover:text-foreground transition-colors"
                  title="Upvote"
                >
                  <ThumbsUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="hover:text-foreground transition-colors"
                  title="Downvote"
                >
                  <ThumbsDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="hover:text-foreground transition-colors"
                  title="Regenerate"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                {run?.status === "error" && (
                  <span className="flex items-center gap-1 text-destructive">
                    <TriangleAlert className="h-3 w-3" />
                    error
                  </span>
                )}
              </div>

              {run.sources && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onShowSources?.(run)}
                >
                  Sources
                </Button>
              )}
              {run.disagreements && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onShowDisagreements?.(run)}
                >
                  Disagreements
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
      title="Copy"
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

/** Code block with copy functionality */
function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

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
    <div className="my-3 rounded-xl border bg-muted/40 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/60">
        <span className="text-[11px] uppercase text-muted-foreground font-medium">
          {language}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-background hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto">
        <code className="text-xs font-mono leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
          {code}
        </code>
      </pre>
    </div>
  );
}

// Re-export as MessageBubble for backwards compatibility
export { MessageItem as MessageBubble };
