const MODEL_PRICING_USD_PER_1K: Record<
  string,
  { promptPer1k: number; completionPer1k: number }
> = {
  "openai/gpt-4.1": { promptPer1k: 0.01, completionPer1k: 0.03 },
  "openai/gpt-5-mini": { promptPer1k: 0.012, completionPer1k: 0.036 },
  "openai/gpt-5.2": { promptPer1k: 0.018, completionPer1k: 0.054 },
  "openai/gpt-5.2-codex": { promptPer1k: 0.02, completionPer1k: 0.06 },
  "openai/gpt-5.1": { promptPer1k: 0.016, completionPer1k: 0.048 },
  "openai/gpt-4o": { promptPer1k: 0.0025, completionPer1k: 0.01 },
  "openai/gpt-4o-mini": { promptPer1k: 0.00015, completionPer1k: 0.0006 },
  "anthropic/claude-sonnet-4": { promptPer1k: 0.012, completionPer1k: 0.036 },
  "anthropic/claude-opus-4.1": { promptPer1k: 0.0185, completionPer1k: 0.0555 },
  "anthropic/claude-3.5": { promptPer1k: 0.0115, completionPer1k: 0.0345 },
  "anthropic/claude-opus-4": { promptPer1k: 0.018, completionPer1k: 0.054 },
  "google/gemini-3-flash-preview": {
    promptPer1k: 0.0065,
    completionPer1k: 0.0195,
  },
  "google/gemini-3-pro-preview": { promptPer1k: 0.014, completionPer1k: 0.042 },
  "google/gemini-3-pro-image-preview": {
    promptPer1k: 0.02,
    completionPer1k: 0.06,
  },
  "google/gemini-2.5-flash": { promptPer1k: 0.005, completionPer1k: 0.015 },
  "google/gemini-2.0": { promptPer1k: 0.0125, completionPer1k: 0.0375 },
  "xai/grok-4": { promptPer1k: 0.0135, completionPer1k: 0.0405 },
  "xai/grok-3": { promptPer1k: 0.011, completionPer1k: 0.033 },
  "deepseek/deepseek-reasoner": { promptPer1k: 0.009, completionPer1k: 0.027 },
  "deepseek/deepseek-chat": { promptPer1k: 0.006, completionPer1k: 0.018 },
  // Egune pricing: ₮/1M → USD/1k (1 USD ≈ 3450 MNT)
  "egune/egune1-14b": { promptPer1k: 0.000783, completionPer1k: 0.01420 },
  "egune/egune1-4b": { promptPer1k: 0.000261, completionPer1k: 0.00142 },
  "gpt-4.1": { promptPer1k: 0.01, completionPer1k: 0.03 },
  "gpt-5.2": { promptPer1k: 0.018, completionPer1k: 0.054 },
  "gpt-5.2-codex": { promptPer1k: 0.02, completionPer1k: 0.06 },
  "gpt-5-mini": { promptPer1k: 0.012, completionPer1k: 0.036 },
  "gpt-4o": { promptPer1k: 0.0025, completionPer1k: 0.01 },
  "gpt-4o-mini": { promptPer1k: 0.00015, completionPer1k: 0.0006 },
  default: { promptPer1k: 0.00015, completionPer1k: 0.0006 },
};

function getModelPricing(modelId: string) {
  return MODEL_PRICING_USD_PER_1K[modelId] ?? MODEL_PRICING_USD_PER_1K.default;
}

export function calculateUsageCostCents(params: {
  modelId: string;
  promptTokens: number;
  completionTokens: number;
}) {
  const pricing = getModelPricing(params.modelId);
  const usd =
    (params.promptTokens / 1000) * pricing.promptPer1k +
    (params.completionTokens / 1000) * pricing.completionPer1k;

  const cents = Math.round(usd * 100);
  if (params.promptTokens + params.completionTokens <= 0) {
    return 0;
  }
  return Math.max(1, cents);
}

export function estimatePromptTokensFromMessages(
  messages: Array<{ content: string }>,
): number {
  const totalChars = messages.reduce(
    (sum, message) => sum + (message.content?.length ?? 0),
    0,
  );
  return Math.max(1, Math.ceil(totalChars / 3));
}

export function estimateUsageHoldCents(params: {
  modelId: string;
  estimatedPromptTokens: number;
  maxOutputTokens: number;
}) {
  const promptTokens = Math.ceil(params.estimatedPromptTokens * 1.1);
  const completionTokens = Math.ceil(params.maxOutputTokens * 1.1);
  return calculateUsageCostCents({
    modelId: params.modelId,
    promptTokens,
    completionTokens,
  });
}
