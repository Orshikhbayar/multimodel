/**
 * Google Gemini API adapter for streaming completions.
 * API docs: https://ai.google.dev/api/generate-content#v1beta.models.streamGenerateContent
 */

import type { StreamOptions, StreamEvent, TokenUsage } from "./openai";

const GOOGLE_MODEL_MAP: Record<string, string> = {
  "google/gemini-2.5-flash": "gemini-2.5-flash-preview-04-17",
  "google/gemini-2.0": "gemini-2.0-flash",
};

export function getGoogleModelName(modelId: string): string {
  const name = GOOGLE_MODEL_MAP[modelId];
  if (!name) {
    throw new Error(
      `getGoogleModelName: model "${modelId}" is not in the Google MODEL_MAP.`,
    );
  }
  return name;
}

interface GeminiPart {
  text?: string;
}

interface GeminiContent {
  role?: string;
  parts: GeminiPart[];
}

interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: string;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiStreamChunk {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}

export async function* streamGoogleCompletion(
  options: StreamOptions,
): AsyncGenerator<StreamEvent, void, unknown> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not configured");
  }

  const modelName = getGoogleModelName(options.model);

  // Convert OpenAI-style messages to Gemini contents format.
  // System messages become a systemInstruction, others become contents.
  const systemMessages = options.messages.filter((m) => m.role === "system");
  const conversationMessages = options.messages.filter((m) => m.role !== "system");
  const systemInstruction =
    systemMessages.length > 0
      ? { parts: [{ text: systemMessages.map((m) => m.content).join("\n") }] }
      : undefined;

  const contents: GeminiContent[] = conversationMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent` +
    `?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      ...(systemInstruction ? { system_instruction: systemInstruction } : {}),
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 2048,
      },
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (errorData as any).error?.message || `Google API error: ${response.status}`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body from Google");

  const decoder = new TextDecoder();
  let buffer = "";
  let lastUsage: GeminiUsageMetadata | undefined;

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
          const chunk = JSON.parse(trimmed.slice(6)) as GeminiStreamChunk;

          const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            yield { type: "token", content: text };
          }

          if (chunk.usageMetadata) {
            lastUsage = chunk.usageMetadata;
          }
        } catch {
          // skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (lastUsage) {
    const usage: TokenUsage = {
      promptTokens: lastUsage.promptTokenCount ?? 0,
      completionTokens: lastUsage.candidatesTokenCount ?? 0,
      totalTokens: lastUsage.totalTokenCount ?? 0,
    };
    yield { type: "usage", usage };
  }
}
