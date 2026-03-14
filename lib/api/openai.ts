/**
 * OpenAI API client for streaming completions
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string, usage?: TokenUsage) => void;
  onError: (error: Error) => void;
}

/**
 * Token usage information from OpenAI response
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Result of a streaming completion
 */
export interface StreamResult {
  fullText: string;
  usage?: TokenUsage;
}

/**
 * Maps internal model IDs to OpenAI model names
 */
const MODEL_MAP: Record<string, string> = {
  "openai/gpt-5.2": "gpt-5.2",
  "openai/gpt-5.2-codex": "gpt-5.2-codex",
  "openai/gpt-5-mini": "gpt-5-mini",
  "openai/gpt-4.1": "gpt-4.1",
  "openai/gpt-5.1": "gpt-5.2", // Legacy alias
  "openai/gpt-4o": "gpt-4o",
  "openai/gpt-4o-mini": "gpt-4o-mini",
};

export function getOpenAIModelName(modelId: string): string {
  return MODEL_MAP[modelId] || "gpt-4o-mini";
}

function getTokenLimitParam(modelName: string, maxTokens?: number) {
  // GPT-5 chat-completions expects max_completion_tokens instead of max_tokens.
  if (modelName.startsWith("gpt-5")) {
    return { max_completion_tokens: maxTokens ?? 2048 };
  }

  return { max_tokens: maxTokens ?? 2048 };
}

/**
 * Token event - either a text token or usage data
 */
export type StreamEvent =
  | { type: "token"; content: string }
  | { type: "usage"; usage: TokenUsage };

/**
 * Creates a streaming request to OpenAI
 * Returns an async generator that yields tokens and usage data
 *
 * The generator yields token events during streaming,
 * and a usage event at the end with actual token counts from OpenAI.
 */
export async function* streamOpenAICompletion(
  options: StreamOptions,
): AsyncGenerator<StreamEvent, void, unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  const modelName = getOpenAIModelName(options.model);

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      ...getTokenLimitParam(modelName, options.maxTokens),
      stream: true,
      // Request usage data in streaming response
      stream_options: { include_usage: true },
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `OpenAI API error: ${response.status}`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

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

          // Check for token content
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            yield { type: "token", content };
          }

          // Check for usage data (sent at the end of stream)
          if (json.usage) {
            yield {
              type: "usage",
              usage: {
                promptTokens: json.usage.prompt_tokens ?? 0,
                completionTokens: json.usage.completion_tokens ?? 0,
                totalTokens: json.usage.total_tokens ?? 0,
              },
            };
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Helper to stream with callbacks (for client-side usage)
 */
export async function streamWithCallbacks(
  options: StreamOptions,
  callbacks: StreamCallbacks,
): Promise<void> {
  try {
    let fullText = "";
    let usage: TokenUsage | undefined;

    for await (const event of streamOpenAICompletion(options)) {
      if (event.type === "token") {
        fullText += event.content;
        callbacks.onToken(event.content);
      } else if (event.type === "usage") {
        usage = event.usage;
      }
    }

    callbacks.onDone(fullText, usage);
  } catch (error) {
    callbacks.onError(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
