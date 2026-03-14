"use client";

import { UsageDashboard } from "@/components/UsageDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

export type DashboardUsageSnapshot = {
  totalTokens: number;
  totalCostUsd: number;
  modelRunCount: number;
  periodStartISO: string;
  periodEndISO: string;
} | null;

export function DashboardUsage({
  snapshot,
}: {
  snapshot: DashboardUsageSnapshot;
}) {
  const { t, formatDate, formatNumber } = useI18n();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
      <div>
        <p className="text-xs uppercase text-muted-foreground">{t("billing.pageLabel")}</p>
        <h1 className="text-2xl font-semibold">{t("billing.usage")}</h1>
      </div>

      {snapshot ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-muted/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{t("billing.totalTokens")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {formatNumber(snapshot.totalTokens)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-muted/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{t("billing.cost")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                ${formatNumber(snapshot.totalCostUsd, { maximumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>

          <Card className="border-muted/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("billing.currentBillingPeriod")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-sm font-medium">
                {formatDate(new Date(snapshot.periodStartISO))} -{" "}
                {formatDate(new Date(snapshot.periodEndISO))}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatNumber(snapshot.modelRunCount)} runs
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card className="border-muted/60 bg-card/60">
        <CardHeader>
          <CardTitle>{t("billing.usage")}</CardTitle>
        </CardHeader>
        <CardContent>
          <UsageDashboard />
        </CardContent>
      </Card>
    </div>
  );
}
