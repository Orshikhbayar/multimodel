"use client";

import { Check, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBillingStore } from "@/lib/billing/store";
import { PLANS } from "@/lib/billing/plans";
import { formatCurrency, formatCredits, getIncludedCredits, getPlanPrice } from "@/lib/billing/utils";

export function PricingTiers() {
  const {
    currency,
    billingCadence,
    currentPlanId,
    setCurrency,
    setBillingCadence,
    choosePlan,
  } = useBillingStore();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Pricing</p>
          <h1 className="text-3xl font-semibold">Hybrid billing for every team</h1>
          <p className="text-sm text-muted-foreground">
            Pick a plan, get included credits monthly, and top up only when you need more.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border bg-background p-1">
            <button
              type="button"
              onClick={() => setBillingCadence("monthly")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                billingCadence === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCadence("annual")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                billingCadence === "annual" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Annual
            </button>
          </div>
          <div className="inline-flex rounded-full border bg-background p-1">
            <button
              type="button"
              onClick={() => setCurrency("USD")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                currency === "USD" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              USD
            </button>
            <button
              type="button"
              onClick={() => setCurrency("MNT")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                currency === "MNT" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
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
                  {plan.id === "pro" && <Badge>Most popular</Badge>}
                </div>
                <div className="text-3xl font-semibold">
                  {price === 0 ? "Free" : formatCurrency(price, currency)}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    /{billingCadence === "monthly" ? "mo" : "yr"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCredits(included, currency)} included monthly credits.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <Feature
                    label={`${plan.maxEnabledModels} enabled model${plan.maxEnabledModels > 1 ? "s" : ""}`}
                    enabled
                  />
                  <Feature label="Web search" enabled={plan.features.webSearch} />
                  <Feature label="Tools & automations" enabled={plan.features.tools} />
                  <Feature label="Image generation" enabled={plan.features.images} />
                  <Feature label="Projects & workspace" enabled={plan.features.projects} />
                </div>
                <Button
                  className="w-full"
                  variant={isCurrent ? "secondary" : "default"}
                  onClick={() => choosePlan(plan.id)}
                >
                  {isCurrent
                    ? "Current plan"
                    : plan.id === "free"
                      ? "Choose Free"
                      : `Upgrade to ${plan.name}`}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Feature({ label, enabled = true }: { label: string; enabled?: boolean }) {
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
