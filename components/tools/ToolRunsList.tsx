"use client";

import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ToolRunSummary } from "@/components/tools/types";
import { cn } from "@/lib/utils";
import { formatCost, formatDateTime, formatDuration } from "@/components/tools/utils";

interface ToolRunsListProps {
  runs: ToolRunSummary[];
  loading?: boolean;
  selectedRunId?: string;
  onSelectRun: (runId: string) => void;
  onRefresh: () => void;
}

function statusBadgeVariant(status: string): "secondary" | "destructive" | "outline" {
  if (status === "succeeded") return "secondary";
  if (status === "failed" || status === "cancelled") return "destructive";
  return "outline";
}

export function ToolRunsList({
  runs,
  loading = false,
  selectedRunId,
  onSelectRun,
  onRefresh,
}: ToolRunsListProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Recent tool runs for this scope</p>
        <Button type="button" size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
          <RotateCw className="mr-1 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-xl border border-dashed px-3 py-5 text-sm text-muted-foreground">
          No tool runs yet.
        </div>
      ) : null}

      {runs.map((run) => (
        <button
          key={run.id}
          type="button"
          onClick={() => onSelectRun(run.id)}
          className={cn(
            "w-full rounded-xl border px-3 py-2 text-left transition-colors",
            run.id === selectedRunId
              ? "border-primary bg-primary/10"
              : "border-border/70 hover:border-primary/60 hover:bg-muted/25",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">{run.tool_name}</div>
            <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">v{run.tool_version}</div>
          <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-muted-foreground sm:grid-cols-3">
            <span>{formatDateTime(run.started_at)}</span>
            <span>{formatDuration(run.duration_ms)}</span>
            <span>{formatCost(run.actual_cost)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
