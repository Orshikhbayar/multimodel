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
    onDone: (fullText: string) => void;
    onError: (error: Error) => void;
}

/**
 * Maps internal model IDs to OpenAI model names
 */
const MODEL_MAP: Record<string, string> = {
    "openai/gpt-4.1": "gpt-4.1",
    "openai/gpt-5.1": "gpt-4.1", // Fallback to gpt-4.1 if 5.1 not available
    "openai/gpt-4o": "gpt-4o",
    "openai/gpt-4o-mini": "gpt-4o-mini",
};

export function getOpenAIModelName(modelId: string): string {
    return MODEL_MAP[modelId] || "gpt-4o-mini";
}

/**
 * Creates a streaming request to OpenAI
 * Returns an async generator that yields tokens
 */
export async function* streamOpenAICompletion(
    options: StreamOptions
): AsyncGenerator<string, void, unknown> {
    const apiKey = process.env.OPENAI_API_KEY;

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
            model: getOpenAIModelName(options.model),
            messages: options.messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 2048,
            stream: true,
        }),
        signal: options.signal,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
            errorData.error?.message || `OpenAI API error: ${response.status}`
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
                    const content = json.choices?.[0]?.delta?.content;
                    if (content) {
                        yield content;
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
    callbacks: StreamCallbacks
): Promise<void> {
    try {
        let fullText = "";

        for await (const token of streamOpenAICompletion(options)) {
            fullText += token;
            callbacks.onToken(token);
        }

        callbacks.onDone(fullText);
    } catch (error) {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
}
