"use client";

import { useMemo } from "react";
import { useUsageStore } from "@/lib/analytics/usage";
import { useDbUsage, getQuotaStatus } from "@/lib/hooks/useDbUsage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Usage Dashboard - displays API usage statistics
 * Shows real usage from DB when available, falls back to local estimates
 */
export function UsageDashboard() {
  // Local usage store (client-side estimates)
  const localUsage = useUsageStore();
  
  // Real usage from database
  const { summary: dbSummary, quota, loading, refresh } = useDbUsage();
  
  // Prefer DB data when available
  const hasDbData = !!dbSummary;
  const totalTokens = hasDbData ? dbSummary.totalTokens : (localUsage.totalInputTokens + localUsage.totalOutputTokens);
  const totalCostUsd = hasDbData ? dbSummary.totalCostUsd : localUsage.totalCostUsd;
  const periodStart = hasDbData 
    ? dbSummary.periodStart.toLocaleDateString() 
    : new Date(localUsage.periodStart).toLocaleDateString();

  const modelBreakdown = useMemo(() => {
    if (hasDbData && dbSummary.byModel) {
      return Object.entries(dbSummary.byModel).map(([model, data]) => ({
        model,
        count: data.requestCount,
        tokens: data.totalTokens,
        cost: data.costUsd,
      }));
    }
    
    const localBreakdown = localUsage.getModelBreakdown();
    return Object.entries(localBreakdown).map(([model, data]) => ({
      model,
      count: data.count,
      tokens: data.tokens,
      cost: data.cost,
    }));
  }, [hasDbData, dbSummary, localUsage]);

  const quotaStatus = getQuotaStatus(quota);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Usage Statistics</h2>
          <p className="text-sm text-muted-foreground">
            {hasDbData ? "Current billing period" : `Since ${periodStart}`}
            {!hasDbData && (
              <Badge variant="outline" className="ml-2 text-xs">
                Local estimates
              </Badge>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={loading}
          className="h-8 w-8 p-0"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          <span className="sr-only">Refresh usage</span>
        </Button>
      </div>

      {/* Quota Status */}
      {quota && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Daily Token Quota</span>
            <span className="text-sm text-muted-foreground">
              {formatNumber(quota.used)} / {formatNumber(quota.limit)}
            </span>
          </div>
          <Progress 
            value={quotaStatus.percentUsed} 
            className={`h-2 ${quotaStatus.isNearLimit ? "bg-yellow-100" : ""}`}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {formatNumber(quota.remaining)} tokens remaining today
            </span>
            {quotaStatus.isNearLimit && !quotaStatus.isOverLimit && (
              <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Near limit
              </Badge>
            )}
            {quotaStatus.isOverLimit && (
              <Badge variant="destructive">
                Quota exceeded
              </Badge>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Tokens"
          value={formatNumber(totalTokens)}
          description={hasDbData ? "Actual token usage" : "Estimated tokens"}
        />
        <StatCard
          title="Input Tokens"
          value={formatNumber(hasDbData ? Object.values(dbSummary.byModel).reduce((sum, m) => sum + m.promptTokens, 0) : localUsage.totalInputTokens)}
          description="Prompt tokens"
        />
        <StatCard
          title="Output Tokens"
          value={formatNumber(hasDbData ? Object.values(dbSummary.byModel).reduce((sum, m) => sum + m.completionTokens, 0) : localUsage.totalOutputTokens)}
          description="Completion tokens"
        />
        <StatCard
          title="Cost"
          value={`$${totalCostUsd.toFixed(4)}`}
          description={hasDbData ? "Actual cost" : "Estimated cost"}
        />
      </div>

      <Separator />

      <div>
        <h3 className="mb-4 text-sm font-semibold">Usage by Model</h3>
        {modelBreakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No usage data yet.</p>
        ) : (
          <div className="space-y-2">
            {modelBreakdown.map(({ model, count, tokens, cost }) => (
              <div
                key={model}
                className="flex items-center justify-between rounded-lg border px-4 py-3"
              >
                <div>
                  <p className="font-medium">{model}</p>
                  <p className="text-xs text-muted-foreground">
                    {count} requests · {formatNumber(tokens)} tokens
                  </p>
                </div>
                <span className="font-mono text-sm">
                  ${cost.toFixed(4)}
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
