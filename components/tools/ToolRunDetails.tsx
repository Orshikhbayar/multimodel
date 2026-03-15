"use client";

import { ExternalLink, Paperclip, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ArtifactListItem, ToolRunDetail } from "@/components/tools/types";
import {
  extractArtifactIds,
  extractSourceLinks,
  formatCost,
  formatDateTime,
  formatDuration,
  truncateJson,
} from "@/components/tools/utils";

interface ToolRunDetailsProps {
  run: ToolRunDetail | null;
  artifacts: ArtifactListItem[];
  attaching?: boolean;
  attachDisabled?: boolean;
  onAttach: (runId: string) => void;
  onRerun: (run: ToolRunDetail) => void;
}

export function ToolRunDetails({
  run,
  artifacts,
  attaching = false,
  attachDisabled = false,
  onAttach,
  onRerun,
}: ToolRunDetailsProps) {
  if (!run) {
    return (
      <div className="rounded-xl border border-dashed px-3 py-6 text-sm text-muted-foreground">
        Select a run to inspect details.
      </div>
    );
  }

  const sources = extractSourceLinks(run.output_payload_redacted);
  const artifactIds = extractArtifactIds(run.output_payload_redacted);
  const matchedArtifacts = artifacts.filter((artifact) =>
    artifactIds.includes(artifact.id),
  );

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{run.tool_name}</p>
          <p className="text-[11px] text-muted-foreground">Run {run.id}</p>
        </div>
        <Badge variant="outline">{run.status}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-1 text-[11px] text-muted-foreground sm:grid-cols-3">
        <span>Started: {formatDateTime(run.started_at)}</span>
        <span>Duration: {formatDuration(run.duration_ms)}</span>
        <span>Cost: {formatCost(run.actual_cost)}</span>
      </div>

      {run.error_message ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
          {run.error_code ? `${run.error_code}: ` : ""}
          {run.error_message}
        </div>
      ) : null}

      {sources.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium">Sources</p>
          <div className="flex flex-wrap gap-2">
            {sources.map((source) => (
              <a
                key={`${run.id}-${source.url}`}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border/70 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                {source.title ?? source.url}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {matchedArtifacts.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium">Artifacts</p>
          <div className="flex flex-wrap gap-2">
            {matchedArtifacts.map((artifact) => (
              <a
                key={artifact.id}
                href={artifact.download_url ?? "#"}
                target={artifact.download_url ? "_blank" : undefined}
                rel={artifact.download_url ? "noreferrer" : undefined}
                className="inline-flex items-center gap-1 rounded-md border border-border/70 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                {artifact.title}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-medium">Input (redacted)</p>
        <pre className="max-h-48 overflow-auto rounded-lg border border-border/70 bg-background/70 p-2 text-[11px]">
          {truncateJson(run.input_payload_redacted, 1600)}
        </pre>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium">Output (redacted)</p>
        <pre className="max-h-64 overflow-auto rounded-lg border border-border/70 bg-background/70 p-2 text-[11px]">
          {truncateJson(run.output_payload_redacted, 3200)}
        </pre>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={() => onRerun(run)}
        >
          <Play className="mr-1 h-3.5 w-3.5" />
          Re-run
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={attaching || attachDisabled}
          onClick={() => onAttach(run.id)}
        >
          <Paperclip className="mr-1 h-3.5 w-3.5" />
          {attaching ? "Attaching..." : "Attach output to chat"}
        </Button>
      </div>
    </div>
  );
}
