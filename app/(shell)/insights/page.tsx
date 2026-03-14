"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, BarChart3, Loader2, TrendingUp } from "lucide-react";

import { ContentColumn, PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/lib/stores";

interface FunnelStep {
  step: string;
  count: number;
  conversion_from_prev_pct: number | null;
}

interface MetricsPayload {
  window_days: number;
  since: string;
  funnel: FunnelStep[];
  templates: {
    created: number;
    updated: number;
    applied: number;
    assets_saved: number;
    reuse_rate_pct: number;
  };
  autopilot: {
    total_runs: number;
    succeeded: number;
    failed: number;
    queued: number;
    running: number;
    deduplicated: number;
    success_rate_pct: number;
    on_time_success_rate_pct: number;
  };
  retention: {
    active_last_7_days: boolean;
    activity_events_last_7_days: number;
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with ${response.status}`);
  }
  return payload;
}

export default function InsightsPage() {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);

  const loadMetrics = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchJson<MetricsPayload>(
        `/api/metrics/mvp?workspace_id=${encodeURIComponent(workspaceId)}&days=30`,
      );
      setMetrics(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background py-6">
      <ContentColumn className="space-y-6">
        <PageHeader
          label="Insights"
          title="MVP Metrics"
          actions={
            <Button onClick={loadMetrics} variant="outline">
              Refresh
            </Button>
          }
        />

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading metrics...
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {metrics ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4" />
                    Activation
                  </CardTitle>
                  <CardDescription>
                    Last {metrics.window_days} days
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">
                    {metrics.funnel[metrics.funnel.length - 1]?.count ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Assets saved (funnel step 5)
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Activity className="h-4 w-4" />
                    Autopilot Success
                  </CardTitle>
                  <CardDescription>Run reliability</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">
                    {metrics.autopilot.success_rate_pct}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {metrics.autopilot.succeeded}/{metrics.autopilot.total_runs}{" "}
                    runs succeeded
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <BarChart3 className="h-4 w-4" />
                    Template Reuse
                  </CardTitle>
                  <CardDescription>Applied vs created</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">
                    {metrics.templates.reuse_rate_pct}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {metrics.templates.applied} applied /{" "}
                    {metrics.templates.created} created
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Activity className="h-4 w-4" />
                    Retention Signal
                  </CardTitle>
                  <CardDescription>Last 7 days</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">
                    {metrics.retention.activity_events_last_7_days}
                  </p>
                  <div className="mt-1">
                    <Badge
                      variant={
                        metrics.retention.active_last_7_days
                          ? "default"
                          : "secondary"
                      }
                    >
                      {metrics.retention.active_last_7_days
                        ? "Active"
                        : "Inactive"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Activation Funnel</CardTitle>
                <CardDescription>
                  Window starts {new Date(metrics.since).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {metrics.funnel.map((step) => (
                    <div
                      key={step.step}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{step.step}</p>
                        <p className="text-xs text-muted-foreground">
                          {step.conversion_from_prev_pct === null
                            ? "baseline step"
                            : `${step.conversion_from_prev_pct}% from previous step`}
                        </p>
                      </div>
                      <p className="text-lg font-semibold">{step.count}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </ContentColumn>
    </div>
  );
}
