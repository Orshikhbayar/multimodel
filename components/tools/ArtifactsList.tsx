"use client";

import { Download, Link2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ArtifactListItem } from "@/components/tools/types";
import { formatDateTime } from "@/components/tools/utils";

interface ArtifactsListProps {
  artifacts: ArtifactListItem[];
  loading?: boolean;
  attachingArtifactId?: string | null;
  onAttach: (artifactId: string) => void;
  onRefresh: () => void;
}

function formatBytes(value?: number | null): string {
  if (typeof value !== "number" || value <= 0) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

export function ArtifactsList({
  artifacts,
  loading = false,
  attachingArtifactId = null,
  onAttach,
  onRefresh,
}: ArtifactsListProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Artifacts available in this scope
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      {artifacts.length === 0 ? (
        <div className="rounded-xl border border-dashed px-3 py-6 text-sm text-muted-foreground">
          No artifacts yet.
        </div>
      ) : null}

      {artifacts.map((artifact) => {
        const isAttaching = attachingArtifactId === artifact.id;

        return (
          <div
            key={artifact.id}
            className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{artifact.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {artifact.mime_type}
                </p>
              </div>
              <Badge variant="outline">{artifact.artifact_type}</Badge>
            </div>

            <div className="mt-1 grid grid-cols-1 gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
              <span>{formatDateTime(artifact.created_at)}</span>
              <span>{formatBytes(artifact.byte_size)}</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="default"
                disabled={!artifact.download_url}
                asChild
              >
                <a
                  href={artifact.download_url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Download
                </a>
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isAttaching}
                onClick={() => onAttach(artifact.id)}
              >
                <Link2 className="mr-1 h-3.5 w-3.5" />
                {isAttaching ? "Attaching..." : "Attach link to chat"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
