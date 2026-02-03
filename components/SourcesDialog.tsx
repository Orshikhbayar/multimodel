"use client";

import { ExternalLink } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Source } from "@/lib/types";

interface SourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: Source[];
}

export function SourcesDialog({
  open,
  onOpenChange,
  sources,
}: SourcesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sources &amp; References</DialogTitle>
          <DialogDescription>
            Mocked citations for the current run. Replace with grounded sources
            later.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-72">
          <ul className="space-y-3 pt-2">
            {sources.map((source) => {
              let domain = source.url;
              try {
                domain = new URL(source.url).hostname;
              } catch {
                domain = source.url;
              }

              return (
                <li
                  key={source.url}
                  className="rounded-lg border bg-muted/40 px-3 py-2 transition hover:bg-muted"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{source.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {domain} {source.date ? `· ${source.date}` : ""}
                      </p>
                    </div>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                  {source.snippet && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {source.snippet}
                    </p>
                  )}
                </li>
              );
            })}
            {sources.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No sources attached yet.
              </p>
            )}
          </ul>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
