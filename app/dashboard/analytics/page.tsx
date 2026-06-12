import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  AnalyticsDashboard,
  type AnalyticsRun,
} from "@/components/dashboard/AnalyticsDashboard";

export const dynamic = "force-dynamic";

/** 16 weeks: covers the 90-day range selector plus the activity heatmap. */
const WINDOW_DAYS = 112;
/** Safety cap so a heavy account can't drag the whole page down. */
const MAX_ROWS = 8000;

export default async function DashboardAnalyticsPage() {
  let runs: AnalyticsRun[] = [];

  try {
    const supabase = await createSupabaseServerClient();
    const since = new Date(
      Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // RLS scopes model_runs to the signed-in user via conversation
    // ownership — no explicit user filter needed here.
    const { data, error } = await supabase
      .from("model_runs")
      .select(
        "created_at,total_tokens,output_tokens,cost_usd,latency_ms,model,provider,rating,status",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(MAX_ROWS);

    if (error) throw error;
    runs = (data ?? []) as AnalyticsRun[];
  } catch (error) {
    console.error("[DashboardAnalyticsPage] failed to load runs", error);
  }

  return <AnalyticsDashboard runs={runs} />;
}
