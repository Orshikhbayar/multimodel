"use client";

import { Fragment } from "react";
import { Scale } from "lucide-react";

import { ModelGlyph } from "@/components/ModelGlyph";
import { useI18n } from "@/lib/i18n";
import type { InteractionMode, Run } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AICollaborationVisualProps {
  runs: Run[];
  mode: InteractionMode;
}

export function AICollaborationVisual({
  runs,
  mode,
}: AICollaborationVisualProps) {
  const { t } = useI18n();
  const activeRuns = runs.filter((r) => r.model !== "Unified");
  if (activeRuns.length < 2) return null;

  const anyStreaming = activeRuns.some((r) => r.status === "streaming");
  if (!anyStreaming && activeRuns.every((r) => r.status !== "queued"))
    return null;

  return (
    <div className="flex items-center justify-center gap-0 py-4 px-6">
      {activeRuns.map((run, i) => (
        <Fragment key={run.id}>
          {/* Model node */}
          <div
            className={cn(
              "flex flex-col items-center gap-1.5 relative",
              run.status === "streaming" && "animate-pulse-soft",
            )}
          >
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-500",
                run.status === "streaming"
                  ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950 shadow-[0_0_12px_rgba(52,211,153,0.4)]"
                  : run.status === "done"
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950"
                    : "border-muted bg-muted/50",
              )}
            >
              <ModelGlyph modelId={run.slotId} size="sm" />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground truncate max-w-[60px]">
              {run.model}
            </span>
            {run.status === "streaming" && (
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
            )}
          </div>

          {/* Connecting path between nodes */}
          {i < activeRuns.length - 1 && (
            <div className="relative h-[2px] w-12 sm:w-16 mx-1 self-start mt-5">
              <div className="absolute inset-0 bg-muted rounded-full" />
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full transition-all duration-700",
                  run.status === "streaming" || run.status === "done"
                    ? "bg-emerald-400 w-full"
                    : "bg-muted w-0",
                )}
              >
                {run.status === "streaming" && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 h-1.5 w-4 rounded-full bg-emerald-300 animate-travel-pulse" />
                )}
              </div>
            </div>
          )}
        </Fragment>
      ))}

      {/* If team mode: show judge node at the end */}
      {mode === "team" && (
        <>
          <div className="relative h-[2px] w-8 mx-1 self-start mt-5">
            <div className="absolute inset-0 bg-muted rounded-full" />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-50 dark:bg-amber-950">
              <Scale className="h-5 w-5 text-amber-600" />
            </div>
            <span className="text-[10px] font-medium text-amber-600">
              {t("chat.judge")}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
