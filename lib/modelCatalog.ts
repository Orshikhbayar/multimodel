export type ProviderIconKey =
  | "sparkles"
  | "brain"
  | "cloud"
  | "flame"
  | "cpu"
  | "layers";

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
    id: "openai/gpt-4.1",
    label: "GPT-4.1",
    providerId: "openai",
    description: "Balanced reasoning",
    context: "128K",
  },
  {
    id: "openai/gpt-5.1",
    label: "GPT-5.1",
    providerId: "openai",
    description: "Frontier preview",
    tags: ["new"],
    context: "200K",
  },
  {
    id: "anthropic/claude-3.5",
    label: "Claude 3.5",
    providerId: "anthropic",
    description: "Careful writing",
    context: "200K",
  },
  {
    id: "anthropic/claude-opus-4",
    label: "Claude Opus 4",
    providerId: "anthropic",
    description: "Deep analysis",
    tags: ["new"],
    context: "200K",
  },
  {
    id: "google/gemini-2.0",
    label: "Gemini 2.0",
    providerId: "google",
    description: "Multimodal",
    tags: ["new"],
    context: "1M",
  },
  {
    id: "deepseek/deepseek-chat",
    label: "DeepSeek Chat",
    providerId: "deepseek",
    description: "Fast chat",
    context: "64K",
  },
  {
    id: "xai/grok-3",
    label: "Grok 3",
    providerId: "xai",
    description: "Opinionated",
    context: "128K",
  },
];

export const DEFAULT_SLOT_MODEL_IDS = [
  "openai/gpt-4.1",
  "anthropic/claude-3.5",
  "google/gemini-2.0",
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
