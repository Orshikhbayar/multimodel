/**
 * Anthropic Messages API adapter for streaming completions.
 * API docs: https://docs.anthropic.com/en/api/messages-streaming
 */

import type { StreamOptions, StreamEvent, TokenUsage } from "./openai";

/**
 * Maps internal catalog model IDs to the exact Anthropic API model strings.
 * Anthropic uses date-suffixed identifiers; keep these current.
 */
const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  "anthropic/claude-opus-4": "claude-opus-4-5-20250514",
  "anthropic/claude-sonnet-4": "claude-sonnet-4-5-20250514",
  "anthropic/claude-3.5": "claude-3-5-sonnet-20241022",
};

export function getAnthropicModelName(modelId: string): string {
  const name = ANTHROPIC_MODEL_MAP[modelId];
  if (!name) {
    throw new Error(
      `getAnthropicModelName: model "${modelId}" is not in the Anthropic MODEL_MAP.`,
    );
  }
  return name;
}

interface AnthropicDelta {
  type: string;
  text?: string;
}

interface AnthropicStreamEvent {
  type: string;
  delta?: AnthropicDelta;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  message?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
}

export async function* streamAnthropicCompletion(
  options: StreamOptions,
): AsyncGenerator<StreamEvent, void, unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const modelName = getAnthropicModelName(options.model);

  // Anthropic requires system messages to be passed separately.
  const systemMessages = options.messages.filter((m) => m.role === "system");
  const userMessages = options.messages.filter((m) => m.role !== "system");
  const systemPrompt = systemMessages.map((m) => m.content).join("\n") || undefined;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelName,
      messages: userMessages,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      max_tokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.7,
      stream: true,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (errorData as any).error?.message || `Anthropic API error: ${response.status}`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body from Anthropic");

  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const event = JSON.parse(trimmed.slice(6)) as AnthropicStreamEvent;

          if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
            if (event.delta.text) {
              yield { type: "token", content: event.delta.text };
            }
          }

          // Usage arrives in message_start
          if (event.type === "message_start" && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens ?? 0;
          }

          // Output token count arrives in message_delta
          if (event.type === "message_delta" && event.usage) {
            outputTokens = event.usage.output_tokens ?? 0;
          }
        } catch {
          // skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (inputTokens > 0 || outputTokens > 0) {
    const usage: TokenUsage = {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
    yield { type: "usage", usage };
  }
}
