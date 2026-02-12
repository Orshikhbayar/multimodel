"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBillingStore } from "@/lib/billing/store";
import { useI18n } from "@/lib/i18n";
import { formatCurrency } from "@/lib/billing/utils";
import { TOP_UP_PACKS, getTopUpPayPrice } from "@/lib/billing/plans";

export function TopUpModal() {
  const { t, locale } = useI18n();
  const { ui, currency, topUp, closeTopUpModal } = useBillingStore();

  return (
    <Dialog
      open={ui.topUpModalOpen}
      onOpenChange={(open) => !open && closeTopUpModal()}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("billing.topUpCreditsTitle")}</DialogTitle>
          <DialogDescription>{t("billing.topUpCreditsDescription")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-3">
          {TOP_UP_PACKS.map((pack) => {
            const amount = getTopUpPayPrice(pack, currency);
            return (
              <div
                key={pack.id}
                className="rounded-xl border bg-muted/30 p-4 text-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{pack.label}</p>
                  <Badge variant="secondary">{t("billing.oneTime")}</Badge>
                </div>
                <p className="mt-3 text-2xl font-semibold">
                  {formatCurrency(amount, currency, locale)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("billing.ledgerCreditsNoExpiry", {
                    credits: formatCurrency(pack.creditUsd, "USD", locale),
                  })}
                </p>
                <Button
                  className="mt-4 w-full"
                  onClick={async () => {
                    await topUp(pack.id);
                    closeTopUpModal();
                  }}
                >
                  {t("billing.addCredits")}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-dashed border-muted/60 bg-background/40 px-4 py-3 text-xs text-muted-foreground">
          {t("billing.topUpsNeverExpire")}
        </div>
      </DialogContent>
    </Dialog>
  );
}
