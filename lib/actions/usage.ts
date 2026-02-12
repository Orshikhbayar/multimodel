"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  checkQuota as checkBillingQuota,
  ensureBillingUser,
  resetPeriodIfNeeded,
} from "@/lib/billing/service";

// ============================================
// Usage Record Types
// ============================================

export interface UsageSummary {
  totalTokens: number;
  totalCostUsd: number;
  periodStart: Date;
  periodEnd: Date;
  byModel: Record<
    string,
    {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costUsd: number;
      requestCount: number;
    }
  >;
  dailyUsage: Array<{
    date: string;
    tokens: number;
    costUsd: number;
  }>;
}

export interface UsageRecord {
  id: string;
  model: string;
  provider: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  createdAt: Date;
}

// ============================================
// Usage Actions
// ============================================

/**
 * Get usage records for the current user
 */
export async function getUsageRecords(
  options: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  } = {},
): Promise<UsageRecord[]> {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
  }

  const { limit = 100, offset = 0, startDate, endDate } = options;

  const records = await prisma.usageRecord.findMany({
    where: {
      userId: session.user.id,
      createdAt: {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  return records;
}

/**
 * Get usage summary for the current billing period
 */
export async function getUsageSummary(
  periodStart?: Date,
  periodEnd?: Date,
): Promise<UsageSummary | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  // Default to current month
  const now = new Date();
  const start = periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const end = periodEnd ?? new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const records = await prisma.usageRecord.findMany({
    where: {
      userId: session.user.id,
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Calculate totals and breakdowns
  let totalTokens = 0;
  let totalCostUsd = 0;
  const byModel: UsageSummary["byModel"] = {};
  const dailyMap: Record<string, { tokens: number; costUsd: number }> = {};

  for (const record of records) {
    totalTokens += record.totalTokens;
    totalCostUsd += record.estimatedCostUsd;

    // By model breakdown
    if (!byModel[record.model]) {
      byModel[record.model] = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        requestCount: 0,
      };
    }
    byModel[record.model].promptTokens += record.promptTokens;
    byModel[record.model].completionTokens += record.completionTokens;
    byModel[record.model].totalTokens += record.totalTokens;
    byModel[record.model].costUsd += record.estimatedCostUsd;
    byModel[record.model].requestCount += 1;

    // Daily breakdown
    const dateKey = record.createdAt.toISOString().split("T")[0];
    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = { tokens: 0, costUsd: 0 };
    }
    dailyMap[dateKey].tokens += record.totalTokens;
    dailyMap[dateKey].costUsd += record.estimatedCostUsd;
  }

  const dailyUsage = Object.entries(dailyMap).map(([date, data]) => ({
    date,
    tokens: data.tokens,
    costUsd: data.costUsd,
  }));

  return {
    totalTokens,
    totalCostUsd,
    periodStart: start,
    periodEnd: end,
    byModel,
    dailyUsage,
  };
}

/**
 * Check if user has exceeded their quota
 * Returns remaining tokens (negative if over quota)
 */
export async function checkQuota(): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { allowed: false, remaining: 0, limit: 0, used: 0 };
  }

  const user = await ensureBillingUser({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  const refreshed = await resetPeriodIfNeeded(user.id);
  const quota = await checkBillingQuota(refreshed.id, refreshed.planId);

  return {
    allowed: quota.allowed,
    remaining: quota.daily.remaining,
    limit: quota.daily.limit,
    used: quota.daily.used,
  };
}

/**
 * Record usage for a completed run
 */
export async function recordUsage(data: {
  runId?: string;
  model: string;
  provider?: string;
  promptTokens: number;
  completionTokens: number;
}): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  const totalTokens = data.promptTokens + data.completionTokens;

  // Estimate cost based on model (simplified - should use model-specific pricing)
  const estimatedCostUsd =
    data.promptTokens * 0.00003 + data.completionTokens * 0.00006;

  await prisma.usageRecord.create({
    data: {
      userId: session.user.id,
      runId: data.runId ?? null,
      model: data.model,
      provider: data.provider ?? null,
      promptTokens: data.promptTokens,
      completionTokens: data.completionTokens,
      totalTokens,
      estimatedCostUsd,
    },
  });

  return true;
}
