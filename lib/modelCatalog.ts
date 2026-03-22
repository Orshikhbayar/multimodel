export type ProviderIconKey =
  | "sparkles"
  | "brain"
  | "cloud"
  | "flame"
  | "cpu"
  | "layers";

export type ModelGlyphKey =
  | "openai"
  | "openaiCodex"
  | "anthropic"
  | "google"
  | "xai"
  | "deepseek"
  | "misc";

export type ModelProvider = {
  id: string;
  name: string;
  icon?: ProviderIconKey;
};

export type CatalogModel = {
  id: string;
  label: string;
  providerId: string;
  description?: string;
  tags?: string[];
  /** Human-readable context size, e.g. "128K". Use contextWindowTokens for arithmetic. */
  context?: string;
  glyph?: ModelGlyphKey;

  // ── Billing fields — source of truth for cost estimation ─────────────
  /** Input token cost in USD per 1M tokens (prompt). */
  inputCostPer1M?: number;
  /** Output token cost in USD per 1M tokens (completion). */
  outputCostPer1M?: number;
  /** Maximum context window in tokens (not the display string). */
  contextWindowTokens?: number;
  /** Maximum completion tokens the model can generate. */
  maxOutputTokens?: number;
  /** ISO 8601 release date, e.g. "2024-05-13". */
  releaseDate?: string;
};

export const PROVIDERS: ModelProvider[] = [
  { id: "openai", name: "OpenAI", icon: "sparkles" },
  { id: "anthropic", name: "Anthropic", icon: "brain" },
  { id: "google", name: "Google", icon: "cloud" },
  { id: "xai", name: "xAI", icon: "flame" },
  { id: "deepseek", name: "DeepSeek", icon: "cpu" },
  { id: "misc", name: "More", icon: "layers" },
];

/**
 * Canonical model catalog — only models with confirmed API availability.
 * DO NOT add aspirational or unreleased model IDs. Doing so causes silent
 * billing failures and incorrect cost attribution.
 *
 * OpenAI model names:   https://platform.openai.com/docs/models
 * Anthropic model names: https://docs.anthropic.com/en/docs/about-claude/models
 * Google model names:    https://ai.google.dev/gemini-api/docs/models
 * xAI model names:       https://docs.x.ai/docs/models
 * DeepSeek model names:  https://platform.deepseek.com/api-docs
 */
export const MODELS: CatalogModel[] = [
  // ── OpenAI ──────────────────────────────────────────────────────────────
  {
    id: "openai/gpt-4.1",
    label: "GPT-4.1",
    providerId: "openai",
    description: "Balanced reasoning and long-context tasks",
    tags: ["new"],
    context: "1M",
    glyph: "openai",
    inputCostPer1M: 2.0,
    outputCostPer1M: 8.0,
    contextWindowTokens: 1_047_576,
    maxOutputTokens: 32_768,
    releaseDate: "2025-04-14",
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o",
    providerId: "openai",
    description: "Fast multimodal flagship",
    context: "128K",
    glyph: "openai",
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    contextWindowTokens: 128_000,
    maxOutputTokens: 16_384,
    releaseDate: "2024-05-13",
  },
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o mini",
    providerId: "openai",
    description: "Lowest-cost OpenAI model",
    context: "128K",
    glyph: "openai",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    contextWindowTokens: 128_000,
    maxOutputTokens: 16_384,
    releaseDate: "2024-07-18",
  },

  // ── Anthropic ────────────────────────────────────────────────────────────
  {
    id: "anthropic/claude-opus-4",
    label: "Claude Opus 4",
    providerId: "anthropic",
    description: "Highest quality long-form reasoning",
    tags: ["new"],
    context: "200K",
    glyph: "anthropic",
    inputCostPer1M: 15.0,
    outputCostPer1M: 75.0,
    contextWindowTokens: 200_000,
    maxOutputTokens: 32_000,
    releaseDate: "2025-05-22",
  },
  {
    id: "anthropic/claude-sonnet-4",
    label: "Claude Sonnet 4",
    providerId: "anthropic",
    description: "Strong all-round assistant",
    tags: ["new"],
    context: "200K",
    glyph: "anthropic",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    contextWindowTokens: 200_000,
    maxOutputTokens: 64_000,
    releaseDate: "2025-05-22",
  },
  {
    id: "anthropic/claude-3.5",
    label: "Claude 3.5 Sonnet",
    providerId: "anthropic",
    description: "Careful writing and analysis",
    context: "200K",
    glyph: "anthropic",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    contextWindowTokens: 200_000,
    maxOutputTokens: 8_192,
    releaseDate: "2024-10-22",
  },

  // ── Google ───────────────────────────────────────────────────────────────
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    providerId: "google",
    description: "Fast cost-efficient multimodal",
    tags: ["new"],
    context: "1M",
    glyph: "google",
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.3,
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_536,
    releaseDate: "2025-03-25",
  },
  {
    id: "google/gemini-2.0",
    label: "Gemini 2.0 Flash",
    providerId: "google",
    description: "Multimodal with agentic capabilities",
    context: "1M",
    glyph: "google",
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 8_192,
    releaseDate: "2024-12-11",
  },

  // ── xAI ─────────────────────────────────────────────────────────────────
  {
    id: "xai/grok-3",
    label: "Grok 3",
    providerId: "xai",
    description: "Real-time knowledge, opinionated reasoning",
    tags: ["new"],
    context: "128K",
    glyph: "xai",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    contextWindowTokens: 131_072,
    maxOutputTokens: 131_072,
    releaseDate: "2025-02-17",
  },

  // ── DeepSeek ─────────────────────────────────────────────────────────────
  {
    id: "deepseek/deepseek-reasoner",
    label: "DeepSeek Reasoner",
    providerId: "deepseek",
    description: "Chain-of-thought reasoning (R1)",
    tags: ["new"],
    context: "128K",
    glyph: "deepseek",
    inputCostPer1M: 0.55,
    outputCostPer1M: 2.19,
    contextWindowTokens: 128_000,
    maxOutputTokens: 8_000,
    releaseDate: "2025-01-20",
  },
  {
    id: "deepseek/deepseek-chat",
    label: "DeepSeek Chat",
    providerId: "deepseek",
    description: "Efficient general-purpose chat (V3)",
    context: "128K",
    glyph: "deepseek",
    inputCostPer1M: 0.27,
    outputCostPer1M: 1.1,
    contextWindowTokens: 128_000,
    maxOutputTokens: 8_000,
    releaseDate: "2024-12-26",
  },
];

// Default to 3 free models for the hero compare experience on first load
export const DEFAULT_SLOT_MODEL_IDS = [
  "openai/gpt-4o-mini",
  "anthropic/claude-sonnet-4",
  "google/gemini-2.5-flash",
  "deepseek/deepseek-chat",
];

export function getModelById(id: string) {
  return MODELS.find((model) => model.id === id);
}

export function getProviderById(id: string) {
  return PROVIDERS.find((provider) => provider.id === id);
}

export function getModelLabel(id: string) {
  return getModelById(id)?.label ?? id;
}

const PROVIDER_GLYPH_MAP: Record<string, ModelGlyphKey> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  xai: "xai",
  deepseek: "deepseek",
  misc: "misc",
};

export function getModelGlyphKey(modelId?: string, providerId?: string) {
  const model = modelId ? getModelById(modelId) : undefined;
  const fallbackProviderId = model?.providerId ?? providerId ?? "misc";

  return model?.glyph ?? PROVIDER_GLYPH_MAP[fallbackProviderId] ?? "misc";
}

/** Returns true if the model ID exists in the confirmed catalog. */
export function isValidModel(modelId: string): boolean {
  return MODELS.some((m) => m.id === modelId);
}

/**
 * Returns the blended per-1K-token cost (average of input + output prices).
 * Returns undefined for models without pricing data.
 * Use inputCostPer1M / outputCostPer1M directly for accurate split billing.
 */
export function getModelCostPer1kTokens(modelId: string): number | undefined {
  const model = getModelById(modelId);
  if (!model?.inputCostPer1M || !model?.outputCostPer1M) return undefined;
  return (model.inputCostPer1M + model.outputCostPer1M) / 2 / 1000;
}

/** Returns all model IDs in the catalog (flat list). */
export function getAllModelIds(): string[] {
  return MODELS.map((m) => m.id);
}
