/**
 * Shared types for API layer
 */

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface ChatCompletionRequest {
    messages: ChatMessage[];
    modelId: string;
    temperature?: number;
    maxTokens?: number;
}

export interface ChatCompletionResponse {
    text: string;
    model: string;
    finishReason: "stop" | "length" | "error";
}

export type StreamingProvider = "openai" | "anthropic" | "google" | "mock";

export interface ProviderConfig {
    apiKey: string;
    baseUrl?: string;
}
