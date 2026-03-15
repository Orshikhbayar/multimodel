"use client";

import { Check, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBillingStore } from "@/lib/billing/store";
import { PLANS } from "@/lib/billing/plans";
import { useI18n } from "@/lib/i18n";
import {
  formatCurrency,
  formatCredits,
  getIncludedCredits,
  getPlanPrice,
} from "@/lib/billing/utils";

export function PricingTiers() {
  const { t, locale } = useI18n();
  const {
    currency,
    billingCadence,
    currentPlanId,
    loading,
    setCurrency,
    setBillingCadence,
    choosePlan,
  } = useBillingStore();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase text-muted-foreground">
            {t("billing.pricing")}
          </p>
          <h1 className="text-3xl font-semibold">
            {t("billing.pricingTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("billing.pricingDescription")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border bg-background p-1">
            <button
              type="button"
              onClick={() => setBillingCadence("monthly")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                billingCadence === "monthly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {t("billing.monthly")}
            </button>
            <button
              type="button"
              onClick={() => setBillingCadence("annual")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                billingCadence === "annual"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {t("billing.annual")}
            </button>
          </div>
          <div className="inline-flex rounded-full border bg-background p-1">
            <button
              type="button"
              onClick={() => setCurrency("USD")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                currency === "USD"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              USD
            </button>
            <button
              type="button"
              onClick={() => setCurrency("MNT")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                currency === "MNT"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              MNT
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const price = getPlanPrice(plan, currency, billingCadence);
          const included = getIncludedCredits(plan, currency);
          const isCurrent = currentPlanId === plan.id;

          return (
            <Card key={plan.id} className="border-muted/60 bg-card/60">
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <CardTitle>{plan.name}</CardTitle>
                  {plan.id === "pro" && (
                    <Badge>{t("billing.mostPopular")}</Badge>
                  )}
                </div>
                <div className="text-3xl font-semibold">
                  {price === 0
                    ? t("billing.free")
                    : formatCurrency(price, currency, locale)}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    /
                    {billingCadence === "monthly"
                      ? t("billing.perMonth")
                      : t("billing.perYear")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("billing.includedMonthlyCredits", {
                    credits: formatCredits(included, currency, locale),
                  })}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <Feature
                    label={t("billing.enabledModels", {
                      count: plan.maxEnabledModels,
                    })}
                    enabled
                  />
                  <Feature
                    label={t("billing.webSearch")}
                    enabled={plan.features.webSearch}
                  />
                  <Feature
                    label={t("billing.toolsAndAutomations")}
                    enabled={plan.features.tools}
                  />
                  <Feature
                    label={t("billing.imageGeneration")}
                    enabled={plan.features.images}
                  />
                  <Feature
                    label={t("billing.projectsAndWorkspace")}
                    enabled={plan.features.projects}
                  />
                </div>
                <Button
                  className="w-full whitespace-nowrap px-3 text-sm"
                  variant={isCurrent ? "secondary" : "default"}
                  disabled={loading}
                  onClick={async () => {
                    await choosePlan(plan.id);
                  }}
                >
                  {isCurrent
                    ? t("billing.currentPlan")
                    : plan.id === "free"
                      ? t("billing.chooseFree")
                      : t("billing.upgradeToPlan", { plan: plan.name })}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Feature({
  label,
  enabled = true,
}: {
  label: string;
  enabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {enabled ? (
        <Check className="h-4 w-4 text-emerald-500" />
      ) : (
        <Minus className="h-4 w-4 text-muted-foreground" />
      )}
      <span className={enabled ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}
