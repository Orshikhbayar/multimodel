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
import { useI18n } from "@/lib/i18n";

/**
 * Usage Dashboard - displays API usage statistics
 * Shows real usage from DB when available, falls back to local estimates
 */
export function UsageDashboard() {
  const { t, formatDate, formatNumber: formatLocalizedNumber } = useI18n();
  // Local usage store (client-side estimates)
  const localUsage = useUsageStore();
  
  // Real usage from database
  const { summary: dbSummary, quota, loading, refresh } = useDbUsage();
  
  // Prefer DB data when available
  const hasDbData = !!dbSummary;
  const totalTokens = hasDbData ? dbSummary.totalTokens : (localUsage.totalInputTokens + localUsage.totalOutputTokens);
  const totalCostUsd = hasDbData ? dbSummary.totalCostUsd : localUsage.totalCostUsd;
  const periodStart = hasDbData 
    ? formatDate(dbSummary.periodStart)
    : formatDate(new Date(localUsage.periodStart));

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
          <h2 className="text-lg font-semibold">{t("billing.usageStatistics")}</h2>
          <p className="text-sm text-muted-foreground">
            {hasDbData
              ? t("billing.currentBillingPeriod")
              : t("billing.sinceDate", { date: periodStart })}
            {!hasDbData && (
              <Badge variant="outline" className="ml-2 text-xs">
                {t("billing.localEstimates")}
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
          <span className="sr-only">{t("billing.refreshUsage")}</span>
        </Button>
      </div>

      {/* Quota Status */}
      {quota && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{t("billing.dailyTokenQuota")}</span>
            <span className="text-sm text-muted-foreground">
              {formatCompactNumber(quota.used, formatLocalizedNumber)} / {formatCompactNumber(quota.limit, formatLocalizedNumber)}
            </span>
          </div>
          <Progress 
            value={quotaStatus.percentUsed} 
            className={`h-2 ${quotaStatus.isNearLimit ? "bg-yellow-100" : ""}`}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t("billing.tokensRemainingToday", {
                count: formatCompactNumber(quota.remaining, formatLocalizedNumber),
              })}
            </span>
            {quotaStatus.isNearLimit && !quotaStatus.isOverLimit && (
              <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {t("billing.nearLimit")}
              </Badge>
            )}
            {quotaStatus.isOverLimit && (
              <Badge variant="destructive">
                {t("billing.quotaExceeded")}
              </Badge>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t("billing.totalTokens")}
          value={formatCompactNumber(totalTokens, formatLocalizedNumber)}
          description={
            hasDbData
              ? t("billing.actualTokenUsage")
              : t("billing.estimatedTokens")
          }
        />
        <StatCard
          title={t("billing.inputTokens")}
          value={formatCompactNumber(
            hasDbData
              ? Object.values(dbSummary.byModel).reduce(
                  (sum, m) => sum + m.promptTokens,
                  0,
                )
              : localUsage.totalInputTokens,
            formatLocalizedNumber,
          )}
          description={t("billing.promptTokens")}
        />
        <StatCard
          title={t("billing.outputTokens")}
          value={formatCompactNumber(
            hasDbData
              ? Object.values(dbSummary.byModel).reduce(
                  (sum, m) => sum + m.completionTokens,
                  0,
                )
              : localUsage.totalOutputTokens,
            formatLocalizedNumber,
          )}
          description={t("billing.completionTokens")}
        />
        <StatCard
          title={t("billing.cost")}
          value={`$${totalCostUsd.toFixed(4)}`}
          description={hasDbData ? t("billing.actualCost") : t("billing.estimatedCost")}
        />
      </div>

      <Separator />

      <div>
        <h3 className="mb-4 text-sm font-semibold">{t("billing.usageByModel")}</h3>
        {modelBreakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("billing.noUsageDataYet")}</p>
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
                    {t("billing.requestsAndTokens", {
                      count,
                      tokens: formatCompactNumber(tokens, formatLocalizedNumber),
                    })}
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

function formatCompactNumber(
  num: number,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
): string {
  return formatNumber(num, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}
