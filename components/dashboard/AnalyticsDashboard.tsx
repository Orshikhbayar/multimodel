"use client";

import { useMemo, useState } from "react";
import { Activity, Coins, Crown, Gauge, Hash, Lightbulb } from "lucide-react";

import { cn } from "@/lib/utils";

export interface AnalyticsRun {
  created_at: string;
  total_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
  model: string;
  provider: string;
  rating: number | null;
  status: string;
}

type RangeDays = 7 | 30 | 90;

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#1D9E75",
  anthropic: "#D85A30",
  google: "#378ADD",
  xai: "#7F77DD",
  deepseek: "#D4537E",
  other: "#888780",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function lastDays(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    out.push(dayKey(new Date(today.getTime() - i * DAY_MS)));
  }
  return out;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

interface DayAgg {
  tokens: number;
  cost: number;
  count: number;
  latencySum: number;
  latencyCount: number;
}

function emptyDay(): DayAgg {
  return { tokens: 0, cost: 0, count: 0, latencySum: 0, latencyCount: 0 };
}

function aggregateByDay(runs: AnalyticsRun[]) {
  const byDay = new Map<string, DayAgg>();
  for (const run of runs) {
    const key = run.created_at.slice(0, 10);
    const agg = byDay.get(key) ?? emptyDay();
    agg.tokens += run.total_tokens ?? 0;
    agg.cost += run.cost_usd ?? 0;
    agg.count += 1;
    if (typeof run.latency_ms === "number") {
      agg.latencySum += run.latency_ms;
      agg.latencyCount += 1;
    }
    byDay.set(key, agg);
  }
  return byDay;
}

function windowTotals(byDay: Map<string, DayAgg>, days: string[]) {
  const total = emptyDay();
  for (const day of days) {
    const agg = byDay.get(day);
    if (!agg) continue;
    total.tokens += agg.tokens;
    total.cost += agg.cost;
    total.count += agg.count;
    total.latencySum += agg.latencySum;
    total.latencyCount += agg.latencyCount;
  }
  return total;
}

function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 64;
  const h = 20;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values
    .map(
      (v, i) =>
        `${((i / Math.max(1, values.length - 1)) * w).toFixed(1)},${(
          h -
          2 -
          ((v - min) / span) * (h - 4)
        ).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AreaChart({ days, values }: { days: string[]; values: number[] }) {
  const w = 600;
  const h = 180;
  const max = Math.max(...values, 1);
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * w;
  const y = (v: number) => h - 14 - (v / max) * (h - 28);
  const line = values
    .map(
      (v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const slice = w / values.length;

  return (
    <div className="relative">
      <span className="absolute right-0 -top-1 text-[10px] tabular-nums text-muted-foreground">
        peak {fmt(max)}
      </span>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-[170px] w-full"
        role="img"
        aria-label="Daily token usage for the selected range"
      >
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1="0"
            x2={w}
            y1={h - 14 - p * (h - 28)}
            y2={h - 14 - p * (h - 28)}
            stroke="currentColor"
            strokeOpacity="0.07"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill="hsl(var(--primary))" fillOpacity="0.12" />
        <path
          d={line}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        {values.map((v, i) => (
          <rect
            key={days[i]}
            x={x(i) - slice / 2}
            y="0"
            width={slice}
            height={h}
            fill="transparent"
          >
            <title>{`${days[i]} · ${fmt(v)} tokens`}</title>
          </rect>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{days[0]}</span>
        <span>{days[days.length - 1]}</span>
      </div>
    </div>
  );
}

function Donut({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const r = 42;
  const c = 2 * Math.PI * r;
  const withOffsets: {
    label: string;
    value: number;
    color: string;
    frac: number;
    offset: number;
  }[] = [];
  let acc = 0;
  for (const s of segments) {
    const frac = s.value / total;
    withOffsets.push({ ...s, frac, offset: acc });
    acc += frac;
  }

  return (
    <div className="flex items-center gap-5">
      <svg
        viewBox="0 0 110 110"
        className="h-[120px] w-[120px] shrink-0"
        role="img"
        aria-label="Cost share by provider"
      >
        {withOffsets.map((s) => (
          <circle
            key={s.label}
            cx="55"
            cy="55"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="13"
            strokeDasharray={`${(s.frac * c).toFixed(2)} ${(c - s.frac * c).toFixed(2)}`}
            strokeDashoffset={(-s.offset * c).toFixed(2)}
            transform="rotate(-90 55 55)"
          >
            <title>{`${s.label} · ${Math.round(s.frac * 100)}% · $${s.value.toFixed(2)}`}</title>
          </circle>
        ))}
        <text
          x="55"
          y="53"
          textAnchor="middle"
          className="fill-foreground text-[13px] font-medium tabular-nums"
        >
          ${total.toFixed(2)}
        </text>
        <text
          x="55"
          y="67"
          textAnchor="middle"
          className="fill-muted-foreground text-[8px]"
        >
          total spend
        </text>
      </svg>
      <ul className="space-y-1.5 text-xs">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="capitalize text-muted-foreground">{s.label}</span>
            <span className="tabular-nums">
              {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AnalyticsDashboard({ runs }: { runs: AnalyticsRun[] }) {
  const [range, setRange] = useState<RangeDays>(30);

  const byDay = useMemo(() => aggregateByDay(runs), [runs]);

  const view = useMemo(() => {
    const days = lastDays(range);
    const prevDays = lastDays(range * 2).slice(0, range);
    const current = windowTotals(byDay, days);
    const previous = windowTotals(byDay, prevDays);

    const tokensSeries = days.map((d) => byDay.get(d)?.tokens ?? 0);
    const requestSeries = days.map((d) => byDay.get(d)?.count ?? 0);
    const costSeries = days.map((d) => byDay.get(d)?.cost ?? 0);

    const cutoff = days[0];
    const inRange = runs.filter((r) => r.created_at.slice(0, 10) >= cutoff);

    const byProvider = new Map<string, number>();
    const byModel = new Map<string, { cost: number; count: number }>();
    let thumbsUp = 0;
    let thumbsTotal = 0;
    for (const run of inRange) {
      const provider = PROVIDER_COLORS[run.provider] ? run.provider : "other";
      byProvider.set(
        provider,
        (byProvider.get(provider) ?? 0) + (run.cost_usd ?? 0),
      );
      const m = byModel.get(run.model) ?? { cost: 0, count: 0 };
      m.cost += run.cost_usd ?? 0;
      m.count += 1;
      byModel.set(run.model, m);
      if (run.rating === 1) thumbsUp += 1;
      if (run.rating === 1 || run.rating === -1) thumbsTotal += 1;
    }

    const donut = [...byProvider.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({
        label,
        value,
        color: PROVIDER_COLORS[label] ?? PROVIDER_COLORS.other,
      }));

    const board = [...byModel.entries()]
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);

    const avgLatency =
      current.latencyCount > 0 ? current.latencySum / current.latencyCount : 0;
    const prevLatency =
      previous.latencyCount > 0
        ? previous.latencySum / previous.latencyCount
        : 0;

    const weekdayCounts = new Array(7).fill(0);
    for (const [day, agg] of byDay) {
      if (day >= cutoff) weekdayCounts[new Date(day).getUTCDay()] += agg.count;
    }
    const quietest = weekdayCounts.indexOf(Math.min(...weekdayCounts));
    const weekdayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    const insights: string[] = [];
    if (board[0]) {
      insights.push(
        `${board[0].model} leads spend at $${board[0].cost.toFixed(2)} across ${board[0].count.toLocaleString()} runs.`,
      );
    }
    if (thumbsTotal >= 5) {
      insights.push(
        `${Math.round((thumbsUp / thumbsTotal) * 100)}% of rated responses got a thumbs-up (${thumbsTotal.toLocaleString()} ratings).`,
      );
    }
    if (current.count > 0) {
      insights.push(
        `${weekdayNames[quietest]} is your quietest day — a natural window for batch jobs.`,
      );
    }

    return {
      days,
      current,
      tokensSeries,
      requestSeries,
      costSeries,
      donut,
      board,
      avgLatency,
      insights,
      deltas: {
        tokens: deltaPct(current.tokens, previous.tokens),
        cost: deltaPct(current.cost, previous.cost),
        count: deltaPct(current.count, previous.count),
        latency: deltaPct(avgLatency, prevLatency),
      },
    };
  }, [byDay, runs, range]);

  const heatmap = useMemo(() => {
    const days = lastDays(112);
    const counts = days.map((d) => byDay.get(d)?.count ?? 0);
    const max = Math.max(...counts, 1);
    const offset = (new Date(days[0]).getUTCDay() + 6) % 7;
    return { days, counts, max, offset };
  }, [byDay]);

  const kpis = [
    {
      label: "Tokens",
      icon: Hash,
      value: fmt(view.current.tokens),
      delta: view.deltas.tokens,
      series: view.tokensSeries,
      lowerIsBetter: false,
    },
    {
      label: "Spend",
      icon: Coins,
      value: `$${view.current.cost.toFixed(2)}`,
      delta: view.deltas.cost,
      series: view.costSeries,
      lowerIsBetter: false,
    },
    {
      label: "Requests",
      icon: Activity,
      value: view.current.count.toLocaleString(),
      delta: view.deltas.count,
      series: view.requestSeries,
      lowerIsBetter: false,
    },
    {
      label: "Avg latency",
      icon: Gauge,
      value: `${(view.avgLatency / 1000).toFixed(2)}s`,
      delta: view.deltas.latency,
      series: view.requestSeries,
      lowerIsBetter: true,
    },
  ];

  const [insightIndex, setInsightIndex] = useState(0);
  const maxBoardCost = Math.max(...view.board.map((b) => b.cost), 0.0001);

  if (runs.length === 0) {
    return (
      <div className="px-4 py-8 md:px-8">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <div className="mt-6 rounded-2xl border border-border/70 bg-[hsl(var(--app-panel))] p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No model runs in the last 16 weeks yet. Start a conversation and
            this page fills itself in — tokens, spend, latency, and a model
            leaderboard, all live from your own usage.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <span className="text-xs text-muted-foreground">
          live from model_runs
        </span>
        <div
          className="ml-auto inline-flex overflow-hidden rounded-lg border border-border/70"
          role="group"
          aria-label="Time range"
        >
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={range === d}
              onClick={() => setRange(d)}
              className={cn(
                "px-3 py-1.5 text-xs transition",
                range === d
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted/40",
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const good =
            kpi.delta === null
              ? null
              : kpi.lowerIsBetter
                ? kpi.delta <= 0
                : kpi.delta >= 0;
          return (
            <div
              key={kpi.label}
              className="rounded-2xl border border-border/70 bg-[hsl(var(--app-panel))] p-4"
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <kpi.icon className="h-3.5 w-3.5" />
                {kpi.label}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-semibold tabular-nums">
                  {kpi.value}
                </span>
                {kpi.delta !== null && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                      good
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-red-500/10 text-red-500",
                    )}
                  >
                    {kpi.delta >= 0 ? "+" : ""}
                    {kpi.delta}%
                  </span>
                )}
              </div>
              <div className="mt-2 text-primary">
                <Sparkline
                  values={kpi.series.slice(-14)}
                  color="hsl(var(--primary))"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border/70 bg-[hsl(var(--app-panel))] p-4">
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="text-sm font-medium">Tokens per day</h2>
          <span className="text-[11px] text-muted-foreground">
            {fmt(view.current.tokens)} total
          </span>
        </div>
        <AreaChart days={view.days} values={view.tokensSeries} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-[hsl(var(--app-panel))] p-4">
          <h2 className="mb-3 text-sm font-medium">Cost share by provider</h2>
          {view.donut.length > 0 ? (
            <Donut segments={view.donut} />
          ) : (
            <p className="text-xs text-muted-foreground">
              No cost data in this range.
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-border/70 bg-[hsl(var(--app-panel))] p-4">
          <h2 className="mb-3 text-sm font-medium">
            Model leaderboard{" "}
            <span className="text-[11px] font-normal text-muted-foreground">
              by spend
            </span>
          </h2>
          <div className="space-y-3">
            {view.board.map((entry, index) => (
              <div key={entry.model}>
                <div className="mb-1 flex items-baseline gap-2 text-xs">
                  <span className="font-medium">{entry.model}</span>
                  {index === 0 && (
                    <Crown className="h-3.5 w-3.5 self-center text-amber-500" />
                  )}
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {entry.count.toLocaleString()} runs · $
                    {entry.cost.toFixed(2)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full bg-primary transition-transform duration-500"
                    style={{
                      transform: `scaleX(${(entry.cost / maxBoardCost).toFixed(3)})`,
                      transformOrigin: "left",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-[hsl(var(--app-panel))] p-4">
        <div className="mb-3 flex items-baseline gap-2">
          <h2 className="text-sm font-medium">Activity</h2>
          <span className="text-[11px] text-muted-foreground">
            last 16 weeks · every square is a day
          </span>
        </div>
        <div
          className="grid grid-flow-col gap-[3px]"
          style={{ gridTemplateRows: "repeat(7, 10px)" }}
          aria-hidden="true"
        >
          {Array.from({ length: heatmap.offset }).map((_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {heatmap.days.map((day, i) => {
            const intensity = heatmap.counts[i] / heatmap.max;
            const isToday = i === heatmap.days.length - 1;
            return (
              <span
                key={day}
                title={`${day} · ${heatmap.counts[i]} runs`}
                className={cn(
                  "h-[10px] w-[10px] rounded-[2px]",
                  isToday &&
                    "ring-1 ring-primary ring-offset-1 ring-offset-background",
                )}
                style={{
                  backgroundColor:
                    intensity === 0
                      ? "hsl(var(--muted) / 0.4)"
                      : `hsl(var(--primary) / ${(0.2 + intensity * 0.8).toFixed(2)})`,
                }}
              />
            );
          })}
        </div>
        <p className="sr-only">
          Activity heatmap of daily run counts for the last 16 weeks.
        </p>
      </div>

      {view.insights.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <Lightbulb className="h-4 w-4 shrink-0 text-amber-500" />
          <span>{view.insights[insightIndex % view.insights.length]}</span>
          {view.insights.length > 1 && (
            <button
              type="button"
              onClick={() => setInsightIndex((v) => v + 1)}
              className="ml-auto rounded-md border border-border/70 px-2 py-1 transition hover:bg-muted/40"
            >
              Next
            </button>
          )}
        </div>
      )}
    </div>
  );
}
