"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

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
import { getNextPlanForModel, getPlanById } from "@/lib/billing/plans";
import { getModelLabel } from "@/lib/modelCatalog";

export function UpgradeModal() {
  const { ui, closeUpgradeModal, choosePlan, currentPlanId } =
    useBillingStore();

  const lockedModelLabel = ui.lockedModelId
    ? getModelLabel(ui.lockedModelId)
    : null;
  const recommendedPlan =
    (ui.requiredPlanId && getPlanById(ui.requiredPlanId)) ||
    (ui.lockedModelId && getNextPlanForModel(ui.lockedModelId)) ||
    getPlanById(currentPlanId === "free" ? "plus" : "pro");

  return (
    <Dialog
      open={ui.upgradeModalOpen}
      onOpenChange={(open) => !open && closeUpgradeModal()}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full border bg-muted/40 p-2">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>Upgrade required</DialogTitle>
              <DialogDescription>
                {ui.upgradeReason ?? "This action needs a higher plan."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          {lockedModelLabel ? (
            <p>
              <span className="font-semibold">{lockedModelLabel}</span> is
              locked on your current plan.
            </p>
          ) : (
            <p>Unlock more models and higher limits with an upgraded plan.</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              Recommended: {recommendedPlan?.name}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Higher included credits and more active models.
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={closeUpgradeModal}>
            Not now
          </Button>
          <Button asChild variant="outline">
            <Link href="/pricing">See all plans</Link>
          </Button>
          {recommendedPlan ? (
            <Button
              onClick={() => {
                choosePlan(recommendedPlan.id);
                closeUpgradeModal();
              }}
            >
              Upgrade to {recommendedPlan.name}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
