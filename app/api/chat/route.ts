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
import { createRequestLogger } from "@/lib/logger";
import Metrics from "@/lib/metrics";
import type { ChatMessage } from "@/lib/api/types";
import {
  BillingUnavailableError,
  InsufficientCreditsError,
  checkQuota,
  ensureBillingUser,
  estimatePromptTokensFromMessages,
  refundUsageHold,
  reserveUsageHold,
  resetPeriodIfNeeded,
  settleUsageHold,
  type UsageHold,
} from "@/lib/billing/service";

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
  const requestId = nanoid(10);
  const startTime = Date.now();

  const session = await auth();
  if (!session?.user?.id) {
    Metrics.apiRequestCount({ endpoint: "/api/chat", status: 401 });
    return new Response(
      JSON.stringify({ error: "Authentication required", requestId }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const sessionUserId = session.user.id;
  const log = createRequestLogger(requestId, sessionUserId);

  Sentry.setUser({ id: sessionUserId });
  Sentry.setTag("requestId", requestId);

  let billingUserId = sessionUserId;

  try {
    const billingUser = await ensureBillingUser({
      id: sessionUserId,
      email: session.user.email,
      name: session.user.name,
    });

    const refreshedUser = await resetPeriodIfNeeded(billingUser.id);
    billingUserId = refreshedUser.id;

    const quota = await checkQuota(refreshedUser.id, refreshedUser.planId);
    if (!quota.allowed) {
      log.info("Quota exceeded", {
        used: quota.used,
        limit: quota.limit,
        reason: quota.reason,
      });
      Metrics.rateLimitHit({ userId: sessionUserId, type: "quota" });
      Metrics.apiRequestCount({ endpoint: "/api/chat", status: 402 });

      const resetTime = quota.resetAt.toISOString();
      return new Response(
        JSON.stringify({
          error: "Quota exceeded",
          code: "QUOTA_EXCEEDED",
          message:
            quota.reason === "monthly"
              ? `You've used ${quota.used.toLocaleString()} of ${quota.limit.toLocaleString()} tokens this month.`
              : `You've used ${quota.used.toLocaleString()} of ${quota.limit.toLocaleString()} tokens today.`,
          used: quota.used,
          limit: quota.limit,
          resetAt: resetTime,
          requestId,
        }),
        {
          status: 402,
          headers: {
            "Content-Type": "application/json",
            "X-Quota-Limit": quota.limit.toString(),
            "X-Quota-Remaining": "0",
            "X-Quota-Reset": resetTime,
          },
        },
      );
    }
  } catch (error) {
    log.error("Billing unavailable during quota check", error);
    Metrics.apiError({ endpoint: "/api/chat", errorType: "billing_unavailable" });
    Metrics.apiRequestCount({ endpoint: "/api/chat", status: 503 });

    return new Response(
      JSON.stringify({
        error: "Billing unavailable",
        code: "BILLING_UNAVAILABLE",
        requestId,
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const permission = checkStreamPermission(sessionUserId);

  if (!permission.allowed) {
    const headers = getRateLimitHeaders(permission.rateLimit);

    if (permission.reason === "rate_limit") {
      log.info("Rate limit exceeded", { resetIn: permission.rateLimit.resetIn });
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
      log.info("Concurrency limit exceeded", { active: permission.concurrency.active });
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
  let hold: UsageHold | null = null;

  try {
    const body = (await request.json()) as ChatRequestBody;
    const { messages, modelId, temperature, maxTokens } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      releaseConcurrencySlot(sessionUserId, streamId);
      return new Response(
        JSON.stringify({ error: "messages array is required", requestId }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      releaseConcurrencySlot(sessionUserId, streamId);
      return new Response(
        JSON.stringify({
          error: "OpenAI API key not configured",
          hint: "Add OPENAI_API_KEY to your .env.local file",
          requestId,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      hold = await reserveUsageHold({
        userId: billingUserId,
        referenceId: `chat:${requestId}`,
        modelId: modelId || "openai/gpt-4o-mini",
        estimatedPromptTokens: estimatePromptTokensFromMessages(messages),
        maxOutputTokens: maxTokens ?? 2048,
      });
    } catch (error) {
      releaseConcurrencySlot(sessionUserId, streamId);

      if (error instanceof InsufficientCreditsError) {
        return new Response(
          JSON.stringify({
            error: "Insufficient credits",
            code: "INSUFFICIENT_CREDITS",
            availableCreditsUsd: Number((error.availableCreditsCents / 100).toFixed(2)),
            requestId,
          }),
          {
            status: 402,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          error: "Billing unavailable",
          code: "BILLING_UNAVAILABLE",
          requestId,
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const encoder = new TextEncoder();
    let streamClosed = false;
    let holdSettled = false;
    let fallbackCompletionTokens = 0;
    const resolvedModel = getOpenAIModelName(modelId || "openai/gpt-4o-mini");
    const estimatedPromptTokens = estimatePromptTokensFromMessages(messages);

    let tokenUsage: TokenUsage | undefined;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const baseGenerator = streamOpenAICompletion({
            model: modelId || "openai/gpt-4o-mini",
            messages,
            temperature,
            maxTokens,
            signal: request.signal,
          });

          const timeoutGenerator = withStreamTimeouts(
            baseGenerator,
            STREAM_TIMEOUT_CONFIG,
            request.signal,
          );

          for await (const event of timeoutGenerator) {
            if (streamClosed) break;

            if (event.type === "token") {
              fallbackCompletionTokens += Math.max(1, Math.ceil(event.content.length / 4));
              const data = JSON.stringify({ token: event.content, requestId });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            } else if (event.type === "usage") {
              tokenUsage = event.usage;
            }
          }

          if (!streamClosed) {
            const elapsed = Date.now() - startTime;

            const promptTokens = tokenUsage?.promptTokens ?? estimatedPromptTokens;
            const completionTokens =
              tokenUsage?.completionTokens ?? Math.max(1, fallbackCompletionTokens);

            await settleUsageHold({
              userId: billingUserId,
              hold: hold!,
              modelId: resolvedModel,
              provider: "openai",
              promptTokens,
              completionTokens,
            });
            holdSettled = true;

            Metrics.streamTokens(promptTokens, { model: resolvedModel, type: "prompt" });
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
            Metrics.streamDuration(elapsed, { model: resolvedModel, status: "done" });

            const doneData = JSON.stringify({
              done: true,
              requestId,
              elapsedMs: elapsed,
              usage: {
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens,
              },
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

          if (hold && !holdSettled) {
            try {
              await refundUsageHold({
                userId: billingUserId,
                hold,
                reason: `stream_${status}`,
              });
              holdSettled = true;
            } catch (refundError) {
              log.error("Failed to refund hold", refundError, {
                requestId,
                holdId: hold.id,
              });
            }
          }

          Metrics.apiError({ endpoint: "/api/chat", errorType: status });
          Metrics.streamDuration(elapsed, { model: resolvedModel, status });

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
            error:
              error instanceof BillingUnavailableError
                ? "Billing unavailable"
                : message,
            code:
              error instanceof BillingUnavailableError
                ? "BILLING_UNAVAILABLE"
                : undefined,
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
        }
      },

      cancel() {
        const elapsed = Date.now() - startTime;
        streamClosed = true;
        releaseConcurrencySlot(sessionUserId, streamId);

        if (hold && !holdSettled) {
          const activeHold = hold;
          void refundUsageHold({
            userId: billingUserId,
            hold: activeHold,
            reason: "client_cancel",
          })
            .then(() => {
              holdSettled = true;
            })
            .catch((error) => {
              log.error("Failed to refund hold after cancel", error, {
                requestId,
                holdId: activeHold.id,
              });
            });
        }

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
    releaseConcurrencySlot(sessionUserId, streamId);

    if (hold) {
      try {
        await refundUsageHold({
          userId: billingUserId,
          hold,
          reason: "request_failure",
        });
      } catch (refundError) {
        log.error("Failed to refund hold in request catch", refundError, {
          requestId,
          holdId: hold.id,
        });
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

    const isBillingUnavailable = error instanceof BillingUnavailableError;

    return new Response(
      JSON.stringify({
        error: isBillingUnavailable
          ? "Billing unavailable"
          : error instanceof Error
            ? error.message
            : "Internal server error",
        code: isBillingUnavailable ? "BILLING_UNAVAILABLE" : undefined,
        requestId,
      }),
      {
        status: isBillingUnavailable ? 503 : 500,
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId,
        },
      },
    );
  }
}
