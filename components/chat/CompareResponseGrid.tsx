"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";

import { ModelGlyph } from "@/components/ModelGlyph";
import { useI18n } from "@/lib/i18n";
import type { Run } from "@/lib/types";
import { cn } from "@/lib/utils";
import { rateRun } from "@/lib/actions/rateRun";
import { getModelById } from "@/lib/modelCatalog";

interface CompareResponseGridProps {
  runs: Run[];
}

export function CompareResponseGrid({ runs }: CompareResponseGridProps) {
  const { t } = useI18n();

  return (
    <div
      className={cn(
        "grid gap-3 w-full",
        runs.length === 1 && "grid-cols-1",
        runs.length === 2 && "grid-cols-1 md:grid-cols-2",
        runs.length >= 3 && "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
      )}
    >
      {runs.map((run) => (
        <CompareCard key={run.id} run={run} />
      ))}
    </div>
  );
}

function CompareCard({ run }: { run: Run }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState<1 | -1 | null>(run.rating ?? null);

  const modelId = run.slotId
    ? undefined
    : Object.values(getModelById(run.model) ?? {}).length
      ? run.model
      : undefined;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(run.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const statusLabel =
    run.status === "streaming"
      ? t("chat.thinking")
      : run.status === "queued"
        ? t("chat.queued")
        : run.status === "error"
          ? t("chat.error")
          : null;

  return (
    <div className="rounded-xl border bg-card p-4 min-w-0">
      {/* Model header */}
      <div className="flex items-center gap-2 mb-3">
        <ModelGlyph modelId={modelId} size="sm" />
        <span className="font-medium text-sm truncate">{run.model}</span>
        {statusLabel && (
          <span
            className={cn(
              "text-[10px] rounded-full px-2 py-0.5 font-medium",
              run.status === "streaming" &&
                "bg-emerald-500/15 text-emerald-600",
              run.status === "queued" && "bg-muted text-muted-foreground",
              run.status === "error" && "bg-destructive/15 text-destructive",
            )}
          >
            {statusLabel}
          </span>
        )}
        {run.latencyMs && (
          <span className="text-xs text-muted-foreground ml-auto">
            {(run.latencyMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* Response content */}
      <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed chat-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
          {run.text ||
            (run.status === "queued"
              ? t("chat.waitingForSlot")
              : run.status === "streaming"
                ? t("chat.thinking")
                : run.status === "error"
                  ? (run.error?.message ?? t("chat.error"))
                  : "")}
        </ReactMarkdown>
      </div>

      {/* Per-response actions */}
      {run.status === "done" && (
        <div className="mt-3 flex items-center gap-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
          <button
            type="button"
            className="hover:text-foreground transition-colors"
            title={t("common.copy")}
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            disabled={!run.id}
            className={cn(
              "transition-colors",
              rating === 1 ? "text-green-500" : "hover:text-foreground",
            )}
            title={t("chat.upvote")}
            onClick={async () => {
              if (!run.id) return;
              const next = rating === 1 ? null : (1 as const);
              setRating(next);
              try {
                const result = await rateRun(run.id, 1);
                setRating(result.rating);
              } catch {
                setRating(rating);
              }
            }}
          >
            <ThumbsUp
              className={cn("h-3.5 w-3.5", rating === 1 && "fill-current")}
            />
          </button>
          <button
            type="button"
            disabled={!run.id}
            className={cn(
              "transition-colors",
              rating === -1 ? "text-destructive" : "hover:text-foreground",
            )}
            title={t("chat.downvote")}
            onClick={async () => {
              if (!run.id) return;
              const next = rating === -1 ? null : (-1 as const);
              setRating(next);
              try {
                const result = await rateRun(run.id, -1);
                setRating(result.rating);
              } catch {
                setRating(rating);
              }
            }}
          >
            <ThumbsDown
              className={cn("h-3.5 w-3.5", rating === -1 && "fill-current")}
            />
          </button>
          {run.tokens && (
            <span className="ml-auto text-[10px]">
              {run.tokens.total} tokens
            </span>
          )}
        </div>
      )}
    </div>
  );
}
