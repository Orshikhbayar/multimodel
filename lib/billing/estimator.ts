import type { Currency } from "./types";
import { convertCurrency } from "./utils";

const BASE_RATE_USD_PER_1K = 0.01;
const DEFAULT_MAX_OUTPUT_TOKENS = 512;

const MODEL_MULTIPLIERS: Record<string, number> = {
  "openai/gpt-4.1": 1.0,
  "openai/gpt-5.1": 1.6,
  "anthropic/claude-3.5": 1.15,
  "anthropic/claude-opus-4": 1.8,
  "google/gemini-2.0": 1.25,
  "deepseek/deepseek-chat": 0.6,
  "xai/grok-3": 1.1,
};

const IMAGE_BASE_USD: Record<string, number> = {
  small: 0.06,
  medium: 0.1,
  large: 0.16,
};

export type ImageSize = "small" | "medium" | "large";

export function estimateChatCost({
  modelId,
  input,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  currency,
}: {
  modelId: string;
  input: string;
  maxOutputTokens?: number;
  currency: Currency;
}) {
  const multiplier = MODEL_MULTIPLIERS[modelId] ?? 1;
  const inputTokens = Math.max(1, Math.ceil(input.length / 4));
  const totalTokens = inputTokens + maxOutputTokens;
  const costUsd = (totalTokens / 1000) * BASE_RATE_USD_PER_1K * multiplier;
  const cost = convertCurrency(costUsd, "USD", currency);
  return Math.max(0.01, Number(cost.toFixed(2)));
}

export function estimateChatCostForSlots({
  modelIds,
  input,
  currency,
}: {
  modelIds: string[];
  input: string;
  currency: Currency;
}) {
  return modelIds.reduce(
    (total, modelId) => total + estimateChatCost({ modelId, input, currency }),
    0,
  );
}

export function estimateImageCost({
  modelId,
  size,
  currency,
}: {
  modelId: string;
  size: ImageSize;
  currency: Currency;
}) {
  const multiplier = MODEL_MULTIPLIERS[modelId] ?? 1;
  const costUsd = (IMAGE_BASE_USD[size] ?? 0.1) * multiplier;
  const cost = convertCurrency(costUsd, "USD", currency);
  return Math.max(0.05, Number(cost.toFixed(2)));
}

export const BILLING_DEFAULTS = {
  maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
};
