"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, ThumbsUp } from "lucide-react";
import { Brain, Cloud, Cpu, Flame, Layers, Sparkles } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import type { Run } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  PrismLight,
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
} from "./codeHighlight";
import { splitInteractiveBlocks } from "@/lib/utils/interactiveBlocks";
import InteractiveBlock from "./InteractiveBlock";
import PptxBlock from "./PptxBlock";

interface UnifiedAnswerFlowProps {
  prompt?: string;
  unifiedRun: Run;
  perspectiveRuns: Run[];
}

const MAX_PERSPECTIVE_CARDS = 3;

function sentencePreview(text: string, fallback: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return fallback;

  const sentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
  return sentence.length > 90
    ? `${sentence.slice(0, 87).trimEnd()}...`
    : sentence;
}

function secondsLabel(totalMs: number | null): string {
  if (totalMs === null || Number.isNaN(totalMs)) return "—";
  return `${(totalMs / 1000).toFixed(1)}s`;
}

function iconForRunModel(model: string) {
  const value = model.toLowerCase();
  if (value.includes("gpt") || value.includes("openai")) return Sparkles;
  if (value.includes("claude") || value.includes("anthropic")) return Brain;
  if (value.includes("gemini") || value.includes("google")) return Cloud;
  if (value.includes("grok") || value.includes("xai")) return Flame;
  if (value.includes("deepseek")) return Cpu;
  return Layers;
}

export function UnifiedAnswerFlow({
  prompt,
  unifiedRun,
  perspectiveRuns,
}: UnifiedAnswerFlowProps) {
  const { t } = useI18n();
  const [bestAnswerRunId, setBestAnswerRunId] = useState<string | null>(null);

  const visibleRuns = useMemo(
    () => perspectiveRuns.slice(0, MAX_PERSPECTIVE_CARDS),
    [perspectiveRuns],
  );
  const hiddenCount = Math.max(0, perspectiveRuns.length - visibleRuns.length);
  const totalLatencyMs = useMemo(() => {
    const completed = perspectiveRuns
      .map((run) => run.latencyMs ?? null)
      .filter((latency): latency is number => latency !== null);
    if (completed.length === 0) return null;
    return Math.max(...completed);
  }, [perspectiveRuns]);

  return (
    <section
      className={cn(
        "unified-flow rounded-2xl border bg-card/70 px-4 py-4",
        unifiedRun.status === "streaming" && "unified-flow--active",
      )}
      aria-label={t("chat.unifiedAnswer")}
    >
      {prompt ? <div className="unified-flow__prompt">{prompt}</div> : null}

      <div className="unified-flow__network">
        <div className="unified-flow__center-line unified-flow__center-line--top" />
        <div className="unified-flow__rail unified-flow__rail--top" />

        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, visibleRuns.length)}, minmax(0, 1fr))`,
          }}
        >
          {visibleRuns.map((run) => {
            const Icon = iconForRunModel(run.model);
            return (
              <div key={run.id} className="flex flex-col items-center">
                <div className="unified-flow__stem unified-flow__stem--top" />
                <article
                  className={cn(
                    "unified-flow__perspective-card w-full rounded-xl border bg-background/80 px-3 py-2 shadow-sm",
                    run.status === "streaming" &&
                      "unified-flow__perspective-card--streaming",
                    run.status === "error" && "border-destructive/40",
                    bestAnswerRunId === run.id &&
                      "border-emerald-400/60 bg-emerald-50/10 ring-1 ring-emerald-400/30",
                  )}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border bg-muted/40">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="line-clamp-1 flex-1">{run.model}</span>
                    {run.status === "queued" ? (
                      <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {t("chat.queued")}
                      </span>
                    ) : null}
                    {run.status === "done" && (
                      <button
                        type="button"
                        title="Mark as best answer"
                        onClick={() =>
                          setBestAnswerRunId((prev) =>
                            prev === run.id ? null : run.id,
                          )
                        }
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full transition-all",
                          bestAnswerRunId === run.id
                            ? "bg-emerald-500/20 text-emerald-500"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <ThumbsUp className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {sentencePreview(
                      run.text,
                      run.status === "error"
                        ? t("chat.error")
                        : run.status === "queued"
                          ? t("chat.waitingForSlot")
                          : t("chat.thinking"),
                    )}
                  </p>
                </article>
                <div className="unified-flow__stem unified-flow__stem--bottom" />
              </div>
            );
          })}
        </div>

        <div className="unified-flow__rail unified-flow__rail--bottom" />
        <div className="unified-flow__center-line unified-flow__center-line--bottom" />
      </div>

      <article
        className={cn(
          "rounded-xl border bg-background/85 px-4 py-3 shadow-sm",
          unifiedRun.status === "streaming" && "border-emerald-400/45",
        )}
      >
        <div className="text-sm leading-relaxed">
          <p className="mb-2 font-semibold">{t("chat.unifiedAnswer")}:</p>
          <div className="chat-markdown prose prose-sm dark:prose-invert max-w-none">
            {splitInteractiveBlocks(
              unifiedRun.text || t("chat.unifiedCollecting")
            ).map((segment, i) =>
              segment.type === "pptx" ? (
                <PptxBlock key={i} jsonString={segment.content} />
              ) : segment.type === "interactive" ? (
                <InteractiveBlock key={i} html={segment.content} compact />
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
                      return (
                        <UnifiedCodeBlock
                          language={language}
                          code={code}
                          textLabel={t("common.text")}
                          copyLabel={t("common.copy")}
                          copiedLabel={t("common.copied")}
                          {...props}
                        />
                      );
                    },
                    pre: ({ children }) => <pre className="my-2">{children}</pre>,
                  }}
                >
                  {segment.content}
                </ReactMarkdown>
              )
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("chat.verified")} ·{" "}
          {t("chat.aiPerspectives", { count: perspectiveRuns.length })} ·{" "}
          {secondsLabel(totalLatencyMs)}
          {hiddenCount > 0 ? ` · +${hiddenCount}` : ""}
        </p>
      </article>
    </section>
  );
}

function UnifiedCodeBlock({
  code,
  language,
  textLabel,
  copyLabel,
  copiedLabel,
}: {
  code: string;
  language?: string;
  textLabel: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const normalizedLanguage = normalizeLanguage(language);
  const isSupported = SUPPORTED_LANGUAGES.has(normalizedLanguage);
  const label = isSupported ? normalizedLanguage.toUpperCase() : textLabel;

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
          {copied ? copiedLabel : copyLabel}
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
