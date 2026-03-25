import type { Plan, PlanId, TopUpPack, TopUpPackId } from "./types";
import { convertCurrency } from "./utils";
import { MODELS } from "@/lib/modelCatalog";

// Free tier: models with tier "free" in the catalog
const FREE_MODELS = MODELS.filter((m) => m.tier === "free").map((m) => m.id);

// Premium tier: all models
const ALL_MODELS = MODELS.map((model) => model.id);

// Free: $0/mo — 20 comparisons/day, file upload only, free models
// Pro: $12/mo — unlimited comparisons, all models, web search + image gen + file upload
export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: { USD: 0, MNT: 0 },
    annualPrice: { USD: 0, MNT: 0 },
    includedMonthlyCredits: { USD: 1, MNT: 3450 },
    dailyTokenCap: 2_000,
    monthlyTokenCap: 30_000,
    maxEnabledModels: 3,
    features: {
      webSearch: false,
      tools: false,
      images: false,
      projects: false,
    },
    allowedModelIds: FREE_MODELS,
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: { USD: 12, MNT: 41400 },
    annualPrice: { USD: 120, MNT: 414000 },
    includedMonthlyCredits: { USD: 18, MNT: 62100 },
    dailyTokenCap: 0, // unlimited
    monthlyTokenCap: 0, // unlimited
    maxEnabledModels: 6,
    features: {
      webSearch: true,
      tools: true,
      images: false,
      projects: false,
    },
    allowedModelIds: ALL_MODELS,
  },
];

// Legacy plan IDs map to Free (for existing DB users on plus/team)
export const PLAN_ORDER: PlanId[] = ["free", "pro"];

export const TOP_UP_PACKS: TopUpPack[] = [];

export function getPlanById(id: PlanId) {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[0];
}

export function getNextPlanForModel(modelId: string) {
  return PLANS.find((plan) => plan.allowedModelIds.includes(modelId));
}

export function getNextPlanForSlots(desiredSlots: number) {
  return PLANS.find((plan) => plan.maxEnabledModels >= desiredSlots);
}

export function getTopUpPackById(_id: TopUpPackId): TopUpPack | undefined {
  return undefined;
}

export function getTopUpPayPrice(_pack: TopUpPack, currency: "USD" | "MNT") {
  if (currency === "USD") return 0;
  return 0;
}
