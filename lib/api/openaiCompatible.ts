/**
 * Generic OpenAI-compatible API adapter.
 * Used for providers that implement the OpenAI chat completions spec
 * (xAI/Grok, DeepSeek, etc.) with a different base URL and API key.
 */

import type { StreamOptions, StreamEvent, TokenUsage } from "./openai";

export interface OpenAICompatibleProviderConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
}

const PROVIDER_CONFIGS: Record<
  string,
  { baseUrl: string; envKey: string; modelMap: Record<string, string> }
> = {
  xai: {
    baseUrl: "https://api.x.ai/v1",
    envKey: "XAI_API_KEY",
    modelMap: {
      "xai/grok-3": "grok-3-beta",
    },
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    envKey: "DEEPSEEK_API_KEY",
    modelMap: {
      "deepseek/deepseek-chat": "deepseek-chat",
      "deepseek/deepseek-reasoner": "deepseek-reasoner",
    },
  },
};

export function getCompatibleProviderConfig(
  modelId: string,
): OpenAICompatibleProviderConfig {
  const providerName = modelId.split("/")[0];
  const config = PROVIDER_CONFIGS[providerName];

  if (!config) {
    throw new Error(
      `getCompatibleProviderConfig: no OpenAI-compatible config for provider "${providerName}".`,
    );
  }

  const modelName = config.modelMap[modelId];
  if (!modelName) {
    throw new Error(
      `getCompatibleProviderConfig: model "${modelId}" is not in the ${providerName} model map.`,
    );
  }

  const apiKey = process.env[config.envKey];
  if (!apiKey) {
    throw new Error(`${config.envKey} is not configured`);
  }

  return { baseUrl: config.baseUrl, apiKey, modelName };
}

export async function* streamOpenAICompatibleCompletion(
  options: StreamOptions,
): AsyncGenerator<StreamEvent, void, unknown> {
  const { baseUrl, apiKey, modelName } = getCompatibleProviderConfig(
    options.model,
  );

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (errorData as any).error?.message ||
        `${options.model.split("/")[0]} API error: ${response.status}`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));

          const content = json.choices?.[0]?.delta?.content;
          if (content) yield { type: "token", content };

          if (json.usage) {
            const usage: TokenUsage = {
              promptTokens: json.usage.prompt_tokens ?? 0,
              completionTokens: json.usage.completion_tokens ?? 0,
              totalTokens: json.usage.total_tokens ?? 0,
            };
            yield { type: "usage", usage };
          }
        } catch {
          // skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
