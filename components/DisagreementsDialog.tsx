"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Disagreement } from "@/lib/types";

interface DisagreementsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disagreements: Disagreement[];
}

export function DisagreementsDialog({
  open,
  onOpenChange,
  disagreements,
}: DisagreementsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Model Disagreements</DialogTitle>
          <DialogDescription>
            Where the models diverged, and how they justify their stance.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-72">
          <div className="space-y-3 pt-2">
            {disagreements.map((item) => (
              <div key={item.claim} className="rounded-lg border bg-muted/40 px-3 py-2">
                <p className="text-sm font-semibold">{item.claim}</p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {item.models.map((stance) => (
                    <li key={`${item.claim}-${stance.model}`} className="flex items-start gap-2">
                      <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                        {stance.model}
                      </span>
                      <span>{stance.stance}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {disagreements.length === 0 && (
              <p className="text-sm text-muted-foreground">No disagreements captured.</p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
