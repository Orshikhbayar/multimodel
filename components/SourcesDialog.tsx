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
import { useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("chat.sourcesAndReferences")}</DialogTitle>
          <DialogDescription>{t("chat.sourcesDescription")}</DialogDescription>
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
                {t("chat.noSources")}
              </p>
            )}
          </ul>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
