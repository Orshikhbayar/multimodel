/**
 * Server-side usage tracking utilities
 * 
 * These functions are used by API routes where we already have the userId
 * from the authenticated session. They don't need to call auth() again.
 */

import prisma from "@/lib/db";

// ============================================
// Model Pricing (per 1K tokens)
// ============================================

interface ModelPricing {
  promptPer1k: number;
  completionPer1k: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // GPT-4o
  "gpt-4o": { promptPer1k: 0.0025, completionPer1k: 0.01 },
  "gpt-4o-mini": { promptPer1k: 0.00015, completionPer1k: 0.0006 },
  // GPT-4.1 series (estimate based on GPT-4 turbo pricing)
  "gpt-4.1": { promptPer1k: 0.01, completionPer1k: 0.03 },
  // Default fallback
  default: { promptPer1k: 0.00015, completionPer1k: 0.0006 },
};

/**
 * Calculate cost based on model-specific pricing
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING.default;
  return (
    (promptTokens / 1000) * pricing.promptPer1k +
    (completionTokens / 1000) * pricing.completionPer1k
  );
}

// ============================================
// Quota Configuration
// ============================================

export interface QuotaConfig {
  dailyTokenLimit: number;
}

// Plan-based quota limits
const PLAN_QUOTAS: Record<string, QuotaConfig> = {
  free: { dailyTokenLimit: 100_000 }, // 100k tokens/day
  plus: { dailyTokenLimit: 500_000 }, // 500k tokens/day
  pro: { dailyTokenLimit: 2_000_000 }, // 2M tokens/day
  team: { dailyTokenLimit: 10_000_000 }, // 10M tokens/day
};

export function getQuotaConfig(planId: string = "free"): QuotaConfig {
  return PLAN_QUOTAS[planId] ?? PLAN_QUOTAS.free;
}

// ============================================
// Quota Check (for API routes)
// ============================================

export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
  resetAt: Date;
}

/**
 * Check if user has quota remaining
 * Used by API routes where userId is already known
 */
export async function checkUserQuota(
  userId: string,
  planId: string = "free",
): Promise<QuotaCheckResult> {
  const config = getQuotaConfig(planId);

  // Get today's boundaries
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  try {
    const todayUsage = await prisma.usageRecord.aggregate({
      where: {
        userId,
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
      _sum: {
        totalTokens: true,
      },
    });

    const used = todayUsage._sum.totalTokens ?? 0;
    const remaining = Math.max(0, config.dailyTokenLimit - used);

    return {
      allowed: remaining > 0,
      remaining,
      limit: config.dailyTokenLimit,
      used,
      resetAt: tomorrow,
    };
  } catch (error) {
    // If DB is not configured, allow requests (development mode)
    console.warn("[Usage] Database not available, allowing request:", error);
    return {
      allowed: true,
      remaining: config.dailyTokenLimit,
      limit: config.dailyTokenLimit,
      used: 0,
      resetAt: tomorrow,
    };
  }
}

// ============================================
// Usage Recording (for API routes)
// ============================================

export interface RecordUsageParams {
  userId: string;
  runId?: string;
  model: string;
  provider?: string;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Record usage for a completed API call
 * Used by API routes where userId is already known
 */
export async function recordUserUsage(params: RecordUsageParams): Promise<void> {
  const {
    userId,
    runId,
    model,
    provider = "openai",
    promptTokens,
    completionTokens,
  } = params;

  const totalTokens = promptTokens + completionTokens;
  const estimatedCostUsd = calculateCost(model, promptTokens, completionTokens);

  try {
    await prisma.usageRecord.create({
      data: {
        userId,
        runId: runId ?? null,
        model,
        provider,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd,
      },
    });

    if (process.env.NODE_ENV === "development") {
      console.log(`[Usage] Recorded:`, {
        userId,
        model,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: `$${estimatedCostUsd.toFixed(6)}`,
      });
    }
  } catch (error) {
    // Log but don't fail the request if recording fails
    console.error("[Usage] Failed to record usage:", error);
  }
}
