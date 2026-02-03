"use client";

import { useMemo } from "react";
import { useUsageStore } from "@/lib/analytics/usage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

/**
 * Usage Dashboard - displays API usage statistics
 */
export function UsageDashboard() {
  const {
    totalMessages,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    periodStart,
    getModelBreakdown,
  } = useUsageStore();

  const modelBreakdown = useMemo(
    () => getModelBreakdown(),
    [getModelBreakdown],
  );
  const periodStartDate = new Date(periodStart).toLocaleDateString();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Usage Statistics</h2>
        <p className="text-sm text-muted-foreground">Since {periodStartDate}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Messages"
          value={totalMessages.toString()}
          description="Total API requests"
        />
        <StatCard
          title="Input Tokens"
          value={formatNumber(totalInputTokens)}
          description="Estimated prompt tokens"
        />
        <StatCard
          title="Output Tokens"
          value={formatNumber(totalOutputTokens)}
          description="Estimated completion tokens"
        />
        <StatCard
          title="Est. Cost"
          value={`$${totalCostUsd.toFixed(4)}`}
          description="Based on OpenAI pricing"
        />
      </div>

      <Separator />

      <div>
        <h3 className="mb-4 text-sm font-semibold">Usage by Model</h3>
        {Object.keys(modelBreakdown).length === 0 ? (
          <p className="text-sm text-muted-foreground">No usage data yet.</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(modelBreakdown).map(([model, data]) => (
              <div
                key={model}
                className="flex items-center justify-between rounded-lg border px-4 py-3"
              >
                <div>
                  <p className="font-medium">{model}</p>
                  <p className="text-xs text-muted-foreground">
                    {data.count} requests · {formatNumber(data.tokens)} tokens
                  </p>
                </div>
                <span className="font-mono text-sm">
                  ${data.cost.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}
