"use client";

import { Paperclip, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ToolExecuteSuccess } from "@/components/tools/types";
import { truncateJson } from "@/components/tools/utils";

interface ToolRunResultProps {
  result: ToolExecuteSuccess;
  attaching?: boolean;
  attachDisabled?: boolean;
  onAttach?: (runId: string) => void;
  onRefresh?: () => void;
}

export function ToolRunResult({
  result,
  attaching = false,
  attachDisabled = false,
  onAttach,
  onRefresh,
}: ToolRunResultProps) {
  return (
    <section className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Run {result.run_id}</Badge>
        <Badge variant="outline">
          {result.from_idempotency_cache ? "Cached output" : "Executed"}
        </Badge>
      </div>

      <pre className="max-h-64 overflow-auto rounded-lg border border-border/70 bg-background/70 p-2 text-[11px] leading-relaxed">
        {truncateJson(result.output, 2600)}
      </pre>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={attachDisabled || attaching || !onAttach}
          onClick={() => {
            if (!onAttach) return;
            onAttach(result.run_id);
          }}
        >
          <Paperclip className="mr-1 h-3.5 w-3.5" />
          {attaching ? "Attaching..." : "Attach to chat"}
        </Button>
        {onRefresh ? (
          <Button type="button" size="sm" variant="outline" onClick={onRefresh}>
            <RotateCw className="mr-1 h-3.5 w-3.5" />
            Refresh runs
          </Button>
        ) : null}
      </div>
    </section>
  );
}
