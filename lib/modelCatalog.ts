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
  context?: string;
  glyph?: ModelGlyphKey;
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
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o",
    providerId: "openai",
    description: "Fast multimodal flagship",
    context: "128K",
    glyph: "openai",
  },
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o mini",
    providerId: "openai",
    description: "Lowest-cost OpenAI model",
    context: "128K",
    glyph: "openai",
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
  },
  {
    id: "anthropic/claude-sonnet-4",
    label: "Claude Sonnet 4",
    providerId: "anthropic",
    description: "Strong all-round assistant",
    tags: ["new"],
    context: "200K",
    glyph: "anthropic",
  },
  {
    id: "anthropic/claude-3.5",
    label: "Claude 3.5 Sonnet",
    providerId: "anthropic",
    description: "Careful writing and analysis",
    context: "200K",
    glyph: "anthropic",
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
  },
  {
    id: "google/gemini-2.0",
    label: "Gemini 2.0 Flash",
    providerId: "google",
    description: "Multimodal with agentic capabilities",
    context: "1M",
    glyph: "google",
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
  },
  {
    id: "deepseek/deepseek-chat",
    label: "DeepSeek Chat",
    providerId: "deepseek",
    description: "Efficient general-purpose chat (V3)",
    context: "128K",
    glyph: "deepseek",
  },
];

export const DEFAULT_SLOT_MODEL_IDS = [
  "openai/gpt-4.1",
  "anthropic/claude-sonnet-4",
  "google/gemini-2.5-flash",
  "xai/grok-3",
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
