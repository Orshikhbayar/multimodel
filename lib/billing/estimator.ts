import type { Currency } from "./types";
import { convertCurrency } from "./utils";
import { getModelById } from "@/lib/modelCatalog";
import { estimateTokens } from "@/lib/api/tokenEstimator";

const DEFAULT_MAX_OUTPUT_TOKENS = 512;

/**
 * Derive per-1M-token costs from the model catalog.
 * Falls back to a conservative generic rate when pricing data is missing.
 */
function getModelRates(modelId: string): {
  inputPer1M: number;
  outputPer1M: number;
} {
  const model = getModelById(modelId);
  if (model?.inputCostPer1M !== undefined && model?.outputCostPer1M !== undefined) {
    return {
      inputPer1M: model.inputCostPer1M,
      outputPer1M: model.outputCostPer1M,
    };
  }

  // Fallback: $0.01 / 1K tokens (blended) — equivalent to the old BASE_RATE
  return { inputPer1M: 10.0, outputPer1M: 10.0 };
}

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
  const { inputPer1M, outputPer1M } = getModelRates(modelId);
  const inputTokens = Math.max(1, estimateTokens(input));
  const inputCostUsd = (inputTokens / 1_000_000) * inputPer1M;
  const outputCostUsd = (maxOutputTokens / 1_000_000) * outputPer1M;
  const costUsd = inputCostUsd + outputCostUsd;
  const cost = convertCurrency(costUsd, "USD", currency);
  return Math.max(0.01, Number(cost.toFixed(2)));
}

/**
 * Calculate actual cost for a completed run where real token counts are known.
 * Uses separate input/output rates from the catalog for accuracy.
 */
export function estimateTokenCostUsd({
  modelId,
  inputTokens,
  outputTokens,
}: {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const { inputPer1M, outputPer1M } = getModelRates(modelId);
  const inputCost = (Math.max(0, inputTokens) / 1_000_000) * inputPer1M;
  const outputCost = (Math.max(0, outputTokens) / 1_000_000) * outputPer1M;
  return Math.max(0, Number((inputCost + outputCost).toFixed(6)));
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
  // Image generation pricing doesn't follow per-token rates; keep a flat table.
  const IMAGE_MULTIPLIERS: Record<string, number> = {
    "openai/gpt-4.1": 1.0,
    "openai/gpt-4o": 1.25,
    "openai/gpt-4o-mini": 0.35,
  };
  const multiplier = IMAGE_MULTIPLIERS[modelId] ?? 1.0;
  const costUsd = (IMAGE_BASE_USD[size] ?? 0.1) * multiplier;
  const cost = convertCurrency(costUsd, "USD", currency);
  return Math.max(0.05, Number(cost.toFixed(2)));
}

export const BILLING_DEFAULTS = {
  maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
};
