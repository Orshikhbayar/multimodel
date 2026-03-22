"use client";

import { useState, useCallback } from "react";
import { Download, FileText, Loader2, Check } from "lucide-react";

interface PptxBlockProps {
  jsonString: string;
}

export default function PptxBlock({ jsonString }: PptxBlockProps) {
  const [status, setStatus] = useState<
    "idle" | "generating" | "done" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleDownload = useCallback(async () => {
    setStatus("generating");
    try {
      const data = JSON.parse(jsonString);
      const { generateAndDownloadPptx } =
        await import("@/lib/utils/generatePptx");
      await generateAndDownloadPptx(data);
      setStatus("done");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      console.error("PPTX generation failed:", err);
      setErrorMessage(err instanceof Error ? err.message : "Generation failed");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    }
  }, [jsonString]);

  return (
    <div className="my-3 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-muted/20 px-4 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/15">
        <FileText className="h-5 w-5 text-orange-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {(() => {
            try {
              return JSON.parse(jsonString).title || "Presentation";
            } catch {
              return "Presentation";
            }
          })()}
          .pptx
        </p>
        <p className="text-[11px] text-muted-foreground">
          {(() => {
            try {
              const slides = JSON.parse(jsonString).slides;
              return `${slides?.length || 0} slides \u00B7 PowerPoint`;
            } catch {
              return "PowerPoint";
            }
          })()}
        </p>
      </div>
      <button
        onClick={handleDownload}
        disabled={status === "generating"}
        className="flex items-center gap-2 rounded-lg bg-orange-500/15 px-3.5 py-2 text-xs font-medium text-orange-400 transition hover:bg-orange-500/25 disabled:opacity-50"
      >
        {status === "generating" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Generating...
          </>
        ) : status === "done" ? (
          <>
            <Check className="h-3.5 w-3.5" />
            Downloaded
          </>
        ) : status === "error" ? (
          <span className="text-red-400">{errorMessage}</span>
        ) : (
          <>
            <Download className="h-3.5 w-3.5" />
            Download PPTX
          </>
        )}
      </button>
    </div>
  );
}
