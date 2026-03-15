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

export const MODELS: CatalogModel[] = [
  {
    id: "openai/gpt-5.2",
    label: "GPT-5.2",
    providerId: "openai",
    description: "Top-tier reasoning and coding",
    tags: ["new"],
    context: "400K",
    glyph: "openai",
  },
  {
    id: "openai/gpt-5.2-codex",
    label: "GPT-5.2 Codex",
    providerId: "openai",
    description: "Code-focused GPT-5.2 variant",
    tags: ["new"],
    context: "400K",
    glyph: "openaiCodex",
  },
  {
    id: "openai/gpt-5-mini",
    label: "GPT-5 mini",
    providerId: "openai",
    description: "Lower-latency GPT-5 series",
    context: "400K",
    glyph: "openai",
  },
  {
    id: "openai/gpt-4.1",
    label: "GPT-4.1",
    providerId: "openai",
    description: "Balanced reasoning",
    context: "128K",
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
  {
    id: "openai/gpt-5.1",
    label: "GPT-5.1",
    providerId: "openai",
    description: "Legacy frontier preview",
    context: "200K",
    glyph: "openai",
  },
  {
    id: "anthropic/claude-opus-4.1",
    label: "Claude Opus 4.1",
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
    context: "200K",
    glyph: "anthropic",
  },
  {
    id: "anthropic/claude-3.5",
    label: "Claude 3.5",
    providerId: "anthropic",
    description: "Legacy careful writing",
    context: "200K",
    glyph: "anthropic",
  },
  {
    id: "anthropic/claude-opus-4",
    label: "Claude Opus 4",
    providerId: "anthropic",
    description: "Legacy deep analysis",
    context: "200K",
    glyph: "anthropic",
  },
  {
    id: "google/gemini-3-pro-preview",
    label: "Gemini 3 Pro",
    providerId: "google",
    description: "Latest flagship multimodal model",
    tags: ["new"],
    context: "1M",
    glyph: "google",
  },
  {
    id: "google/gemini-3-pro-image-preview",
    label: "Gemini 3 Pro Image",
    providerId: "google",
    description: "Gemini 3 Pro tuned for image generation",
    tags: ["new"],
    context: "1M",
    glyph: "google",
  },
  {
    id: "google/gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    providerId: "google",
    description: "Fast Gemini 3 preview model",
    tags: ["new"],
    context: "1M",
    glyph: "google",
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    providerId: "google",
    description: "Fast cost-efficient multimodal",
    context: "1M",
    glyph: "google",
  },
  {
    id: "google/gemini-2.0",
    label: "Gemini 2.0",
    providerId: "google",
    description: "Legacy multimodal model",
    context: "1M",
    glyph: "google",
  },
  {
    id: "xai/grok-4",
    label: "Grok 4",
    providerId: "xai",
    description: "Latest general-purpose Grok model",
    tags: ["new"],
    glyph: "xai",
  },
  {
    id: "deepseek/deepseek-chat",
    label: "DeepSeek Chat",
    providerId: "deepseek",
    description: "V3.2 chat model alias",
    context: "128K",
    glyph: "deepseek",
  },
  {
    id: "deepseek/deepseek-reasoner",
    label: "DeepSeek Reasoner",
    providerId: "deepseek",
    description: "Reasoning-first V3.2 alias",
    tags: ["new"],
    context: "128K",
    glyph: "deepseek",
  },
  {
    id: "xai/grok-3",
    label: "Grok 3",
    providerId: "xai",
    description: "Opinionated",
    context: "128K",
    glyph: "xai",
  },
];

export const DEFAULT_SLOT_MODEL_IDS = [
  "openai/gpt-5.2",
  "anthropic/claude-sonnet-4",
  "google/gemini-3-pro-preview",
  "xai/grok-4",
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
