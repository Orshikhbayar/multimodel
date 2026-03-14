"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, CreditCard, Gauge, Layers } from "lucide-react";

import { BillingSummaryCard } from "@/components/billing/BillingSummaryCard";
import { TopUpModal } from "@/components/billing/TopUpModal";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBillingStore } from "@/lib/billing/store";
import { getPlanById } from "@/lib/billing/plans";
import { formatCredits, formatCurrency } from "@/lib/billing/utils";
import { useI18n } from "@/lib/i18n";

export function DashboardOverview() {
  const { t, locale, formatDate } = useI18n();
  const searchParams = useSearchParams();
  const {
    transactions,
    currency,
    currentPlanId,
    includedCreditsRemaining,
    topUpCreditsBalance,
    syncFromServer,
  } = useBillingStore();

  useEffect(() => {
    void syncFromServer();
  }, [syncFromServer]);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    const topup = searchParams.get("topup");
    if (checkout === "success" || topup === "success") {
      void syncFromServer();
    }
  }, [searchParams, syncFromServer]);

  const currentPlan = getPlanById(currentPlanId);
  const availableCredits = includedCreditsRemaining + topUpCreditsBalance;
  const recentTransactions = useMemo(
    () =>
      [...transactions]
        .sort(
          (a, b) =>
            new Date(b.createdAtISO).getTime() - new Date(a.createdAtISO).getTime(),
        )
        .slice(0, 6),
    [transactions],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
      <div className="space-y-1">
        <p className="text-xs uppercase text-muted-foreground">
          {t("account.dashboardLabel")}
        </p>
        <h1 className="text-2xl font-semibold">{t("account.dashboardTitle")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("account.dashboardDescription")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-muted/60 bg-card/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("billing.currentPlan")}
              </CardTitle>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xl font-semibold">{currentPlan.name}</p>
              <Badge variant="secondary">{t("common.active")}</Badge>
            </div>
            <Button asChild variant="outline" size="sm" className="w-full gap-2">
              <Link href="/dashboard/plans">
                {t("billing.changePlan")}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-muted/60 bg-card/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("billing.includedCredits")}
              </CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xl font-semibold">
              {formatCredits(availableCredits, currency, locale)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("billing.remaining", {
                credits: formatCredits(includedCreditsRemaining, currency, locale),
              })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("billing.topUpBalance")}: {formatCredits(topUpCreditsBalance, currency, locale)}
            </p>
            <Button asChild variant="ghost" size="sm" className="h-7 px-2">
              <Link href="/dashboard/usage">{t("billing.usage")}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-muted/60 bg-card/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("account.dashboardRecentActivity")}
              </CardTitle>
              <Gauge className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {recentTransactions[0] ? (
              <>
                <p className="text-xl font-semibold">
                  {formatCurrency(
                    recentTransactions[0].amount,
                    recentTransactions[0].currency,
                    locale,
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(new Date(recentTransactions[0].createdAtISO))}
                </p>
                <Button asChild variant="ghost" size="sm" className="h-7 px-2">
                  <Link href="/dashboard/billing">{t("billing.pageTitle")}</Link>
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("account.dashboardNoActivity")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <BillingSummaryCard />

      <TopUpModal />
      <UpgradeModal />
    </div>
  );
}
