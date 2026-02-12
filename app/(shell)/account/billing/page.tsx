"use client";

import { BillingSummaryCard } from "@/components/billing/BillingSummaryCard";
import { TopUpModal } from "@/components/billing/TopUpModal";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { UsageDashboard } from "@/components/UsageDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBillingStore } from "@/lib/billing/store";
import { formatCurrency } from "@/lib/billing/utils";
import { useI18n } from "@/lib/i18n";

export default function BillingPage() {
  const { t, locale, formatDate } = useI18n();
  const { transactions, currency } = useBillingStore();

  const topUps = transactions.filter((tx) => tx.type === "topup");
  const invoices = transactions.filter((tx) => tx.type === "subscription");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
      <div>
        <p className="text-xs uppercase text-muted-foreground">{t("billing.pageLabel")}</p>
        <h1 className="text-2xl font-semibold">{t("billing.pageTitle")}</h1>
      </div>

      <BillingSummaryCard />

      <Card className="border-muted/60 bg-card/60">
        <CardHeader>
          <CardTitle>{t("billing.usage")}</CardTitle>
        </CardHeader>
        <CardContent>
          <UsageDashboard />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-muted/60 bg-card/60">
          <CardHeader>
            <CardTitle>{t("billing.topUpHistory")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topUps.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("billing.noTopUpsYet")}</p>
            ) : (
              topUps.slice(0, 5).map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div>
                    <p className="font-medium">{t("billing.topUpCredits")}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(new Date(tx.createdAtISO))}
                    </p>
                  </div>
                  <span className="font-semibold">
                    {formatCurrency(tx.amount, tx.currency, locale)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-muted/60 bg-card/60">
          <CardHeader>
            <CardTitle>{t("billing.invoices")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("billing.noInvoicesYet")}</p>
            ) : (
              invoices.slice(0, 5).map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div>
                    <p className="font-medium">{tx.note ?? t("billing.subscription")}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(new Date(tx.createdAtISO))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{t("billing.paid")}</Badge>
                    <span className="font-semibold">
                      {formatCurrency(tx.amount, tx.currency, locale)}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label={t("accessibility.downloadInvoice")}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-muted/60 bg-card/60">
        <CardHeader>
          <CardTitle>{t("billing.images")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{t("billing.imagesComingSoon")}</p>
          <p>{t("billing.imagesCredits")}</p>
          <div className="text-xs">{t("billing.currentCurrency", { currency })}</div>
        </CardContent>
      </Card>
      <TopUpModal />
      <UpgradeModal />
    </div>
  );
}
