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
import { useI18n } from "@/lib/i18n";
import { getNextPlanForModel, getPlanById } from "@/lib/billing/plans";
import { getModelLabel } from "@/lib/modelCatalog";

export function UpgradeModal() {
  const { t } = useI18n();
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
              <DialogTitle>{t("billing.upgradeRequired")}</DialogTitle>
              <DialogDescription>
                {ui.upgradeReason ?? t("billing.upgradeNeededAction")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          {lockedModelLabel ? (
            <p>
              {t("billing.lockedOnCurrentPlan", { model: lockedModelLabel })}
            </p>
          ) : (
            <p>{t("billing.unlockMoreModels")}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {t("billing.recommendedPlan", {
                plan: recommendedPlan?.name ?? "",
              })}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {t("billing.higherCreditsMoreModels")}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={closeUpgradeModal}>
            {t("billing.notNow")}
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/plans">{t("billing.seeAllPlans")}</Link>
          </Button>
          {recommendedPlan ? (
            <Button
              onClick={() => {
                choosePlan(recommendedPlan.id);
                closeUpgradeModal();
              }}
            >
              {t("billing.upgradeToPlan", { plan: recommendedPlan.name })}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
