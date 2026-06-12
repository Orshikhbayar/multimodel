import { NextRequest, after } from "next/server";
import { nanoid } from "nanoid";
import * as Sentry from "@sentry/nextjs";
import { streamCompletion, type StreamOptions } from "@/lib/api/providerRouter";
import type { TokenUsage } from "@/lib/api/openai";
import { estimatePromptTokens, estimateTokens } from "@/lib/api/tokenEstimator";
import {
  withStreamTimeouts,
  StreamTimeoutError,
  STREAM_TIMEOUT_CONFIG,
  getStreamStatusFromError,
} from "@/lib/api/streamWithTimeout";
import {
  checkStreamPermissionAsync,
  releaseConcurrencySlot,
  getRateLimitHeaders,
} from "@/lib/rateLimit";
import { createRequestLogger } from "@/lib/logger";
import Metrics from "@/lib/metrics";
import type { ChatMessage } from "@/lib/api/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { getProviderFromModelId } from "@/lib/supabase/chatPersistence";
import { estimateTokenCostUsd } from "@/lib/billing/estimator";
import {
  finalizeUsageRunMetering,
  startUsageRunMetering,
  SupabaseBillingInsufficientCreditsError,
  SupabaseBillingLockedError,
  SupabaseBillingQuotaExceededError,
  SupabaseBillingUnavailableError,
  SupabaseBillingUpgradeRequiredError,
} from "@/lib/billing/supabaseService";

interface ChatRequestBody {
  messages: ChatMessage[];
  modelId: string;
  mode?: string;
  projectId?: string | null;
  temperature?: number;
  maxTokens?: number;
  conversationId?: string;
  messageId?: string;
  runId?: string;
}

function estimatePromptTokensFromMessages(messages: ChatMessage[]) {
  // Uses language-aware heuristic from tokenEstimator (handles CJK, code, etc.)
  return estimatePromptTokens(messages);
}

// Env var that must be set for each provider. The key check runs against the
// RESOLVED model (after billing auto-routing), not a hardcoded provider — a
// deploy with only ANTHROPIC_API_KEY must not 500 on Claude requests.
const PROVIDER_ENV_KEYS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  xai: "XAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

export async function GET() {
  return new Response(
    JSON.stringify({ error: "Method Not Allowed", allowed: ["POST"] }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        Allow: "POST",
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const requestId = nanoid(10);
  const startTime = Date.now();

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    Metrics.apiRequestCount({ endpoint: "/api/chat", status: 401 });
    return new Response(
      JSON.stringify({ error: "Authentication required", requestId }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const sessionUserId = claims.sub;
  const sessionEmail = typeof claims.email === "string" ? claims.email : null;
  const log = createRequestLogger(requestId, sessionUserId);

  Sentry.setUser({ id: sessionUserId });
  Sentry.setTag("requestId", requestId);

  const permission = await checkStreamPermissionAsync(
    sessionUserId,
    undefined,
    {
      email: sessionEmail,
    },
  );

  if (!permission.allowed) {
    const headers = getRateLimitHeaders(permission.rateLimit);

    if (permission.reason === "rate_limit") {
      log.info("Rate limit exceeded", {
        resetIn: permission.rateLimit.resetIn,
      });
      Metrics.rateLimitHit({ userId: sessionUserId, type: "rate" });
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
      log.info("Concurrency limit exceeded", {
        active: permission.concurrency.active,
      });
      Metrics.rateLimitHit({ userId: sessionUserId, type: "concurrency" });
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

  const streamId = permission.concurrency.streamId!;

  // Hoisted so the outer catch can release the billing hold if anything throws
  // after startUsageRunMetering creates a DB record but before the stream starts.
  let outerMeteringRunId: string | null = null;
  let outerMeteringModelId = "openai/gpt-4o-mini";
  let outerMeteringClosed = false;

  try {
    const body = (await request.json()) as ChatRequestBody;
    const {
      messages,
      modelId,
      mode,
      projectId,
      temperature,
      maxTokens,
      conversationId,
      messageId,
      runId,
    } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      releaseConcurrencySlot(sessionUserId, streamId);
      return new Response(
        JSON.stringify({ error: "messages array is required", requestId }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // ── Content size guards ───────────────────────────────────────────────
    // Without these, a single malformed request can trigger a 200K-token
    // upstream call and generate a huge bill before any billing check runs.
    const MAX_MESSAGES = 100;
    const MAX_MESSAGE_CHARS = 32_000;
    const MAX_TOTAL_CHARS = 500_000;

    if (messages.length > MAX_MESSAGES) {
      releaseConcurrencySlot(sessionUserId, streamId);
      return new Response(
        JSON.stringify({
          error: "Request too large",
          message: `Maximum ${MAX_MESSAGES} messages per request.`,
          requestId,
        }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      );
    }

    const oversizedMessage = messages.find(
      (m) =>
        typeof m.content === "string" && m.content.length > MAX_MESSAGE_CHARS,
    );
    if (oversizedMessage) {
      releaseConcurrencySlot(sessionUserId, streamId);
      return new Response(
        JSON.stringify({
          error: "Request too large",
          message: `Individual messages must be under ${MAX_MESSAGE_CHARS.toLocaleString()} characters.`,
          requestId,
        }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      );
    }

    const totalChars = messages.reduce(
      (sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0),
      0,
    );
    if (totalChars > MAX_TOTAL_CHARS) {
      releaseConcurrencySlot(sessionUserId, streamId);
      return new Response(
        JSON.stringify({
          error: "Request too large",
          message: `Total conversation size must be under ${MAX_TOTAL_CHARS.toLocaleString()} characters.`,
          requestId,
        }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      );
    }

    const hasProjectScope = Object.prototype.hasOwnProperty.call(
      body,
      "projectId",
    );
    if (
      hasProjectScope &&
      projectId !== null &&
      projectId !== undefined &&
      typeof projectId !== "string"
    ) {
      releaseConcurrencySlot(sessionUserId, streamId);
      return new Response(
        JSON.stringify({
          error: "projectId must be a string or null",
          requestId,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (hasProjectScope && conversationId) {
      const { data: conversation, error: conversationError } = await supabase
        .from("conversations")
        .select("id,project_id")
        .eq("id", conversationId)
        .maybeSingle();

      if (conversationError) {
        releaseConcurrencySlot(sessionUserId, streamId);
        return new Response(
          JSON.stringify({
            error: "Failed to validate conversation scope",
            requestId,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      if (!conversation) {
        releaseConcurrencySlot(sessionUserId, streamId);
        return new Response(
          JSON.stringify({ error: "Conversation not found", requestId }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }

      const isScopeMismatch =
        projectId === null
          ? conversation.project_id !== null
          : projectId !== undefined
            ? conversation.project_id !== projectId
            : false;

      if (isScopeMismatch) {
        releaseConcurrencySlot(sessionUserId, streamId);
        return new Response(
          JSON.stringify({
            error: "Conversation scope mismatch",
            requestId,
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    let resolvedModelId = modelId || "openai/gpt-4o-mini";
    const meteringRunReferenceId = runId ?? requestId;
    outerMeteringRunId = meteringRunReferenceId;
    const estimatedPromptTokens = estimatePromptTokensFromMessages(messages);
    let meteringClosed = false;

    try {
      const metered = await startUsageRunMetering({
        sessionUser: {
          id: sessionUserId,
          email: sessionEmail,
        },
        runReferenceId: meteringRunReferenceId,
        requestedModelId: resolvedModelId,
        mode,
        estimatedPromptTokens,
        maxOutputTokens: maxTokens ?? 2048,
      });

      if (metered) {
        resolvedModelId = metered.modelId;
      }
    } catch (error) {
      releaseConcurrencySlot(sessionUserId, streamId);

      if (error instanceof SupabaseBillingUpgradeRequiredError) {
        return new Response(
          JSON.stringify({
            error: "Upgrade required for this model",
            code: error.code,
            requiredPlanId: error.requiredPlanId,
            suggestedAction: "upgrade",
            requestId,
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }

      if (error instanceof SupabaseBillingQuotaExceededError) {
        return new Response(
          JSON.stringify({
            error: "Usage quota exceeded",
            code: error.code,
            reason: error.reason,
            resetAt: error.resetAt.toISOString(),
            requestId,
          }),
          {
            status: 429,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (error instanceof SupabaseBillingInsufficientCreditsError) {
        return new Response(
          JSON.stringify({
            error: "Insufficient credits",
            code: error.code,
            availableCreditsUsd: Number(
              (error.availableCreditsInt / 100).toFixed(2),
            ),
            neededCreditsUsd: Number((error.neededCreditsInt / 100).toFixed(2)),
            suggestedAction: error.suggestedAction,
            requestId,
          }),
          { status: 402, headers: { "Content-Type": "application/json" } },
        );
      }

      if (error instanceof SupabaseBillingLockedError) {
        return new Response(
          JSON.stringify({
            error: "Billing is locked",
            code: error.code,
            reason: error.lockReason ?? null,
            requestId,
          }),
          { status: 423, headers: { "Content-Type": "application/json" } },
        );
      }

      if (error instanceof SupabaseBillingUnavailableError) {
        return new Response(
          JSON.stringify({
            error: "Billing unavailable",
            code: error.code,
            requestId,
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }

      throw error;
    }

    outerMeteringModelId = resolvedModelId;

    const resolvedProvider = getProviderFromModelId(resolvedModelId);

    const finalizeMetering = async (
      status: "completed" | "cancelled" | "failed",
      promptTokens: number,
      completionTokens: number,
      failureReason?: string,
    ) => {
      if (meteringClosed) return;
      meteringClosed = true;
      outerMeteringClosed = true;

      try {
        await finalizeUsageRunMetering({
          userId: sessionUserId,
          userEmail: sessionEmail,
          runReferenceId: meteringRunReferenceId,
          modelId: resolvedModelId,
          promptTokens,
          completionTokens,
          status,
          failureReason,
        });
      } catch (finalizeError) {
        log.error("Metering finalization failed", finalizeError, {
          model: resolvedModelId,
          status,
        });
      }
    };

    // Provider key check happens AFTER metering so it sees the final
    // auto-routed model — and must release the hold metering just created.
    const requiredEnvKey = PROVIDER_ENV_KEYS[resolvedProvider];
    if (requiredEnvKey && !process.env[requiredEnvKey]) {
      await finalizeMetering("failed", 0, 0, "provider_api_key_missing");
      releaseConcurrencySlot(sessionUserId, streamId);
      return new Response(
        JSON.stringify({
          error: `${resolvedProvider} API key not configured`,
          code: "provider_key_missing",
          hint: `Add ${requiredEnvKey} to your .env.local file`,
          requestId,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (conversationId && runId) {
      const { error: upsertErr } = await supabase.from("model_runs").upsert(
        {
          id: runId,
          conversation_id: conversationId,
          message_id: messageId ?? null,
          model: resolvedModelId,
          provider: resolvedProvider,
          status: "running",
        },
        { onConflict: "id" },
      );
      if (upsertErr) {
        log.warn("model_runs upsert failed; stream will continue", {
          error: upsertErr,
          runId,
        });
      }
    }

    const encoder = new TextEncoder();
    let streamClosed = false;
    let fallbackCompletionTokens = 0;
    let accumulatedText = "";
    // For metrics/logging: use the model ID directly rather than a provider-specific
    // resolved name, since each adapter handles its own name mapping internally.
    const resolvedModel = resolvedModelId;

    let tokenUsage: TokenUsage | undefined;

    // cancel() used to fire finalizeMetering as a dangling promise. Vercel
    // may suspend the function once the response settles, killing that write
    // and leaving the credit hold locked. Any pending cancel-path cleanup is
    // resolved into this deferred, which after() awaits below — keeping the
    // function alive until the writes land. First resolve wins: the normal
    // completion/error paths resolve with nothing (their writes are awaited
    // inside start() before the stream closes).
    let settleStreamCleanup!: (cleanup?: Promise<unknown>) => void;
    const streamCleanupSettled = new Promise<unknown>((resolve) => {
      settleStreamCleanup = resolve;
    });

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const streamOptions: StreamOptions = {
            model: resolvedModelId,
            messages,
            temperature,
            maxTokens,
            signal: request.signal,
          };
          const baseGenerator = streamCompletion(streamOptions);

          const timeoutGenerator = withStreamTimeouts(
            baseGenerator,
            STREAM_TIMEOUT_CONFIG,
            request.signal,
          );

          for await (const event of timeoutGenerator) {
            if (streamClosed) break;

            if (event.type === "token") {
              fallbackCompletionTokens += estimateTokens(event.content);
              accumulatedText += event.content;
              const data = JSON.stringify({ token: event.content, requestId });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            } else if (event.type === "usage") {
              tokenUsage = event.usage;
            }
          }

          if (!streamClosed) {
            const elapsed = Date.now() - startTime;
            const promptTokens =
              tokenUsage?.promptTokens ?? estimatedPromptTokens;
            const completionTokens =
              tokenUsage?.completionTokens ??
              Math.max(1, fallbackCompletionTokens);
            const costUsd = estimateTokenCostUsd({
              modelId: resolvedModelId,
              inputTokens: promptTokens,
              outputTokens: completionTokens,
            });

            await finalizeMetering("completed", promptTokens, completionTokens);

            if (conversationId && runId) {
              await supabase
                .from("model_runs")
                .update({
                  message_id: messageId ?? null,
                  status: "completed",
                  output_text: accumulatedText,
                  input_tokens: promptTokens,
                  output_tokens: completionTokens,
                  cost_usd: Number(costUsd.toFixed(6)),
                  latency_ms: elapsed,
                  error_text: null,
                })
                .eq("id", runId)
                .eq("conversation_id", conversationId);
            }

            Metrics.streamTokens(promptTokens, {
              model: resolvedModel,
              type: "prompt",
            });
            Metrics.streamTokens(completionTokens, {
              model: resolvedModel,
              type: "completion",
            });

            log.info("Stream completed", {
              model: resolvedModel,
              durationMs: elapsed,
              promptTokens,
              completionTokens,
            });

            Metrics.apiRequestCount({ endpoint: "/api/chat", status: 200 });
            Metrics.apiRequestDuration(elapsed, {
              endpoint: "/api/chat",
              status: 200,
              model: resolvedModel,
            });
            Metrics.streamDuration(elapsed, {
              model: resolvedModel,
              status: "done",
            });

            const doneData = JSON.stringify({
              done: true,
              requestId,
              elapsedMs: elapsed,
              usage: {
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens,
              },
              costUsd,
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

          log.error(`Stream ${status}`, error, {
            model: resolvedModel,
            durationMs: elapsed,
          });

          Metrics.apiError({ endpoint: "/api/chat", errorType: status });
          Metrics.streamDuration(elapsed, { model: resolvedModel, status });

          const errorPromptTokens =
            tokenUsage?.promptTokens ?? estimatedPromptTokens;
          const errorCompletionTokens =
            tokenUsage?.completionTokens ??
            Math.max(0, fallbackCompletionTokens);

          await finalizeMetering(
            status === "cancelled" ? "cancelled" : "failed",
            errorPromptTokens,
            errorCompletionTokens,
            message,
          );

          if (conversationId && runId) {
            const failedStatus =
              status === "cancelled" ? "completed" : "failed";
            await supabase
              .from("model_runs")
              .update({
                message_id: messageId ?? null,
                status: failedStatus,
                output_text: accumulatedText,
                input_tokens: errorPromptTokens,
                output_tokens: errorCompletionTokens,
                latency_ms: elapsed,
                error_text: status === "cancelled" ? null : message,
              })
              .eq("id", runId)
              .eq("conversation_id", conversationId);
          }

          if (status !== "cancelled") {
            Sentry.captureException(error, {
              tags: {
                requestId,
                model: resolvedModel,
                streamStatus: status,
              },
              extra: { elapsed, userId: sessionUserId },
            });
          }

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
          releaseConcurrencySlot(sessionUserId, streamId);
          settleStreamCleanup();
        }
      },

      cancel() {
        const elapsed = Date.now() - startTime;
        streamClosed = true;
        releaseConcurrencySlot(sessionUserId, streamId);

        const cancelPromptTokens =
          tokenUsage?.promptTokens ?? estimatedPromptTokens;
        const cancelCompletionTokens =
          tokenUsage?.completionTokens ?? Math.max(0, fallbackCompletionTokens);

        const cleanupWork: Promise<unknown>[] = [
          finalizeMetering(
            "cancelled",
            cancelPromptTokens,
            cancelCompletionTokens,
            "client_cancelled",
          ),
        ];

        if (conversationId && runId) {
          cleanupWork.push(
            Promise.resolve(
              supabase
                .from("model_runs")
                .update({
                  message_id: messageId ?? null,
                  status: "completed",
                  output_text: accumulatedText,
                  input_tokens: cancelPromptTokens,
                  output_tokens: cancelCompletionTokens,
                  latency_ms: elapsed,
                  error_text: null,
                })
                .eq("id", runId)
                .eq("conversation_id", conversationId),
            ),
          );
        }

        // Hand the pending writes to after() so the function isn't
        // suspended before they complete (allSettled: cleanup must not
        // throw into the runtime).
        settleStreamCleanup(Promise.allSettled(cleanupWork));

        log.info("Client disconnected", {
          durationMs: elapsed,
          model: resolvedModel,
        });
        Metrics.streamDuration(elapsed, {
          model: resolvedModel,
          status: "cancelled",
        });
      },
    });

    // Keeps the serverless function alive until any cancel-path cleanup
    // (billing finalization, model_runs update) has landed.
    after(() => streamCleanupSettled);

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
    releaseConcurrencySlot(sessionUserId, streamId);

    // Best-effort: finalize billing hold if the stream never started.
    if (!outerMeteringClosed && outerMeteringRunId) {
      try {
        await finalizeUsageRunMetering({
          userId: sessionUserId,
          userEmail: sessionEmail,
          runReferenceId: outerMeteringRunId,
          modelId: outerMeteringModelId,
          promptTokens: 0,
          completionTokens: 0,
          status: "failed",
          failureReason: "pre_stream_server_error",
        });
        outerMeteringClosed = true;
      } catch (finalizeErr) {
        log.error("Outer-catch metering cleanup failed", finalizeErr, {});
      }
    }

    const elapsed = Date.now() - startTime;
    log.error("Request failed", error, { durationMs: elapsed });

    Metrics.apiError({ endpoint: "/api/chat", errorType: "server_error" });
    Metrics.apiRequestCount({ endpoint: "/api/chat", status: 500 });
    Metrics.apiRequestDuration(elapsed, { endpoint: "/api/chat", status: 500 });

    Sentry.captureException(error, {
      tags: { requestId },
      extra: { elapsed, userId: sessionUserId },
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
