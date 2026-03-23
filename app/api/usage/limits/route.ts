import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlanById } from "@/lib/billing/plans";
import { RATE_LIMIT_CONFIG } from "@/lib/rateLimit";
import type { PlanId } from "@/lib/billing/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/usage/limits
 *
 * Returns the authenticated user's current usage vs their plan limits.
 * Powers the dashboard "Limits" page (Claude-style progress bars).
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const userId = claims.sub;

  try {
    // 1. Get user profile to determine plan
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan_id, included_credits_cents, bonus_credits_cents, top_up_credits_cents, period_start_at, period_end_at")
      .eq("id", userId)
      .maybeSingle();

    const planId: PlanId = profile?.plan_id
      ? (["free", "plus", "pro", "team"].includes(profile.plan_id) ? profile.plan_id as PlanId : "free")
      : "free";
    const plan = getPlanById(planId);

    // 2. Get today's token usage
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);

    const { data: todayRuns } = await supabase
      .from("model_runs")
      .select("input_tokens, output_tokens, cost_usd, created_at")
      .gte("created_at", dayStart.toISOString())
      .lte("created_at", now.toISOString());

    const dailyTokensUsed = (todayRuns ?? []).reduce(
      (sum, r) => sum + (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
      0,
    );
    const dailyRequestCount = todayRuns?.length ?? 0;
    const dailyCostUsd = (todayRuns ?? []).reduce(
      (sum, r) => sum + Number(r.cost_usd ?? 0),
      0,
    );

    // 3. Get this month's (or billing period) token usage
    const periodStart = profile?.period_start_at
      ? new Date(profile.period_start_at)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = profile?.period_end_at
      ? new Date(profile.period_end_at)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const { data: monthRuns } = await supabase
      .from("model_runs")
      .select("input_tokens, output_tokens, cost_usd")
      .gte("created_at", periodStart.toISOString())
      .lte("created_at", now.toISOString());

    const monthlyTokensUsed = (monthRuns ?? []).reduce(
      (sum, r) => sum + (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
      0,
    );
    const monthlyRequestCount = monthRuns?.length ?? 0;
    const monthlyCostUsd = (monthRuns ?? []).reduce(
      (sum, r) => sum + Number(r.cost_usd ?? 0),
      0,
    );

    // 4. Get last 7 days usage for weekly view
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);

    const { data: weekRuns } = await supabase
      .from("model_runs")
      .select("input_tokens, output_tokens, cost_usd")
      .gte("created_at", weekStart.toISOString())
      .lte("created_at", now.toISOString());

    const weeklyTokensUsed = (weekRuns ?? []).reduce(
      (sum, r) => sum + (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
      0,
    );
    const weeklyRequestCount = weekRuns?.length ?? 0;
    const weeklyCostUsd = (weekRuns ?? []).reduce(
      (sum, r) => sum + Number(r.cost_usd ?? 0),
      0,
    );

    // 5. Credits
    const includedCredits = (profile?.included_credits_cents ?? 0) / 100;
    const bonusCredits = (profile?.bonus_credits_cents ?? 0) / 100;
    const topUpCredits = (profile?.top_up_credits_cents ?? 0) / 100;
    const totalCredits = includedCredits + bonusCredits + topUpCredits;

    // 6. Build response
    return NextResponse.json({
      plan: {
        id: planId,
        name: plan.name,
        dailyTokenCap: plan.dailyTokenCap,
        monthlyTokenCap: plan.monthlyTokenCap,
        maxEnabledModels: plan.maxEnabledModels,
        includedMonthlyCreditsUsd: plan.includedMonthlyCredits.USD,
      },
      daily: {
        tokensUsed: dailyTokensUsed,
        tokenLimit: plan.dailyTokenCap,
        requestCount: dailyRequestCount,
        costUsd: Number(dailyCostUsd.toFixed(4)),
        percentUsed: plan.dailyTokenCap > 0
          ? Math.min(100, Math.round((dailyTokensUsed / plan.dailyTokenCap) * 100))
          : 0,
        resetsAt: new Date(dayStart.getTime() + 86_400_000).toISOString(),
      },
      weekly: {
        tokensUsed: weeklyTokensUsed,
        requestCount: weeklyRequestCount,
        costUsd: Number(weeklyCostUsd.toFixed(4)),
        // Weekly soft limit = daily cap * 7 (informational, not enforced)
        tokenLimit: plan.dailyTokenCap > 0 ? plan.dailyTokenCap * 7 : 0,
        percentUsed: plan.dailyTokenCap > 0
          ? Math.min(100, Math.round((weeklyTokensUsed / (plan.dailyTokenCap * 7)) * 100))
          : 0,
      },
      monthly: {
        tokensUsed: monthlyTokensUsed,
        tokenLimit: plan.monthlyTokenCap,
        requestCount: monthlyRequestCount,
        costUsd: Number(monthlyCostUsd.toFixed(4)),
        percentUsed: plan.monthlyTokenCap > 0
          ? Math.min(100, Math.round((monthlyTokensUsed / plan.monthlyTokenCap) * 100))
          : 0,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      },
      credits: {
        included: Number(includedCredits.toFixed(2)),
        bonus: Number(bonusCredits.toFixed(2)),
        topUp: Number(topUpCredits.toFixed(2)),
        total: Number(totalCredits.toFixed(2)),
        usedThisPeriod: Number(monthlyCostUsd.toFixed(4)),
        remainingEstimate: Number(Math.max(0, totalCredits - monthlyCostUsd).toFixed(2)),
        percentUsed: totalCredits > 0
          ? Math.min(100, Math.round((monthlyCostUsd / totalCredits) * 100))
          : 0,
      },
      rateLimits: {
        requestsPerMinute: RATE_LIMIT_CONFIG.maxRequests,
        windowSeconds: RATE_LIMIT_CONFIG.windowSizeSeconds,
        maxConcurrentStreams: RATE_LIMIT_CONFIG.maxConcurrentStreams,
      },
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("[/api/usage/limits] Error fetching limits:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage limits" },
      { status: 500 },
    );
  }
}
