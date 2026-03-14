import { nanoid } from "nanoid";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  changePlan,
  getBillingSummary,
  getBillingTransactions,
  setBillingCurrency,
} from "@/lib/actions/billing";

import type {
  BillingCadence,
  BillingState,
  BillingTransaction,
  Currency,
  PlanId,
  TopUpPackId,
} from "./types";
import { getPlanById } from "./plans";
import {
  addMonths,
  convertCurrency,
  getUsdToMntRate,
  getIncludedCredits,
  setUsdToMntRate,
  toISO,
} from "./utils";

const STORAGE_VERSION = 2;
const SERVER_BILLING_DISABLED =
  process.env.NEXT_PUBLIC_DISABLE_SERVER_BILLING === "true";

let serverBillingSyncDisabled = SERVER_BILLING_DISABLED;

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
  hydrated: boolean;
  loading: boolean;
  fxRateUsdToMnt: number;
  fxRateUpdatedAtISO?: string;
  fxRateLive: boolean;
  error?: string;
  setCurrency: (currency: Currency) => Promise<void>;
  setBillingCadence: (cadence: BillingCadence) => void;
  choosePlan: (planId: PlanId) => Promise<void>;
  topUp: (packId: TopUpPackId) => Promise<void>;
  spendCredits: (cost: number, note?: string) => boolean;
  syncFromServer: () => Promise<void>;
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

type FxRateResponse = {
  usdToMnt: number;
  fetchedAtISO: string;
  source: string;
  live: boolean;
};

function shouldDisableServerBillingSync(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("billing_unavailable") ||
    message.includes("failed to provision billing user") ||
    message.includes("econnrefused")
  );
}

function toDisplay(usdAmount: number, currency: Currency) {
  if (currency === "USD") return Number(usdAmount.toFixed(2));
  return Math.round(convertCurrency(usdAmount, "USD", "MNT"));
}

function toStoreTransactions(
  source: Awaited<ReturnType<typeof getBillingTransactions>>,
  displayCurrency: Currency,
): BillingTransaction[] {
  return source.map((tx) => {
    const normalizedType: BillingTransaction["type"] =
      tx.type === "plan_change"
        ? "subscription"
        : tx.type === "topup"
          ? "topup"
          : "usage";

    const amountUsd =
      tx.currency === "USD"
        ? tx.amountPaid
        : convertCurrency(tx.amountPaid, "MNT", "USD");

    return {
      id: tx.id,
      type: normalizedType,
      amount: toDisplay(amountUsd, displayCurrency),
      currency: displayCurrency,
      createdAtISO: tx.createdAtISO,
      note: tx.note,
    };
  });
}

async function redirectToCheckout(url: string) {
  if (typeof window === "undefined") {
    throw new Error("Checkout redirect is only available in the browser");
  }

  window.location.assign(url);
}

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
      hydrated: false,
      loading: false,
      fxRateUsdToMnt: getUsdToMntRate(),
      fxRateUpdatedAtISO: undefined,
      fxRateLive: false,
      ui: {
        upgradeModalOpen: false,
        outOfCreditsOpen: false,
        topUpModalOpen: false,
      },

      syncFromServer: async () => {
        if (serverBillingSyncDisabled) {
          set({ loading: false, hydrated: true });
          return;
        }

        try {
          set({ loading: true, error: undefined });
          let fxRateUsdToMnt = getUsdToMntRate();
          let fxRateUpdatedAtISO: string | undefined;
          let fxRateLive = false;

          try {
            const response = await fetch("/api/billing/fx-rate", {
              method: "GET",
              cache: "no-store",
            });
            if (response.ok) {
              const fx = (await response.json()) as FxRateResponse;
              if (Number.isFinite(fx.usdToMnt) && fx.usdToMnt > 0) {
                setUsdToMntRate(fx.usdToMnt);
                fxRateUsdToMnt = fx.usdToMnt;
                fxRateUpdatedAtISO = fx.fetchedAtISO;
                fxRateLive = fx.live;
              }
            }
          } catch {
            // Keep cached rate if live FX fetch fails.
          }

          const [summary, txs] = await Promise.all([
            getBillingSummary(),
            getBillingTransactions({ limit: 100, offset: 0 }),
          ]);

          if (!summary) {
            set({ loading: false, hydrated: true });
            return;
          }

          const displayCurrency = get().currency;
          const includedUsd = summary.includedCreditsCents / 100;
          const topUpUsd = summary.topUpCreditsCents / 100;

          set((state) => ({
            currentPlanId: summary.currentPlanId,
            billingCadence: summary.billingCadence,
            periodStartISO: summary.periodStartISO,
            periodEndISO: summary.periodEndISO,
            includedCreditsRemaining: toDisplay(includedUsd, displayCurrency),
            topUpCreditsBalance: toDisplay(topUpUsd, displayCurrency),
            transactions: toStoreTransactions(txs, displayCurrency),
            hydrated: true,
            loading: false,
            fxRateUsdToMnt,
            fxRateUpdatedAtISO,
            fxRateLive,
            ui: state.ui,
          }));
        } catch (error) {
          if (shouldDisableServerBillingSync(error)) {
            serverBillingSyncDisabled = true;
            set({
              loading: false,
              hydrated: true,
              error: "Server billing sync disabled (Supabase mode)",
            });
            return;
          }

          set({
            loading: false,
            hydrated: true,
            error:
              error instanceof Error
                ? error.message
                : "Failed to sync billing state",
          });
        }
      },

      setCurrency: async (currency) => {
        set({ currency });
        try {
          await setBillingCurrency(currency);
        } catch {
          // Keep local display currency even if server update fails.
        }
        await get().syncFromServer();
      },

      setBillingCadence: (billingCadence) => set({ billingCadence }),

      choosePlan: async (planId) => {
        set({ loading: true, error: undefined });
        try {
          const cadence = get().billingCadence;

          if (planId === "free") {
            await changePlan({ planId, cadence });
            await get().syncFromServer();
            return;
          }

          const response = await fetch("/api/stripe/checkout/subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ planId, cadence }),
          });

          const payload = (await response.json().catch(() => null)) as {
            url?: string;
            error?: string;
          } | null;

          if (!response.ok || !payload?.url) {
            throw new Error(
              payload?.error || "Failed to create subscription checkout",
            );
          }

          await redirectToCheckout(payload.url);
        } catch (error) {
          set({
            loading: false,
            error:
              error instanceof Error ? error.message : "Failed to change plan",
          });
        }
      },

      topUp: async (packId) => {
        set({ loading: true, error: undefined });
        try {
          const response = await fetch("/api/stripe/checkout/topup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ packId }),
          });

          const payload = (await response.json().catch(() => null)) as {
            url?: string;
            error?: string;
          } | null;

          if (!response.ok || !payload?.url) {
            throw new Error(
              payload?.error || "Failed to create top-up checkout",
            );
          }

          await redirectToCheckout(payload.url);
        } catch (error) {
          set({
            loading: false,
            error: error instanceof Error ? error.message : "Failed to top up",
          });
        }
      },

      // Billing checks are enforced server-side in /api/chat.
      spendCredits: () => true,

      resetPeriodIfNeeded: () => {
        void get().syncFromServer();
      },

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
            hydrated: false,
            loading: false,
            fxRateUsdToMnt: getUsdToMntRate(),
            fxRateUpdatedAtISO: undefined,
            fxRateLive: false,
            error: undefined,
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
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState) => {
        const baseState = (persistedState ?? {}) as Partial<BillingStore>;

        return {
          currency: baseState.currency ?? initialCurrency,
          billingCadence: baseState.billingCadence ?? "monthly",
          currentPlanId: initialPlanId,
          periodStartISO: initialPeriod.startISO,
          periodEndISO: initialPeriod.endISO,
          includedCreditsRemaining: initialCredits,
          topUpCreditsBalance: 0,
          transactions: initialTransactions,
          hydrated: false,
          loading: false,
          fxRateUsdToMnt: getUsdToMntRate(),
          fxRateUpdatedAtISO: undefined,
          fxRateLive: false,
          error: undefined,
          ui: {
            upgradeModalOpen: false,
            outOfCreditsOpen: false,
            topUpModalOpen: false,
          },
        } as BillingStore;
      },
      partialize: (state) => ({
        currency: state.currency,
        billingCadence: state.billingCadence,
      }),
    },
  ),
);
