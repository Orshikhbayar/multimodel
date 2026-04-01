import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import * as Sentry from "@sentry/nextjs";
import { streamCompletion } from "@/lib/api/providerRouter";
import type { StreamOptions } from "@/lib/api/providerRouter";
import { estimatePromptTokens, estimateTokens } from "@/lib/api/tokenEstimator";
import {
  withStreamTimeouts,
  STREAM_TIMEOUT_CONFIG,
} from "@/lib/api/streamWithTimeout";
import {
  checkStreamPermissionAsync,
  releaseConcurrencySlot,
  getRateLimitHeaders,
} from "@/lib/rateLimit";
import { createRequestLogger } from "@/lib/logger";
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
import type { ChatMessage } from "@/lib/api/types";
import {
  buildDebateCritiquePrompt,
  buildChainReviewPrompt,
  buildChainVerifyPrompt,
  buildResearchSystemContext,
} from "@/lib/utils/collabPrompts";

export const runtime = "edge";

// ── Types ────────────────────────────────────────────────────────────────────

type CollabMode = "debate" | "chain" | "research";

interface CollabRequestBody {
  mode: CollabMode;
  /** Original user prompt — used to build intermediate prompts */
  prompt: string;
  /** Model IDs in run order */
  modelIds: string[];
  /** One runId per modelId — used to tag SSE events */
  runIds: string[];
  /** Full conversation history (system + history, NOT the current user turn) */
  messages: ChatMessage[];
  conversationId?: string;
  messageId?: string;
  webSearch?: boolean;
}

// SSE event shapes (union discriminated by `type`)
type CollabSSEEvent =
  | { type: "run_start"; runId: string }
  | { type: "token"; runId: string; token: string }
  | {
      type: "run_done";
      runId: string;
      modelId: string;
      elapsedMs: number;
      usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
      costUsd?: number;
    }
  | { type: "run_error"; runId: string; error: string; code?: string }
  | { type: "done" }
  | { type: "error"; error: string; requestId: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

function sse(event: CollabSSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Stream a single model call, emitting SSE events via `emit`.
 * Returns { text, promptTokens, completionTokens } on success.
 * On error emits a run_error event and returns null.
 */
async function streamModel(
  runId: string,
  modelId: string,
  messages: ChatMessage[],
  signal: AbortSignal,
  emit: (event: CollabSSEEvent) => void,
): Promise<{
  text: string;
  promptTokens: number;
  completionTokens: number;
} | null> {
  emit({ type: "run_start", runId });

  const startTime = Date.now();
  let accumulatedText = "";
  let promptTokens = estimatePromptTokens(messages);
  let completionTokens = 0;
  let hadUsageEvent = false;

  try {
    const opts: StreamOptions = { model: modelId, messages, signal };
    const generator = withStreamTimeouts(
      streamCompletion(opts),
      STREAM_TIMEOUT_CONFIG,
      signal,
    );

    for await (const event of generator) {
      if (event.type === "token") {
        accumulatedText += event.content;
        completionTokens += estimateTokens(event.content);
        emit({ type: "token", runId, token: event.content });
      } else if (event.type === "usage") {
        promptTokens = event.usage.promptTokens;
        completionTokens = event.usage.completionTokens;
        hadUsageEvent = true;
      }
    }

    if (!hadUsageEvent) {
      completionTokens = Math.max(1, completionTokens);
    }

    const elapsedMs = Date.now() - startTime;
    const costUsd = estimateTokenCostUsd({
      modelId,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
    });

    emit({
      type: "run_done",
      runId,
      modelId,
      elapsedMs,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      costUsd,
    });

    return { text: accumulatedText, promptTokens, completionTokens };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stream failed";
    emit({ type: "run_error", runId, error: message });
    return null;
  }
}

/** Thin wrapper: start billing hold, call streamModel, finalize hold. */
async function streamModelBilled(
  runId: string,
  modelId: string,
  messages: ChatMessage[],
  signal: AbortSignal,
  emit: (event: CollabSSEEvent) => void,
  sessionUser: { id: string; email: string | null },
  mode: string,
): Promise<{ text: string; resolvedModelId: string } | null> {
  const estimatedPromptTokens = estimatePromptTokens(messages);
  let resolvedModelId = modelId;
  let meteringClosed = false;

  const finalizeMetering = async (
    status: "completed" | "cancelled" | "failed",
    promptTokens: number,
    completionTokens: number,
  ) => {
    if (meteringClosed) return;
    meteringClosed = true;
    try {
      await finalizeUsageRunMetering({
        userId: sessionUser.id,
        userEmail: sessionUser.email,
        runReferenceId: runId,
        modelId: resolvedModelId,
        promptTokens,
        completionTokens,
        status,
      });
    } catch {
      // Best-effort — log and move on so the chain continues
    }
  };

  // Start billing hold
  try {
    const metered = await startUsageRunMetering({
      sessionUser: { id: sessionUser.id, email: sessionUser.email },
      runReferenceId: runId,
      requestedModelId: modelId,
      mode,
      estimatedPromptTokens,
      maxOutputTokens: 2048,
    });
    if (metered) {
      resolvedModelId = metered.modelId;
    }
  } catch (error) {
    // Map billing errors to user-facing messages
    let message = "Billing error";
    let code: string | undefined;

    if (error instanceof SupabaseBillingInsufficientCreditsError) {
      message = "Insufficient credits";
      code = error.code;
    } else if (error instanceof SupabaseBillingUpgradeRequiredError) {
      message = "Upgrade required for this model";
      code = error.code;
    } else if (error instanceof SupabaseBillingQuotaExceededError) {
      message = "Usage quota exceeded";
      code = error.code;
    } else if (error instanceof SupabaseBillingLockedError) {
      message = "Billing is locked";
      code = error.code;
    } else if (error instanceof SupabaseBillingUnavailableError) {
      message = "Billing unavailable";
      code = error.code;
    }

    emit({ type: "run_error", runId, error: message, code });
    return null;
  }

  // Stream model
  const streamResult = await streamModel(
    runId,
    resolvedModelId,
    messages,
    signal,
    emit,
  );

  // Finalize hold
  if (streamResult) {
    await finalizeMetering(
      "completed",
      streamResult.promptTokens,
      streamResult.completionTokens,
    );
    return { text: streamResult.text, resolvedModelId };
  } else {
    await finalizeMetering("failed", estimatedPromptTokens, 0);
    return null;
  }
}

// ── Mode runners ─────────────────────────────────────────────────────────────

async function runDebate(
  modelIds: string[],
  runIds: string[],
  messages: ChatMessage[],
  prompt: string,
  signal: AbortSignal,
  emit: (event: CollabSSEEvent) => void,
  sessionUser: { id: string; email: string | null },
) {
  const [modelA, modelB] = modelIds;
  const [runIdA, runIdB] = runIds;

  if (!modelA || !runIdA) return;

  // Step 1: Stream Model A
  const resultA = await streamModelBilled(
    runIdA,
    modelA,
    messages,
    signal,
    emit,
    sessionUser,
    "collab-debate",
  );

  if (!modelB || !runIdB) return;

  // Step 2: Build critique prompt and stream Model B
  const critiqueContent = resultA?.text
    ? buildDebateCritiquePrompt(prompt, resultA.text)
    : `The previous model could not answer. Please answer the question: ${prompt}`;

  const messagesForB: ChatMessage[] = [
    ...messages.slice(0, -1), // keep system messages, drop last user turn
    { role: "user", content: critiqueContent },
  ];

  await streamModelBilled(
    runIdB,
    modelB,
    messagesForB,
    signal,
    emit,
    sessionUser,
    "collab-debate",
  );
}

async function runChain(
  modelIds: string[],
  runIds: string[],
  messages: ChatMessage[],
  signal: AbortSignal,
  emit: (event: CollabSSEEvent) => void,
  sessionUser: { id: string; email: string | null },
) {
  let lastOutput = "";

  for (let i = 0; i < modelIds.length; i++) {
    const modelId = modelIds[i];
    const runId = runIds[i];
    if (!modelId || !runId) continue;

    let turnMessages: ChatMessage[];

    if (i === 0) {
      // Drafter: receives the original prompt
      turnMessages = messages;
    } else if (i === 1) {
      // Reviewer: receives draft + review instruction
      const reviewContent = buildChainReviewPrompt(lastOutput);
      turnMessages = [
        ...messages.slice(0, -1),
        { role: "user", content: reviewContent },
      ];
    } else {
      // Verifier (i === 2): receives refined + verify instruction
      const verifyContent = buildChainVerifyPrompt(lastOutput);
      turnMessages = [
        ...messages.slice(0, -1),
        { role: "user", content: verifyContent },
      ];
    }

    const result = await streamModelBilled(
      runId,
      modelId,
      turnMessages,
      signal,
      emit,
      sessionUser,
      "collab-chain",
    );

    // Continue chain with last successful output; if this step errored,
    // pass the previous output forward so chain doesn't break completely.
    if (result?.text) {
      lastOutput = result.text;
    }
  }
}

async function runResearch(
  modelIds: string[],
  runIds: string[],
  messages: ChatMessage[],
  webSearch: boolean,
  signal: AbortSignal,
  emit: (event: CollabSSEEvent) => void,
  sessionUser: { id: string; email: string | null },
) {
  let augmentedMessages = messages;

  // If web search is enabled, inject a research-context system message.
  // In a full implementation this would call a search API and inject real results;
  // here we inject a directive so models know they're in research mode.
  if (webSearch) {
    const researchContext = buildResearchSystemContext(
      "[Live web search results would appear here — web search integration pending]",
    );
    const systemMsg = messages.find((m) => m.role === "system");
    if (systemMsg) {
      augmentedMessages = [
        { ...systemMsg, content: `${systemMsg.content}\n\n${researchContext}` },
        ...messages.filter((m) => m.role !== "system"),
      ];
    } else {
      augmentedMessages = [
        { role: "system", content: researchContext },
        ...messages,
      ];
    }
  }

  // Fan out to all models in parallel
  await Promise.all(
    modelIds.map((modelId, i) => {
      const runId = runIds[i];
      if (!runId) return Promise.resolve();
      return streamModelBilled(
        runId,
        modelId,
        augmentedMessages,
        signal,
        emit,
        sessionUser,
        "collab-research",
      );
    }),
  );
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  return new Response(
    JSON.stringify({ error: "Method Not Allowed", allowed: ["POST"] }),
    {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "POST" },
    },
  );
}

export async function POST(request: NextRequest) {
  const requestId = nanoid(10);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return new Response(
      JSON.stringify({ error: "Authentication required", requestId }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const sessionUserId = claims.sub as string;
  const sessionEmail = typeof claims.email === "string" ? claims.email : null;
  const log = createRequestLogger(requestId, sessionUserId);

  Sentry.setUser({ id: sessionUserId });
  Sentry.setTag("requestId", requestId);

  const permission = await checkStreamPermissionAsync(
    sessionUserId,
    undefined,
    { email: sessionEmail },
  );

  if (!permission.allowed) {
    const headers = getRateLimitHeaders(permission.rateLimit);

    if (permission.reason === "rate_limit") {
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
      return new Response(
        JSON.stringify({
          error: "Too many concurrent requests",
          message: `You have ${permission.concurrency.active} active streams. Maximum is ${permission.concurrency.limit}.`,
          activeStreams: permission.concurrency.active,
          maxStreams: permission.concurrency.limit,
          requestId,
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", ...headers },
        },
      );
    }
  }

  const streamId = permission.concurrency.streamId!;

  try {
    const body = (await request.json()) as CollabRequestBody;
    const {
      mode,
      prompt,
      modelIds,
      runIds,
      messages,
      webSearch = false,
    } = body;

    // Validate
    if (!mode || !["debate", "chain", "research"].includes(mode)) {
      releaseConcurrencySlot(sessionUserId, streamId);
      return new Response(
        JSON.stringify({ error: "Invalid mode", requestId }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!Array.isArray(modelIds) || modelIds.length === 0) {
      releaseConcurrencySlot(sessionUserId, streamId);
      return new Response(
        JSON.stringify({ error: "modelIds is required", requestId }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!Array.isArray(runIds) || runIds.length !== modelIds.length) {
      releaseConcurrencySlot(sessionUserId, streamId);
      return new Response(
        JSON.stringify({
          error: "runIds must match modelIds length",
          requestId,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if ((mode === "debate" || mode === "chain") && modelIds.length < 2) {
      releaseConcurrencySlot(sessionUserId, streamId);
      return new Response(
        JSON.stringify({
          error: `${mode} mode requires at least 2 models`,
          requestId,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      releaseConcurrencySlot(sessionUserId, streamId);
      return new Response(
        JSON.stringify({ error: "messages array is required", requestId }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const sessionUser = { id: sessionUserId, email: sessionEmail };
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event: CollabSSEEvent) => {
          controller.enqueue(encoder.encode(sse(event)));
        };

        try {
          if (mode === "debate") {
            await runDebate(
              modelIds,
              runIds,
              messages,
              prompt,
              request.signal,
              emit,
              sessionUser,
            );
          } else if (mode === "chain") {
            await runChain(
              modelIds,
              runIds,
              messages,
              request.signal,
              emit,
              sessionUser,
            );
          } else {
            await runResearch(
              modelIds,
              runIds,
              messages,
              webSearch,
              request.signal,
              emit,
              sessionUser,
            );
          }

          emit({ type: "done" });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Internal server error";
          log.error("Collab stream failed", error, { mode });
          Sentry.captureException(error, { tags: { requestId, mode } });
          emit({ type: "error", error: message, requestId });
        } finally {
          releaseConcurrencySlot(sessionUserId, streamId);
          controller.close();
        }
      },

      cancel() {
        releaseConcurrencySlot(sessionUserId, streamId);
        log.info("Collab stream cancelled by client", { mode });
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
    log.error("Collab request failed before stream", error, {});
    Sentry.captureException(error, { tags: { requestId } });
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
