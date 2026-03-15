import type { Plan, PlanId, TopUpPack, TopUpPackId } from "./types";
import { convertCurrency } from "./utils";
import { MODELS } from "@/lib/modelCatalog";

const OPENAI_MODELS_AT_OR_BELOW_GPT_5_2 = [
  "openai/gpt-5.2",
  "openai/gpt-5.1",
  "openai/gpt-5-mini",
  "openai/gpt-4.1",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
];

const FREE_MODELS = [
  ...OPENAI_MODELS_AT_OR_BELOW_GPT_5_2,
  "anthropic/claude-sonnet-4",
  "google/gemini-3-pro-preview",
  "xai/grok-4",
  "deepseek/deepseek-chat",
];

const PLUS_MODELS = [
  ...FREE_MODELS,
  "google/gemini-3-flash-preview",
  "deepseek/deepseek-reasoner",
  "anthropic/claude-3.5",
  "google/gemini-2.5-flash",
  "google/gemini-2.0",
  "xai/grok-3",
];

const PRO_MODELS = [
  ...PLUS_MODELS,
  "openai/gpt-5.2-codex",
  "anthropic/claude-opus-4.1",
  "google/gemini-3-pro-image-preview",
  "anthropic/claude-opus-4",
];

const TEAM_MODELS = MODELS.map((model) => model.id);

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: { USD: 0, MNT: 0 },
    annualPrice: { USD: 0, MNT: 0 },
    includedMonthlyCredits: { USD: 1, MNT: 3450 },
    dailyTokenCap: 2_000,
    monthlyTokenCap: 30_000,
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
    monthlyPrice: { USD: 19, MNT: 65550 },
    annualPrice: { USD: 190, MNT: 655500 },
    includedMonthlyCredits: { USD: 7, MNT: 24150 },
    dailyTokenCap: 10_000,
    monthlyTokenCap: 250_000,
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
    monthlyPrice: { USD: 49, MNT: 169050 },
    annualPrice: { USD: 490, MNT: 1690500 },
    includedMonthlyCredits: { USD: 18, MNT: 62100 },
    dailyTokenCap: 25_000,
    monthlyTokenCap: 650_000,
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
    monthlyPrice: { USD: 129, MNT: 445050 },
    annualPrice: { USD: 1290, MNT: 4450500 },
    includedMonthlyCredits: { USD: 50, MNT: 172500 },
    dailyTokenCap: 60_000,
    monthlyTokenCap: 1_800_000,
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

export const TOP_UP_PACKS: TopUpPack[] = [
  { id: "starter", label: "Starter", payPriceUsd: 12, creditUsd: 10 },
  { id: "boost", label: "Boost", payPriceUsd: 30, creditUsd: 25 },
  { id: "power", label: "Power", payPriceUsd: 72, creditUsd: 60 },
];

export function getPlanById(id: PlanId) {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[0];
}

export function getNextPlanForModel(modelId: string) {
  return PLANS.find((plan) => plan.allowedModelIds.includes(modelId));
}

export function getNextPlanForSlots(desiredSlots: number) {
  return PLANS.find((plan) => plan.maxEnabledModels >= desiredSlots);
}

export function getTopUpPackById(id: TopUpPackId) {
  return TOP_UP_PACKS.find((pack) => pack.id === id);
}

export function getTopUpPayPrice(pack: TopUpPack, currency: "USD" | "MNT") {
  if (currency === "USD") return pack.payPriceUsd;
  return Math.round(convertCurrency(pack.payPriceUsd, "USD", "MNT"));
}
