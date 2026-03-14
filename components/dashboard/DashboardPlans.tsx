"use client";

import { useEffect } from "react";

import { PricingTiers } from "@/components/billing/PricingTiers";
import { PlanCompareTable } from "@/components/billing/PlanCompareTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBillingStore } from "@/lib/billing/store";
import { getPlanById } from "@/lib/billing/plans";
import { useI18n } from "@/lib/i18n";

export function DashboardPlans() {
  const { t } = useI18n();
  const { currentPlanId, syncFromServer } = useBillingStore();

  useEffect(() => {
    void syncFromServer();
  }, [syncFromServer]);

  const currentPlan = getPlanById(currentPlanId);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
      <div>
        <p className="text-xs uppercase text-muted-foreground">
          {t("billing.pageLabel")}
        </p>
        <h1 className="text-2xl font-semibold">{t("billing.pricing")}</h1>
      </div>

      <Card className="border-muted/60 bg-card/60">
        <CardHeader>
          <CardTitle>{t("billing.currentPlan")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-semibold">{currentPlan.name}</p>
        </CardContent>
      </Card>

      <PricingTiers />
      <PlanCompareTable />
    </div>
  );
}
