"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  RefreshCw,
  AlertTriangle,
  Zap,
  Clock,
  Calendar,
  CalendarDays,
  CreditCard,
  Shield,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────────

interface UsageLimitsData {
  plan: {
    id: string;
    name: string;
    dailyTokenCap: number;
    monthlyTokenCap: number;
    maxEnabledModels: number;
    includedMonthlyCreditsUsd: number;
  };
  daily: {
    tokensUsed: number;
    tokenLimit: number;
    requestCount: number;
    costUsd: number;
    percentUsed: number;
    resetsAt: string;
  };
  weekly: {
    tokensUsed: number;
    requestCount: number;
    costUsd: number;
    tokenLimit: number;
    percentUsed: number;
  };
  monthly: {
    tokensUsed: number;
    tokenLimit: number;
    requestCount: number;
    costUsd: number;
    percentUsed: number;
    periodStart: string;
    periodEnd: string;
  };
  credits: {
    included: number;
    bonus: number;
    topUp: number;
    total: number;
    usedThisPeriod: number;
    remainingEstimate: number;
    percentUsed: number;
  };
  rateLimits: {
    requestsPerMinute: number;
    windowSeconds: number;
    maxConcurrentStreams: number;
  };
  timestamp: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function getBarColor(percent: number): string {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function getTimeUntil(isoString: string): string {
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return "now";
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ─── Sub-components ────────────────────────────────────────────────────

function UsageMeter({
  label,
  icon: Icon,
  used,
  limit,
  percent,
  detail,
  subtitle,
}: {
  label: string;
  icon: React.ElementType;
  used: string;
  limit: string;
  percent: number;
  detail?: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <div className="text-right">
          <span className="text-sm tabular-nums">
            {used}
            {limit !== "Unlimited" && (
              <span className="text-muted-foreground"> / {limit}</span>
            )}
          </span>
          {limit === "Unlimited" && (
            <Badge
              variant="outline"
              className="ml-2 text-xs border-emerald-500/30 text-emerald-600"
            >
              Unlimited
            </Badge>
          )}
        </div>
      </div>

      {limit !== "Unlimited" && (
        <div className="relative">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${getBarColor(percent)}`}
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {percent}% used
            </span>
            {detail && (
              <span className="text-xs text-muted-foreground">{detail}</span>
            )}
          </div>
        </div>
      )}

      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────

export function DashboardLimits() {
  const [data, setData] = useState<UsageLimitsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLimits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/usage/limits");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLimits();
    // Refresh every 60 seconds
    const interval = setInterval(fetchLimits, 60_000);
    return () => clearInterval(interval);
  }, [fetchLimits]);

  if (loading && !data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Dashboard</p>
          <h1 className="text-2xl font-semibold">Usage Limits</h1>
        </div>
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Dashboard</p>
          <h1 className="text-2xl font-semibold">Usage Limits</h1>
        </div>
        <Card className="border-destructive/40">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
            <p className="mt-2 text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={fetchLimits}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const isFreePlan = data.plan.id === "free";
  const hasTokenLimits = data.plan.dailyTokenCap > 0;
  const isNearDailyLimit = data.daily.percentUsed >= 80;
  const isDailyExceeded = data.daily.percentUsed >= 100;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Dashboard</p>
          <h1 className="text-2xl font-semibold">Usage Limits</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={isFreePlan ? "secondary" : "default"}
            className="text-xs"
          >
            {data.plan.name} Plan
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchLimits}
            disabled={loading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Alert Banner */}
      {isDailyExceeded && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-500">
              Daily limit reached
            </p>
            <p className="text-xs text-red-400">
              Resets in {getTimeUntil(data.daily.resetsAt)}.{" "}
              {isFreePlan && "Upgrade to Pro for higher limits."}
            </p>
          </div>
          {isFreePlan && (
            <Link href="/dashboard/plans">
              <Button
                size="sm"
                variant="outline"
                className="border-red-500/30 text-red-500 hover:bg-red-500/10"
              >
                Upgrade
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          )}
        </div>
      )}

      {isNearDailyLimit && !isDailyExceeded && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-600">
              Approaching daily limit
            </p>
            <p className="text-xs text-amber-500">
              {data.daily.percentUsed}% of daily token cap used. Resets in{" "}
              {getTimeUntil(data.daily.resetsAt)}.
            </p>
          </div>
        </div>
      )}

      {/* Main Usage Meters */}
      <Card className="border-muted/60 bg-card/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Token Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Daily */}
          <UsageMeter
            label="Daily Usage"
            icon={Clock}
            used={formatTokens(data.daily.tokensUsed)}
            limit={
              hasTokenLimits ? formatTokens(data.daily.tokenLimit) : "Unlimited"
            }
            percent={data.daily.percentUsed}
            detail={
              hasTokenLimits
                ? `Resets in ${getTimeUntil(data.daily.resetsAt)}`
                : undefined
            }
            subtitle={`${data.daily.requestCount} requests today ($${data.daily.costUsd.toFixed(4)})`}
          />

          <Separator />

          {/* Weekly */}
          <UsageMeter
            label="Weekly Usage (7 days)"
            icon={CalendarDays}
            used={formatTokens(data.weekly.tokensUsed)}
            limit={
              data.weekly.tokenLimit > 0
                ? formatTokens(data.weekly.tokenLimit)
                : "Unlimited"
            }
            percent={data.weekly.percentUsed}
            subtitle={`${data.weekly.requestCount} requests ($${data.weekly.costUsd.toFixed(4)})`}
          />

          <Separator />

          {/* Monthly */}
          <UsageMeter
            label="Monthly Usage"
            icon={Calendar}
            used={formatTokens(data.monthly.tokensUsed)}
            limit={
              data.monthly.tokenLimit > 0
                ? formatTokens(data.monthly.tokenLimit)
                : "Unlimited"
            }
            percent={data.monthly.percentUsed}
            detail={`Period ends ${new Date(data.monthly.periodEnd).toLocaleDateString()}`}
            subtitle={`${data.monthly.requestCount} requests ($${data.monthly.costUsd.toFixed(4)})`}
          />
        </CardContent>
      </Card>

      {/* Credits */}
      <Card className="border-muted/60 bg-card/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            Credits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-muted/60 p-3">
              <p className="text-xs text-muted-foreground">Included</p>
              <p className="text-lg font-semibold">
                ${data.credits.included.toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg border border-muted/60 p-3">
              <p className="text-xs text-muted-foreground">Used This Period</p>
              <p className="text-lg font-semibold">
                ${data.credits.usedThisPeriod.toFixed(4)}
              </p>
            </div>
            <div className="rounded-lg border border-muted/60 p-3">
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className="text-lg font-semibold text-emerald-600">
                ${data.credits.remainingEstimate.toFixed(2)}
              </p>
            </div>
          </div>

          {data.credits.total > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Credit usage</span>
                <span>{data.credits.percentUsed}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getBarColor(data.credits.percentUsed)}`}
                  style={{
                    width: `${Math.min(100, data.credits.percentUsed)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rate Limits & Plan Details */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-muted/60 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Rate Limits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Requests per minute
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {data.rateLimits.requestsPerMinute} /{" "}
                  {data.rateLimits.windowSeconds}s
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Concurrent streams
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {data.rateLimits.maxConcurrentStreams}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-muted/60 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4" />
              Plan Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Max models
                </span>
                <span className="text-sm font-medium">
                  {data.plan.maxEnabledModels}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Monthly credits
                </span>
                <span className="text-sm font-medium">
                  ${data.plan.includedMonthlyCreditsUsd.toFixed(2)}
                </span>
              </div>
              {isFreePlan && (
                <>
                  <Separator />
                  <Link href="/dashboard/plans" className="block">
                    <Button variant="outline" size="sm" className="w-full">
                      Upgrade to Pro
                      <ArrowUpRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timestamp */}
      <p className="text-center text-xs text-muted-foreground">
        Last updated: {new Date(data.timestamp).toLocaleTimeString()}{" "}
        (auto-refreshes every 60s)
      </p>
    </div>
  );
}
