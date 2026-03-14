import { getUsageRecords, getUsageSummary } from "@/lib/actions/usage";

export const dynamic = "force-dynamic";
import {
  DashboardUsage,
  type DashboardUsageSnapshot,
} from "@/components/dashboard/DashboardUsage";

export default async function DashboardUsagePage() {
  let snapshot: DashboardUsageSnapshot = null;

  try {
    const [summary, runs] = await Promise.all([
      getUsageSummary(),
      getUsageRecords({ limit: 50 }),
    ]);

    if (summary) {
      snapshot = {
        totalTokens: summary.totalTokens,
        totalCostUsd: summary.totalCostUsd,
        modelRunCount: runs.length,
        periodStartISO: summary.periodStart.toISOString(),
        periodEndISO: summary.periodEnd.toISOString(),
      };
    }
  } catch (error) {
    console.error("[DashboardUsagePage] failed to load server snapshot", error);
  }

  return <DashboardUsage snapshot={snapshot} />;
}
