import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@/lib/auth";
import { streamOpenAICompletion, getOpenAIModelName, type TokenUsage } from "@/lib/api/openai";
import {
  withStreamTimeouts,
  StreamTimeoutError,
  STREAM_TIMEOUT_CONFIG,
  getStreamStatusFromError,
} from "@/lib/api/streamWithTimeout";
import {
  checkStreamPermission,
  releaseConcurrencySlot,
  getRateLimitHeaders,
} from "@/lib/rateLimit";
import { checkUserQuota, recordUserUsage } from "@/lib/api/usage";
import { createRequestLogger } from "@/lib/logger";
import Metrics from "@/lib/metrics";
import type { ChatMessage } from "@/lib/api/types";

// Note: Using Node.js runtime because auth() uses Prisma adapter
// which requires Node.js runtime for database connections

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
 *
 * Features:
 * - Requires authentication
 * - Quota enforcement (daily token limits)
 * - Rate limiting (20 requests/minute per user)
 * - Concurrency limiting (2 concurrent streams per user)
 * - Timeouts (30s connect, 60s inactivity, 5min max)
 * - Abort propagation (client cancel stops upstream)
 * - Real token usage tracking
 */
export async function POST(request: NextRequest) {
  // Generate request ID for tracing
  const requestId = nanoid(10);
  const startTime = Date.now();

  // Verify authentication
  const session = await auth();
  if (!session?.user?.id) {
    Metrics.apiRequestCount({ endpoint: "/api/chat", status: 401 });
    return new Response(
      JSON.stringify({ error: "Authentication required", requestId }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const userId = session.user.id;
  const log = createRequestLogger(requestId, userId);
  
  // Set Sentry context for this request
  Sentry.setUser({ id: userId });
  Sentry.setTag("requestId", requestId);

  // Check quota before processing
  const quota = await checkUserQuota(userId);
  if (!quota.allowed) {
    log.info("Quota exceeded", { used: quota.used, limit: quota.limit });
    Metrics.rateLimitHit({ userId, type: "quota" });
    Metrics.apiRequestCount({ endpoint: "/api/chat", status: 402 });
    
    const resetTime = quota.resetAt.toISOString();
    return new Response(
      JSON.stringify({
        error: "Quota exceeded",
        message: `You've used ${quota.used.toLocaleString()} of ${quota.limit.toLocaleString()} tokens today. Your quota resets at midnight.`,
        used: quota.used,
        limit: quota.limit,
        resetAt: resetTime,
        requestId,
      }),
      {
        status: 402, // Payment Required
        headers: {
          "Content-Type": "application/json",
          "X-Quota-Limit": quota.limit.toString(),
          "X-Quota-Remaining": "0",
          "X-Quota-Reset": resetTime,
        },
      },
    );
  }

  // Check rate limit and concurrency
  const permission = checkStreamPermission(userId);

  if (!permission.allowed) {
    const headers = getRateLimitHeaders(permission.rateLimit);

    if (permission.reason === "rate_limit") {
      log.info("Rate limit exceeded", { resetIn: permission.rateLimit.resetIn });
      Metrics.rateLimitHit({ userId, type: "rate" });
      Metrics.apiRequestCount({ endpoint: "/api/chat", status: 429 });
      
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          message: `Too many requests. Please wait ${permission.rateLimit.resetIn} seconds.`,
          retryAfter: permission.rateLimit.resetIn,
          requestId,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": permission.rateLimit.resetIn.toString(),
            ...headers,
          },
        },
      );
    }

    if (permission.reason === "concurrency_limit") {
      log.info("Concurrency limit exceeded", { active: permission.concurrency.active });
      Metrics.rateLimitHit({ userId, type: "concurrency" });
      Metrics.apiRequestCount({ endpoint: "/api/chat", status: 429 });
      
      return new Response(
        JSON.stringify({
          error: "Too many concurrent requests",
          message: `You have ${permission.concurrency.active} active streams. Maximum is ${permission.concurrency.limit}. Please wait for one to complete.`,
          activeStreams: permission.concurrency.active,
          maxStreams: permission.concurrency.limit,
          requestId,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
        },
      );
    }
  }

  // Get stream ID for concurrency tracking
  const streamId = permission.concurrency.streamId!;

  try {
    const body = (await request.json()) as ChatRequestBody;
    const { messages, modelId, temperature, maxTokens } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      releaseConcurrencySlot(userId, streamId);
      return new Response(
        JSON.stringify({ error: "messages array is required", requestId }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      releaseConcurrencySlot(userId, streamId);
      return new Response(
        JSON.stringify({
          error: "OpenAI API key not configured",
          hint: "Add OPENAI_API_KEY to your .env.local file",
          requestId,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Create a readable stream for SSE with timeout handling
    const encoder = new TextEncoder();
    let streamClosed = false;
    const resolvedModel = getOpenAIModelName(modelId || "openai/gpt-4o-mini");
    
    // Track usage for recording
    let tokenUsage: TokenUsage | undefined;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Create the base generator
          const baseGenerator = streamOpenAICompletion({
            model: modelId || "openai/gpt-4o-mini",
            messages,
            temperature,
            maxTokens,
            signal: request.signal,
          });

          // Wrap with timeout handling
          const timeoutGenerator = withStreamTimeouts(
            baseGenerator,
            STREAM_TIMEOUT_CONFIG,
            request.signal,
          );

          for await (const event of timeoutGenerator) {
            if (streamClosed) break;

            if (event.type === "token") {
              // Send token as Server-Sent Events format
              const data = JSON.stringify({ token: event.content, requestId });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            } else if (event.type === "usage") {
              // Capture usage data for recording
              tokenUsage = event.usage;
            }
          }

          if (!streamClosed) {
            const elapsed = Date.now() - startTime;
            
            // Record usage to database
            if (tokenUsage) {
              await recordUserUsage({
                userId,
                model: resolvedModel,
                provider: "openai",
                promptTokens: tokenUsage.promptTokens,
                completionTokens: tokenUsage.completionTokens,
              });
              
              // Track metrics
              Metrics.streamTokens(tokenUsage.promptTokens, { model: resolvedModel, type: "prompt" });
              Metrics.streamTokens(tokenUsage.completionTokens, { model: resolvedModel, type: "completion" });
            }

            // Log successful completion
            log.info("Stream completed", { 
              model: resolvedModel, 
              durationMs: elapsed,
              promptTokens: tokenUsage?.promptTokens,
              completionTokens: tokenUsage?.completionTokens,
            });
            
            // Track metrics
            Metrics.apiRequestCount({ endpoint: "/api/chat", status: 200 });
            Metrics.apiRequestDuration(elapsed, { endpoint: "/api/chat", status: 200, model: resolvedModel });
            Metrics.streamDuration(elapsed, { model: resolvedModel, status: "done" });

            // Signal completion with usage info
            const doneData = JSON.stringify({
              done: true,
              requestId,
              elapsedMs: elapsed,
              usage: tokenUsage,
            });
            controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            streamClosed = true;
          }
        } catch (error) {
          if (streamClosed) return;

          const elapsed = Date.now() - startTime;
          const { status, message } = getStreamStatusFromError(error);

          // Log error with context
          log.error(`Stream ${status}`, error, { 
            model: resolvedModel, 
            durationMs: elapsed 
          });
          
          // Track metrics
          Metrics.apiError({ endpoint: "/api/chat", errorType: status });
          Metrics.streamDuration(elapsed, { model: resolvedModel, status });
          
          // Report to Sentry (except for cancellations which are user-initiated)
          if (status !== "cancelled") {
            Sentry.captureException(error, {
              tags: { 
                requestId, 
                model: resolvedModel,
                streamStatus: status,
              },
              extra: { elapsed, userId },
            });
          }

          // Send error to client
          const errorData = JSON.stringify({
            error: message,
            status,
            requestId,
            elapsedMs: elapsed,
            ...(error instanceof StreamTimeoutError && {
              timeoutType: error.type,
            }),
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
          streamClosed = true;
        } finally {
          // Always release concurrency slot
          releaseConcurrencySlot(userId, streamId);
        }
      },

      cancel() {
        // Called when client disconnects
        const elapsed = Date.now() - startTime;
        streamClosed = true;
        releaseConcurrencySlot(userId, streamId);
        
        log.info("Client disconnected", { durationMs: elapsed, model: resolvedModel });
        Metrics.streamDuration(elapsed, { model: resolvedModel, status: "cancelled" });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Connection: "keep-alive",
        "X-Request-Id": requestId,
        ...getRateLimitHeaders(permission.rateLimit),
      },
    });
  } catch (error) {
    // Release concurrency slot on error
    releaseConcurrencySlot(userId, streamId);
    
    const elapsed = Date.now() - startTime;
    log.error("Request failed", error, { durationMs: elapsed });
    
    // Track metrics
    Metrics.apiError({ endpoint: "/api/chat", errorType: "server_error" });
    Metrics.apiRequestCount({ endpoint: "/api/chat", status: 500 });
    Metrics.apiRequestDuration(elapsed, { endpoint: "/api/chat", status: 500 });
    
    // Report to Sentry
    Sentry.captureException(error, {
      tags: { requestId },
      extra: { elapsed, userId },
    });

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
        requestId,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId,
        },
      },
    );
  }
}
