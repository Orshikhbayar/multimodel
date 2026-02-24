/**
 * Usage tracking store for API costs and metrics
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface UsageRecord {
  id: string;
  timestamp: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
}

interface UsageState {
  // Records for the current period
  records: UsageRecord[];
  // Aggregated totals
  totalMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  // Period tracking
  periodStart: number;

  // Actions
  addRecord: (record: Omit<UsageRecord, "id">) => void;
  resetPeriod: () => void;
  getModelBreakdown: () => Record<
    string,
    { count: number; cost: number; tokens: number }
  >;
}

const STORAGE_VERSION = 1;

type PersistedUsageState = Pick<
  UsageState,
  | "records"
  | "totalMessages"
  | "totalInputTokens"
  | "totalOutputTokens"
  | "totalCostUsd"
  | "periodStart"
>;

const createInitialPersistedUsageState = (): PersistedUsageState => ({
  records: [],
  totalMessages: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCostUsd: 0,
  periodStart: Date.now(),
});

export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      records: [],
      totalMessages: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      periodStart: Date.now(),

      addRecord: (record) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const fullRecord: UsageRecord = { ...record, id };

        set((state) => ({
          records: [...state.records, fullRecord],
          totalMessages: state.totalMessages + 1,
          totalInputTokens: state.totalInputTokens + record.inputTokens,
          totalOutputTokens: state.totalOutputTokens + record.outputTokens,
          totalCostUsd: state.totalCostUsd + record.estimatedCostUsd,
        }));
      },

      resetPeriod: () => {
        set({
          records: [],
          totalMessages: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCostUsd: 0,
          periodStart: Date.now(),
        });
      },

      getModelBreakdown: () => {
        const { records } = get();
        const breakdown: Record<
          string,
          { count: number; cost: number; tokens: number }
        > = {};

        for (const record of records) {
          if (!breakdown[record.model]) {
            breakdown[record.model] = { count: 0, cost: 0, tokens: 0 };
          }
          breakdown[record.model].count++;
          breakdown[record.model].cost += record.estimatedCostUsd;
          breakdown[record.model].tokens +=
            record.inputTokens + record.outputTokens;
        }

        return breakdown;
      },
    }),
    {
      name: "multi-model-usage",
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState) => {
        const fallback = createInitialPersistedUsageState();
        const state = persistedState as Partial<PersistedUsageState> | undefined;
        const records = Array.isArray(state?.records)
          ? state.records.slice(-100)
          : fallback.records;

        return {
          records,
          totalMessages:
            typeof state?.totalMessages === "number"
              ? state.totalMessages
              : fallback.totalMessages,
          totalInputTokens:
            typeof state?.totalInputTokens === "number"
              ? state.totalInputTokens
              : fallback.totalInputTokens,
          totalOutputTokens:
            typeof state?.totalOutputTokens === "number"
              ? state.totalOutputTokens
              : fallback.totalOutputTokens,
          totalCostUsd:
            typeof state?.totalCostUsd === "number"
              ? state.totalCostUsd
              : fallback.totalCostUsd,
          periodStart:
            typeof state?.periodStart === "number"
              ? state.periodStart
              : fallback.periodStart,
        };
      },
      partialize: (state) => ({
        records: state.records.slice(-100), // Keep last 100 records
        totalMessages: state.totalMessages,
        totalInputTokens: state.totalInputTokens,
        totalOutputTokens: state.totalOutputTokens,
        totalCostUsd: state.totalCostUsd,
        periodStart: state.periodStart,
      }),
    },
  ),
);
