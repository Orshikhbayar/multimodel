import { NextRequest } from "next/server";
import { streamOpenAICompletion, getOpenAIModelName } from "@/lib/api/openai";
import type { ChatMessage } from "@/lib/api/types";

export const runtime = "edge";

interface ChatRequestBody {
    messages: ChatMessage[];
    modelId: string;
    temperature?: number;
    maxTokens?: number;
}

/**
 * POST /api/chat
 * 
 * Streams chat completions from OpenAI.
 * Proxies requests to keep API keys server-side.
 */
export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as ChatRequestBody;
        const { messages, modelId, temperature, maxTokens } = body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return new Response(
                JSON.stringify({ error: "messages array is required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        if (!process.env.OPENAI_API_KEY) {
            return new Response(
                JSON.stringify({
                    error: "OpenAI API key not configured",
                    hint: "Add OPENAI_API_KEY to your .env.local file"
                }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        // Create a readable stream for SSE
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    const generator = streamOpenAICompletion({
                        model: modelId || "openai/gpt-4o-mini",
                        messages,
                        temperature,
                        maxTokens,
                        signal: request.signal,
                    });

                    for await (const token of generator) {
                        // Send as Server-Sent Events format
                        const data = JSON.stringify({ token });
                        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                    }

                    // Signal completion
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Unknown error";
                    const errorData = JSON.stringify({ error: errorMessage });
                    controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            },
        });
    } catch (error) {
        console.error("[API /chat] Error:", error);
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : "Internal server error"
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
