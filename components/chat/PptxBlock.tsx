"use client";

import { useState, useCallback } from "react";
import { Download, FileText, Loader2, AlertCircle } from "lucide-react";
import type { PptxData } from "@/lib/utils/pptxTypes";

type Status = "idle" | "generating" | "done" | "error";

export default function PptxBlock({ json, compact }: { json: string; compact?: boolean }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");

  const handleDownload = useCallback(async () => {
    setStatus("generating");
    try {
      const data: PptxData = JSON.parse(json);
      const { generatePptxBlob } = await import("@/lib/utils/generatePptx");
      const blob = await generatePptxBlob(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.title.replace(/[^a-zA-Z0-9]/g, "_")}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate");
      setStatus("error");
    }
  }, [json]);

  let parsed: PptxData | null = null;
  try {
    parsed = JSON.parse(json);
  } catch {
    // invalid JSON
  }

  if (!parsed) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
        <AlertCircle className="mr-1.5 inline h-4 w-4" />
        Invalid presentation data
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-border/60 bg-[hsl(var(--app-panel-2)/0.6)] ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/15">
          <FileText className="h-5 w-5 text-orange-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{parsed.title}</p>
          <p className="text-xs text-muted-foreground">
            {parsed.slides.length} slide{parsed.slides.length !== 1 ? "s" : ""} &middot; PowerPoint
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={status === "generating"}
          className="flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/25 disabled:opacity-50"
        >
          {status === "generating" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : status === "done" ? (
            <Download className="h-3.5 w-3.5" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {status === "generating" ? "Generating..." : status === "done" ? "Download again" : "Download .pptx"}
        </button>
      </div>
      {status === "error" && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
