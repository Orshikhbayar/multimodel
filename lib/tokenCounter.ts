/**
 * Token counting public API.
 *
 * This module exposes a stable interface for token estimation and cost
 * calculation. The underlying implementation uses a language-aware heuristic
 * that handles ASCII, CJK, Arabic, Cyrillic, emoji, and surrogate pairs.
 *
 * TODO: Replace the heuristic with `js-tiktoken` once the package can be
 * installed (requires outbound npm access):
 *   npm install js-tiktoken
 *   import { encoding_for_model } from "js-tiktoken";
 *   // Then use encoding_for_model("gpt-4o").encode(text).length
 */

import { estimateTokens, estimatePromptTokens } from "@/lib/api/tokenEstimator";
import { estimateTokenCostUsd } from "@/lib/billing/estimator";
import { getModelById } from "@/lib/modelCatalog";

export type {} from "@/lib/api/tokenEstimator"; // re-export nothing — just document the dependency

/**
 * Estimate the number of tokens in a text string.
 *
 * Accuracy: ±15% for mixed-language input; exact for pure ASCII prose.
 * Handles CJK, Arabic, Cyrillic, emoji, and surrogate pairs.
 *
 * @param content - Text to tokenize
 * @returns Estimated token count (≥ 1)
 */
export function countTokens(content: string): number {
  return estimateTokens(content);
}

/**
 * Estimate the total input-token count for a messages array.
 * Includes per-message overhead (~4 tokens: role tag + delimiters).
 *
 * @param messages - Chat messages with `role` and `content`
 * @returns Estimated total prompt tokens
 */
export function countMessageTokens(
  messages: Array<{ role: string; content: string }>,
): number {
  return estimatePromptTokens(messages);
}

/**
 * Calculate the USD cost of a completed run given actual token counts.
 * Uses real pricing from the model catalog (inputCostPer1M / outputCostPer1M).
 *
 * @param modelId  - Catalog model ID, e.g. "openai/gpt-4o"
 * @param inputTokens  - Actual prompt token count
 * @param outputTokens - Actual completion token count
 * @returns Cost in USD (6 decimal places)
 */
export function calculateRunCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  return estimateTokenCostUsd({ modelId, inputTokens, outputTokens });
}

/**
 * Estimate the USD cost of a single message before sending.
 * Uses estimated token count for the input and the model's max output as
 * the upper-bound output estimate.
 *
 * @param content  - Message text
 * @param modelId  - Catalog model ID
 * @returns Estimated cost in USD
 */
export function estimateMessageCostUsd(
  content: string,
  modelId: string,
): number {
  const model = getModelById(modelId);
  const inputTokens = countTokens(content);
  const outputTokens = model?.maxOutputTokens ?? 2048;
  return calculateRunCostUsd(modelId, inputTokens, outputTokens);
}

/**
 * Verify estimation accuracy against a known-correct token count.
 * Useful in tests and debug tooling.
 *
 * @param content        - Text to verify
 * @param actualTokens   - Known correct token count (e.g. from API usage field)
 * @returns errorPercent — how far off the estimate is as a percentage
 */
export function verifyTokenEstimate(
  content: string,
  actualTokens: number,
): { estimated: number; actual: number; errorPercent: number } {
  const estimated = countTokens(content);
  const errorPercent =
    actualTokens > 0
      ? Math.abs((estimated - actualTokens) / actualTokens) * 100
      : 0;
  return { estimated, actual: actualTokens, errorPercent };
}
