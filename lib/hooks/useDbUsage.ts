"use client";

import { useEffect, useState, useCallback } from "react";
import { getUsageSummary, checkQuota, type UsageSummary } from "@/lib/actions/usage";

/**
 * Hook to fetch and track usage data from the database
 * Updates the local usage store with real data from DB
 */
export function useDbUsage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [quota, setQuota] = useState<{
    allowed: boolean;
    remaining: number;
    limit: number;
    used: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [summaryData, quotaData] = await Promise.all([
        getUsageSummary(),
        checkQuota(),
      ]);
      
      setSummary(summaryData);
      setQuota(quotaData);
    } catch (err) {
      console.error("[useDbUsage] Failed to fetch usage:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch usage data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    summary,
    quota,
    loading,
    error,
    refresh,
  };
}

/**
 * Quota status component data
 */
export interface QuotaStatus {
  percentUsed: number;
  remaining: number;
  limit: number;
  used: number;
  isNearLimit: boolean;
  isOverLimit: boolean;
}

export function getQuotaStatus(quota: {
  remaining: number;
  limit: number;
  used: number;
} | null): QuotaStatus {
  if (!quota) {
    return {
      percentUsed: 0,
      remaining: 0,
      limit: 0,
      used: 0,
      isNearLimit: false,
      isOverLimit: false,
    };
  }

  const percentUsed = quota.limit > 0 ? (quota.used / quota.limit) * 100 : 0;

  return {
    percentUsed,
    remaining: quota.remaining,
    limit: quota.limit,
    used: quota.used,
    isNearLimit: percentUsed >= 80,
    isOverLimit: percentUsed >= 100,
  };
}
