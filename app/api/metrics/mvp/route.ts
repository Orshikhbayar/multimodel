/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const FUNNEL_STEPS = [
  "onboarding_started",
  "workflow_pack_selected",
  "guided_input_completed",
  "first_output_generated",
  "asset_saved",
] as const;

const RETENTION_ACTIVITY_EVENTS = [
  "template_applied",
  "asset_saved",
  "autopilot_run_succeeded",
];

export async function GET(request: NextRequest) {
  const requestId = nanoid(10);
  const supabase = await createSupabaseServerClient();
  const db = supabase as any;
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return json({ error: "Authentication required", requestId }, 401);
  }

  const workspaceId = request.nextUrl.searchParams.get("workspace_id");
  const days = Math.min(
    90,
    Math.max(
      7,
      Number.parseInt(request.nextUrl.searchParams.get("days") ?? "30", 10),
    ),
  );

  if (!workspaceId) {
    return json({ error: "workspace_id is required", requestId }, 400);
  }

  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sinceIso = sinceDate.toISOString();

  const { data: events, error: eventsError } = await db
    .from("product_events")
    .select("event_name,properties,occurred_at")
    .eq("workspace_id", workspaceId)
    .gte("occurred_at", sinceIso)
    .order("occurred_at", { ascending: true });

  if (eventsError) {
    return json({ error: eventsError.message, requestId }, 500);
  }

  const eventsList = events ?? [];
  const eventCountByName = new Map<string, number>();
  for (const row of eventsList) {
    eventCountByName.set(
      row.event_name,
      (eventCountByName.get(row.event_name) ?? 0) + 1,
    );
  }

  let prev = 0;
  const funnel = FUNNEL_STEPS.map((step, index) => {
    const count = eventCountByName.get(step) ?? 0;
    const conversionFromPrev =
      index === 0 || prev === 0
        ? null
        : Number(((count / prev) * 100).toFixed(1));
    prev = count;
    return { step, count, conversion_from_prev_pct: conversionFromPrev };
  });

  const { data: runs, error: runError } = await db
    .from("autopilot_runs")
    .select("status,started_at,finished_at,created_at")
    .eq("workspace_id", workspaceId)
    .gte("created_at", sinceIso);

  if (runError) {
    return json({ error: runError.message, requestId }, 500);
  }

  const runList = runs ?? [];
  const totalRuns = runList.length;
  const succeededRuns = runList.filter(
    (row: any) => row.status === "succeeded",
  ).length;
  const failedRuns = runList.filter(
    (row: any) => row.status === "failed",
  ).length;
  const runningRuns = runList.filter(
    (row: any) => row.status === "running",
  ).length;
  const queuedRuns = runList.filter(
    (row: any) => row.status === "queued",
  ).length;
  const deduplicatedRuns =
    eventCountByName.get("autopilot_run_deduplicated") ?? 0;

  const onTimeSucceededRuns = runList.filter((row: any) => {
    if (row.status !== "succeeded" || !row.started_at || !row.finished_at)
      return false;
    const durationMs =
      new Date(row.finished_at).getTime() - new Date(row.started_at).getTime();
    return durationMs <= 15 * 60 * 1000;
  }).length;

  const successRate =
    totalRuns === 0
      ? 0
      : Number(((succeededRuns / totalRuns) * 100).toFixed(1));
  const onTimeRate =
    succeededRuns === 0
      ? 0
      : Number(((onTimeSucceededRuns / succeededRuns) * 100).toFixed(1));

  const sevenDaysAgoIso = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const recentActivityCount = eventsList.filter(
    (row: any) =>
      RETENTION_ACTIVITY_EVENTS.includes(row.event_name) &&
      row.occurred_at >= sevenDaysAgoIso,
  ).length;

  const templateApplied = eventCountByName.get("template_applied") ?? 0;
  const templateCreated = eventCountByName.get("template_created") ?? 0;
  const templateUpdated = eventCountByName.get("template_updated") ?? 0;
  const assetSaved = eventCountByName.get("asset_saved") ?? 0;
  const templateReuseRate =
    templateCreated === 0
      ? 0
      : Number(((templateApplied / templateCreated) * 100).toFixed(1));

  return json({
    requestId,
    window_days: days,
    since: sinceIso,
    funnel,
    templates: {
      created: templateCreated,
      updated: templateUpdated,
      applied: templateApplied,
      assets_saved: assetSaved,
      reuse_rate_pct: templateReuseRate,
    },
    autopilot: {
      total_runs: totalRuns,
      succeeded: succeededRuns,
      failed: failedRuns,
      queued: queuedRuns,
      running: runningRuns,
      deduplicated: deduplicatedRuns,
      success_rate_pct: successRate,
      on_time_success_rate_pct: onTimeRate,
    },
    retention: {
      active_last_7_days: recentActivityCount > 0,
      activity_events_last_7_days: recentActivityCount,
    },
  });
}
