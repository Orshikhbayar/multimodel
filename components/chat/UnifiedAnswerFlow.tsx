"use client";

import { useMemo } from "react";
import { Brain, Cloud, Cpu, Flame, Layers, Sparkles } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import type { Run } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  return sentence.length > 90 ? `${sentence.slice(0, 87).trimEnd()}...` : sentence;
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
      {prompt ? (
        <div className="unified-flow__prompt">{prompt}</div>
      ) : null}

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
                    run.status === "streaming" && "unified-flow__perspective-card--streaming",
                    run.status === "error" && "border-destructive/40",
                  )}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border bg-muted/40">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="line-clamp-1">{run.model}</span>
                    {run.status === "queued" ? (
                      <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {t("chat.queued")}
                      </span>
                    ) : null}
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
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">{t("chat.unifiedAnswer")}:</span>{" "}
          {unifiedRun.text || t("chat.unifiedCollecting")}
        </p>
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
