import type { Plan, PlanId } from "./types";

const FREE_MODELS = [
  "openai/gpt-4.1",
  "anthropic/claude-3.5",
  "google/gemini-2.0",
  "xai/grok-3",
  "deepseek/deepseek-chat",
];

const PLUS_MODELS = [...FREE_MODELS, "openai/gpt-5.1"];

const PRO_MODELS = [...PLUS_MODELS, "anthropic/claude-opus-4"];

const TEAM_MODELS = [...PRO_MODELS];

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: { USD: 0, MNT: 0 },
    annualPrice: { USD: 0, MNT: 0 },
    includedMonthlyCredits: { USD: 12, MNT: 42000 },
    maxEnabledModels: 1,
    features: {
      webSearch: false,
      tools: false,
      images: false,
      projects: false,
    },
    allowedModelIds: FREE_MODELS,
  },
  {
    id: "plus",
    name: "Plus",
    monthlyPrice: { USD: 20, MNT: 69000 },
    annualPrice: { USD: 204, MNT: 703000 },
    includedMonthlyCredits: { USD: 60, MNT: 210000 },
    maxEnabledModels: 2,
    features: {
      webSearch: true,
      tools: true,
      images: false,
      projects: true,
    },
    allowedModelIds: PLUS_MODELS,
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: { USD: 45, MNT: 155000 },
    annualPrice: { USD: 456, MNT: 1570000 },
    includedMonthlyCredits: { USD: 150, MNT: 520000 },
    maxEnabledModels: 3,
    features: {
      webSearch: true,
      tools: true,
      images: true,
      projects: true,
    },
    allowedModelIds: PRO_MODELS,
  },
  {
    id: "team",
    name: "Team",
    monthlyPrice: { USD: 120, MNT: 415000 },
    annualPrice: { USD: 1188, MNT: 4110000 },
    includedMonthlyCredits: { USD: 400, MNT: 1380000 },
    maxEnabledModels: 6,
    features: {
      webSearch: true,
      tools: true,
      images: true,
      projects: true,
    },
    allowedModelIds: TEAM_MODELS,
  },
];

export const PLAN_ORDER: PlanId[] = ["free", "plus", "pro", "team"];

export function getPlanById(id: PlanId) {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[0];
}

export function getNextPlanForModel(modelId: string) {
  return PLANS.find((plan) => plan.allowedModelIds.includes(modelId));
}

export function getNextPlanForSlots(desiredSlots: number) {
  return PLANS.find((plan) => plan.maxEnabledModels >= desiredSlots);
}
