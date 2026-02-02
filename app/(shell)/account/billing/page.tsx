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

export default function BillingPage() {
  const { transactions, currency } = useBillingStore();

  const topUps = transactions.filter((tx) => tx.type === "topup");
  const invoices = transactions.filter((tx) => tx.type === "subscription");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Account</p>
          <h1 className="text-2xl font-semibold">Billing</h1>
        </div>

        <BillingSummaryCard />

        <Card className="border-muted/60 bg-card/60">
          <CardHeader>
            <CardTitle>Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <UsageDashboard />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-muted/60 bg-card/60">
            <CardHeader>
              <CardTitle>Top-up history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {topUps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No top-ups yet.</p>
              ) : (
                topUps.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">Top-up credits</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.createdAtISO).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="font-semibold">{formatCurrency(tx.amount, tx.currency)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-muted/60 bg-card/60">
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
              ) : (
                invoices.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{tx.note ?? "Subscription"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.createdAtISO).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Paid</Badge>
                      <span className="font-semibold">{formatCurrency(tx.amount, tx.currency)}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label="Download invoice"
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
            <CardTitle>Images</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Image generation is coming soon. Your plan will determine access and pricing.</p>
            <p>When available, each image will draw from your credits balance.</p>
            <div className="text-xs">Current currency: {currency}</div>
          </CardContent>
        </Card>
      <TopUpModal />
      <UpgradeModal />
    </div>
  );
}
