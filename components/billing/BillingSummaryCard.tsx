"use client";

import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect } from "react";
import { useBillingStore } from "@/lib/billing/store";
import { getPlanById } from "@/lib/billing/plans";
import {
  addMonths,
  formatCurrency,
  getIncludedCredits,
  getPlanPrice,
} from "@/lib/billing/utils";
import { UsageBars } from "@/components/billing/UsageBars";

export function BillingSummaryCard() {
  const {
    currentPlanId,
    currency,
    billingCadence,
    periodStartISO,
    periodEndISO,
    includedCreditsRemaining,
    topUpCreditsBalance,
    openTopUpModal,
    resetPeriodIfNeeded,
  } = useBillingStore();

  useEffect(() => {
    resetPeriodIfNeeded();
  }, [resetPeriodIfNeeded]);

  const plan = getPlanById(currentPlanId);
  const includedTotal = getIncludedCredits(plan, currency);
  const price = getPlanPrice(plan, currency, billingCadence);
  const startDate = new Date(periodStartISO);
  const nextRenewal = addMonths(
    startDate,
    billingCadence === "annual" ? 12 : 1,
  );

  return (
    <Card className="border-muted/60 bg-card/60">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle>Current plan</CardTitle>
          <Badge variant="secondary">{plan.name}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {price === 0
            ? "Free forever"
            : `${formatCurrency(price, currency)} billed ${billingCadence}`}{" "}
          - Next renewal {nextRenewal.toLocaleDateString()}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <UsageBars
          includedRemaining={includedCreditsRemaining}
          includedTotal={includedTotal}
          topUpBalance={topUpCreditsBalance}
          currency={currency}
        />

        <div className="rounded-lg border border-dashed border-muted/60 bg-background/40 px-4 py-3 text-sm text-muted-foreground">
          Credits reset on {new Date(periodEndISO).toLocaleDateString()}.
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/pricing">Change plan</Link>
          </Button>
          <Button onClick={openTopUpModal}>Top up credits</Button>
          <Button variant="ghost" className="text-muted-foreground">
            Manage payment method
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
