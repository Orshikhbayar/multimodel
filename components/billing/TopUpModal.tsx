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
import { formatCurrency } from "@/lib/billing/utils";
import { TOP_UP_PACKS, getTopUpPayPrice } from "@/lib/billing/plans";

export function TopUpModal() {
  const { ui, currency, topUp, closeTopUpModal } = useBillingStore();

  return (
    <Dialog
      open={ui.topUpModalOpen}
      onOpenChange={(open) => !open && closeTopUpModal()}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Top up credits</DialogTitle>
          <DialogDescription>
            Add pay-as-you-go credits on top of your included monthly balance.
          </DialogDescription>
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
                  <Badge variant="secondary">One-time</Badge>
                </div>
                <p className="mt-3 text-2xl font-semibold">
                  {formatCurrency(amount, currency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(pack.creditUsd, "USD")} ledger credits - no
                  expiry
                </p>
                <Button
                  className="mt-4 w-full"
                  onClick={async () => {
                    await topUp(pack.id);
                    closeTopUpModal();
                  }}
                >
                  Add credits
                </Button>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-dashed border-muted/60 bg-background/40 px-4 py-3 text-xs text-muted-foreground">
          Top-ups never expire. They are used only after your included monthly
          credits are spent.
        </div>
      </DialogContent>
    </Dialog>
  );
}
