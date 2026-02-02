"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useBillingStore } from "@/lib/billing/store";

export function OutOfCreditsModal() {
  const { ui, closeOutOfCreditsModal, openTopUpModal } = useBillingStore();

  return (
    <Dialog
      open={ui.outOfCreditsOpen}
      onOpenChange={(open) => !open && closeOutOfCreditsModal()}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full border bg-muted/40 p-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>Out of credits</DialogTitle>
              <DialogDescription>
                You've used all your included and top-up credits for this period.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={closeOutOfCreditsModal}>
            Not now
          </Button>
          <Button asChild variant="outline">
            <Link href="/pricing">Upgrade plan</Link>
          </Button>
          <Button
            onClick={() => {
              closeOutOfCreditsModal();
              openTopUpModal();
            }}
          >
            Top up credits
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
