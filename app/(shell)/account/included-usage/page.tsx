import { Info } from "lucide-react";

import { getIncludedUsage } from "@/lib/actions/billing";

export const dynamic = "force-dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const BUCKET_TITLE: Record<string, string> = {
  included_plan: "Included in Plan",
  included_auto: "Included via Auto",
  bonus: "Included Bonus",
  overage: "Overage",
  reversal: "Reversals",
};

function formatUsdInt(amountUsdInt: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountUsdInt / 100);
}

function formatTokens(tokens: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(tokens);
}

function isDynamicServerUsageError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  return (error as { digest?: unknown }).digest === "DYNAMIC_SERVER_USAGE";
}

export default async function IncludedUsagePage() {
  let reportError = false;
  let report = null;
  try {
    report = await getIncludedUsage();
  } catch (error) {
    if (isDynamicServerUsageError(error)) {
      throw error;
    }
    console.error("[IncludedUsagePage] failed to load usage report", error);
    reportError = true;
  }

  if (!report) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
        <h1 className="text-2xl font-semibold">Included Usage</h1>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {reportError
              ? "Included usage is temporarily unavailable."
              : "Sign in to view included usage."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const grouped = report.rows.reduce((acc, row) => {
    const key = row.bucket;
    const list = acc.get(key) ?? [];
    list.push(row);
    acc.set(key, list);
    return acc;
  }, new Map<string, typeof report.rows>());

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
      <div className="space-y-1">
        <p className="text-xs uppercase text-muted-foreground">Billing</p>
        <h1 className="text-2xl font-semibold">Included Usage</h1>
        <p className="text-sm text-muted-foreground">
          Current billing period:{" "}
          {new Date(report.periodStartISO).toLocaleDateString()} -{" "}
          {new Date(report.periodEndISO).toLocaleDateString()}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Usage value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {formatUsdInt(report.usageValueUsdInt)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Billed this cycle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-3xl font-semibold">
              {formatUsdInt(report.billedUsdInt)}
            </p>
            <p className="text-xs text-muted-foreground">
              Subscription {formatUsdInt(report.subscriptionBilledUsdInt)} +
              overage {formatUsdInt(report.overageBilledUsdInt)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Saved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {formatUsdInt(report.savedUsdInt)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Included Usage Breakdown</CardTitle>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                aria-label="How cost is calculated"
              >
                <Info className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="max-w-sm text-xs leading-relaxed">
              Cost is calculated using public API-equivalent rates. Included
              means covered by your plan or Auto policy.
            </PopoverContent>
          </Popover>
        </CardHeader>
        <CardContent className="space-y-6">
          {Array.from(grouped.entries()).map(([bucket, rows]) => (
            <div key={bucket} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  {BUCKET_TITLE[bucket] ?? bucket}
                </h2>
                {bucket === "included_plan" ||
                bucket === "included_auto" ||
                bucket === "bonus" ? (
                  <Badge variant="secondary">Included</Badge>
                ) : bucket === "overage" ? (
                  <Badge variant="outline">Overage</Badge>
                ) : (
                  <Badge variant="outline">Reversal</Badge>
                )}
              </div>

              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Item (Model)</th>
                      <th className="px-3 py-2">Tokens</th>
                      <th className="px-3 py-2">Cost (Value)</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={`${row.bucket}:${row.modelId}`}
                        className="border-t"
                      >
                        <td className="px-3 py-2 font-medium">{row.modelId}</td>
                        <td className="px-3 py-2">
                          {formatTokens(row.tokens)}
                        </td>
                        <td className="px-3 py-2">
                          {formatUsdInt(row.usageValueUsdInt)}
                        </td>
                        <td className="px-3 py-2">
                          {row.included ? (
                            <Badge variant="secondary">Included</Badge>
                          ) : (
                            <Badge variant="outline">Overage</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
