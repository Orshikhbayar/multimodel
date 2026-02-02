import { nanoid } from "nanoid";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type {
  BillingCadence,
  BillingState,
  BillingTransaction,
  Currency,
  PlanId,
} from "./types";
import { getPlanById } from "./plans";
import { addMonths, convertCurrency, getIncludedCredits, getPlanPrice, toISO } from "./utils";

const buildPeriod = () => {
  const start = new Date();
  const end = addMonths(start, 1);
  return { startISO: toISO(start), endISO: toISO(end) };
};

const initialPlanId: PlanId = "free";
const initialCurrency: Currency = "USD";
const initialPlan = getPlanById(initialPlanId);
const initialCredits = getIncludedCredits(initialPlan, initialCurrency);
const initialPeriod = buildPeriod();

interface BillingUIState {
  upgradeModalOpen: boolean;
  upgradeReason?: string;
  requiredPlanId?: PlanId;
  lockedModelId?: string;
  outOfCreditsOpen: boolean;
  topUpModalOpen: boolean;
}

interface BillingStore extends BillingState {
  ui: BillingUIState;
  setCurrency: (currency: Currency) => void;
  setBillingCadence: (cadence: BillingCadence) => void;
  choosePlan: (planId: PlanId) => void;
  topUp: (amount: number, currency: Currency) => void;
  spendCredits: (cost: number, note?: string) => boolean;
  resetPeriodIfNeeded: () => void;
  resetBilling: () => void;
  openUpgradeModal: (payload: {
    reason: string;
    requiredPlanId?: PlanId;
    lockedModelId?: string;
  }) => void;
  closeUpgradeModal: () => void;
  openTopUpModal: () => void;
  closeTopUpModal: () => void;
  openOutOfCreditsModal: () => void;
  closeOutOfCreditsModal: () => void;
}

const initialTransactions: BillingTransaction[] = [
  {
    id: nanoid(),
    type: "subscription",
    amount: 0,
    currency: initialCurrency,
    createdAtISO: new Date().toISOString(),
    note: "Free plan activated",
  },
];

export const useBillingStore = create<BillingStore>()(
  persist(
    (set, get) => ({
      currency: initialCurrency,
      billingCadence: "monthly",
      currentPlanId: initialPlanId,
      periodStartISO: initialPeriod.startISO,
      periodEndISO: initialPeriod.endISO,
      includedCreditsRemaining: initialCredits,
      topUpCreditsBalance: 0,
      transactions: initialTransactions,
      ui: {
        upgradeModalOpen: false,
        outOfCreditsOpen: false,
        topUpModalOpen: false,
      },

      setCurrency: (currency) =>
        set((state) => {
          if (state.currency === currency) return {};
          const includedCreditsRemaining = convertCurrency(
            state.includedCreditsRemaining,
            state.currency,
            currency,
          );
          const topUpCreditsBalance = convertCurrency(
            state.topUpCreditsBalance,
            state.currency,
            currency,
          );
          return { currency, includedCreditsRemaining, topUpCreditsBalance };
        }),

      setBillingCadence: (billingCadence) => set({ billingCadence }),

      choosePlan: (planId) =>
        set((state) => {
          const plan = getPlanById(planId);
          const period = buildPeriod();
          const amount = getPlanPrice(plan, state.currency, state.billingCadence);
          const transaction: BillingTransaction = {
            id: nanoid(),
            type: "subscription",
            amount,
            currency: state.currency,
            createdAtISO: new Date().toISOString(),
            note: `${plan.name} ${state.billingCadence}`,
          };
          return {
            currentPlanId: planId,
            periodStartISO: period.startISO,
            periodEndISO: period.endISO,
            includedCreditsRemaining: getIncludedCredits(plan, state.currency),
            transactions: [transaction, ...state.transactions],
          };
        }),

      topUp: (amount, currency) =>
        set((state) => {
          const converted =
            currency === state.currency
              ? amount
              : convertCurrency(amount, currency, state.currency);
          const transaction: BillingTransaction = {
            id: nanoid(),
            type: "topup",
            amount: converted,
            currency: state.currency,
            createdAtISO: new Date().toISOString(),
            note: currency === state.currency ? "Top up" : `Converted from ${currency}`,
          };
          return {
            topUpCreditsBalance: state.topUpCreditsBalance + converted,
            transactions: [transaction, ...state.transactions],
          };
        }),

      spendCredits: (cost, note) => {
        const state = get();
        const totalAvailable = state.includedCreditsRemaining + state.topUpCreditsBalance;
        if (cost <= 0) return true;
        if (totalAvailable < cost) {
          set({ ui: { ...state.ui, outOfCreditsOpen: true } });
          return false;
        }
        const usedIncluded = Math.min(state.includedCreditsRemaining, cost);
        const remainingCost = cost - usedIncluded;
        const usedTopUp = Math.min(state.topUpCreditsBalance, remainingCost);

        const transaction: BillingTransaction = {
          id: nanoid(),
          type: "usage",
          amount: cost,
          currency: state.currency,
          createdAtISO: new Date().toISOString(),
          note,
        };

        set({
          includedCreditsRemaining: state.includedCreditsRemaining - usedIncluded,
          topUpCreditsBalance: state.topUpCreditsBalance - usedTopUp,
          transactions: [transaction, ...state.transactions],
        });

        return true;
      },

      resetPeriodIfNeeded: () =>
        set((state) => {
          const now = new Date();
          const periodEnd = new Date(state.periodEndISO);
          const plan = getPlanById(state.currentPlanId);
          if (Number.isNaN(periodEnd.getTime())) {
            const period = buildPeriod();
            return {
              periodStartISO: period.startISO,
              periodEndISO: period.endISO,
              includedCreditsRemaining: getIncludedCredits(plan, state.currency),
            };
          }
          if (now <= periodEnd) {
            return {};
          }
          const period = buildPeriod();
          return {
            periodStartISO: period.startISO,
            periodEndISO: period.endISO,
            includedCreditsRemaining: getIncludedCredits(plan, state.currency),
          };
        }),

      resetBilling: () =>
        set(() => {
          const period = buildPeriod();
          return {
            currency: initialCurrency,
            billingCadence: "monthly",
            currentPlanId: initialPlanId,
            periodStartISO: period.startISO,
            periodEndISO: period.endISO,
            includedCreditsRemaining: initialCredits,
            topUpCreditsBalance: 0,
            transactions: initialTransactions,
            ui: {
              upgradeModalOpen: false,
              outOfCreditsOpen: false,
              topUpModalOpen: false,
            },
          };
        }),

      openUpgradeModal: ({ reason, requiredPlanId, lockedModelId }) =>
        set((state) => ({
          ui: {
            ...state.ui,
            upgradeModalOpen: true,
            upgradeReason: reason,
            requiredPlanId,
            lockedModelId,
          },
        })),
      closeUpgradeModal: () =>
        set((state) => ({
          ui: {
            ...state.ui,
            upgradeModalOpen: false,
            upgradeReason: undefined,
            requiredPlanId: undefined,
            lockedModelId: undefined,
          },
        })),
      openTopUpModal: () =>
        set((state) => ({ ui: { ...state.ui, topUpModalOpen: true } })),
      closeTopUpModal: () =>
        set((state) => ({ ui: { ...state.ui, topUpModalOpen: false } })),
      openOutOfCreditsModal: () =>
        set((state) => ({ ui: { ...state.ui, outOfCreditsOpen: true } })),
      closeOutOfCreditsModal: () =>
        set((state) => ({ ui: { ...state.ui, outOfCreditsOpen: false } })),
    }),
    {
      name: "multi-model-billing",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currency: state.currency,
        billingCadence: state.billingCadence,
        currentPlanId: state.currentPlanId,
        periodStartISO: state.periodStartISO,
        periodEndISO: state.periodEndISO,
        includedCreditsRemaining: state.includedCreditsRemaining,
        topUpCreditsBalance: state.topUpCreditsBalance,
        transactions: state.transactions,
      }),
    },
  ),
);
