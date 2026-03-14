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
import { useI18n } from "@/lib/i18n";

export function OutOfCreditsModal() {
  const { t } = useI18n();
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
              <DialogTitle>{t("billing.outOfCredits")}</DialogTitle>
              <DialogDescription>
                {t("billing.outOfCreditsDescription")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={closeOutOfCreditsModal}>
            {t("billing.notNow")}
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/plans">{t("billing.upgradePlan")}</Link>
          </Button>
          <Button
            onClick={() => {
              closeOutOfCreditsModal();
              openTopUpModal();
            }}
          >
            {t("billing.topUpCreditsAction")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
