"use client";

import {
  useConversationStore,
  useModelStore,
  useSettingsStore,
  useStreamStore,
  useWorkspaceStore,
} from "@/lib/stores";
import type { Message, Run, ModelSlot } from "@/lib/types";
import { analytics } from "@/lib/analytics";
import { useUsageStore } from "@/lib/analytics/usage";
import { estimateTokenCostUsd } from "@/lib/billing/estimator";
import { estimateTokens, estimatePromptTokens } from "@/lib/api/tokenEstimator";
import { useBillingStore } from "@/lib/billing/store";
import { useAppSettingsStore } from "@/lib/state/settingsStore";
import { getLocaleResponseInstruction } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/translate";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  createAssistantMessageWithRuns,
  createTurnRecords,
  ensureWorkspaceId,
  getProviderFromModelId,
  updateUserMessageContent,
  upsertConversation,
} from "@/lib/supabase/chatPersistence";
import { generateRuns, UNIFIED_MODEL_NAME } from "@/lib/hooks/runGeneration";
/**
 * Builds a simple system prompt. Visualization and PPTX are handled
 * CLIENT-SIDE — we don't ask the model to output special code blocks
 * because weaker models (GPT-4o-mini) ignore those instructions.
 *
 * For viz: user asks for "visualized" → model responds in markdown →
 * client transforms markdown into interactive HTML via markdownToHtml.ts
 *
 * For PPTX: user asks for "presentation" → model responds in markdown →
 * client parses markdown into slides via markdownToPptx.ts
 */
function buildConsolidatedSystemPrompt(
  userContent: string,
  localeInstruction: string | null,
): string {
  const parts: string[] = ["You are a helpful AI assistant."];

  if (localeInstruction) {
    parts.push(localeInstruction);
  }

  // Tell model to use clear structure (headers + bullets) so client-side
  // transformation produces good results
  const VIZ_TRIGGERS =
    /\b(visualiz|visual|interactive|diagram|chart|dashboard|infographic|flowchart|graph|timeline)\b/i;
  const PPTX_TRIGGERS =
    /\b(presentation|slide|pptx|powerpoint|deck|pitch\s*deck)\b/i;

  if (VIZ_TRIGGERS.test(userContent) || PPTX_TRIGGERS.test(userContent)) {
    parts.push(
      "Structure your response with clear markdown headers (## Section Title) and bullet points. Use ## for each major section. This helps the user navigate your response.",
    );
  }

  return parts.join("\n\n");
}

const MAX_PARALLEL_STREAMS = 2;
const CONCURRENCY_RETRY_DELAYS_MS = [800, 1600] as const;
const DEFAULT_UNIFIED_SYNTHESIS_MODEL_ID = "openai/gpt-5.2";
const AUTO_CHAT_TITLE_MAX_CHARS = 80;
const activeRunSchedulerCancels = new Map<string, Set<() => void>>();

/**
 * Stream result with status information
 */
interface StreamResult {
  status:
    | "done"
    | "cancelled"
    | "timeout"
    | "error"
    | "rate_limited"
    | "concurrency_limited";
  requestId?: string;
  elapsedMs?: number;
  error?: string;
  retryAfter?: number;
  activeStreams?: number;
  maxStreams?: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costUsd?: number;
  code?: string;
  suggestedAction?: "topup" | "upgrade";
  requiredPlanId?: string;
  httpStatus?: number;
}

/**
 * Fetch streaming chat completion from our API route
 * Enhanced with proper handling of rate limits, timeouts, and cancellation
 */
async function fetchStreamingChat(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  modelId: string,
  mode: string,
  projectId: string | null,
  metadata: {
    conversationId?: string;
    messageId: string;
    runId: string;
  },
  controller: AbortController,
  onToken: (token: string) => void,
  onDone: (result: StreamResult) => void,
  onError: (error: string, result: StreamResult) => void,
) {
  let requestId: string | undefined;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        modelId,
        mode,
        projectId,
        conversationId: metadata.conversationId,
        messageId: metadata.messageId,
        runId: metadata.runId,
      }),
      signal: controller.signal,
    });

    // Get request ID from headers
    requestId = response.headers.get("X-Request-Id") ?? undefined;

    // Handle rate limiting and concurrency limiting (both return 429)
    if (response.status === 429) {
      const errorData = await response.json().catch(() => ({}));
      const retryAfter = parseInt(
        response.headers.get("Retry-After") || "60",
        10,
      );

      // Check if it's a concurrency limit vs rate limit
      const isConcurrencyLimit =
        errorData.error === "Too many concurrent requests" ||
        errorData.activeStreams !== undefined;

      onError(errorData.message || errorData.error || "Rate limit exceeded", {
        status: isConcurrencyLimit ? "concurrency_limited" : "rate_limited",
        requestId,
        retryAfter: isConcurrencyLimit ? undefined : retryAfter,
        error: errorData.error,
        activeStreams:
          typeof errorData.activeStreams === "number"
            ? errorData.activeStreams
            : undefined,
        maxStreams:
          typeof errorData.maxStreams === "number"
            ? errorData.maxStreams
            : undefined,
      });
      return;
    }

    if (response.status === 402 || response.status === 403) {
      const errorData = await response.json().catch(() => ({}));
      onError(errorData.error || "Billing error", {
        status: "error",
        requestId,
        error: errorData.error,
        code: typeof errorData.code === "string" ? errorData.code : undefined,
        suggestedAction:
          errorData.suggestedAction === "upgrade" ? "upgrade" : "topup",
        requiredPlanId:
          typeof errorData.requiredPlanId === "string"
            ? errorData.requiredPlanId
            : undefined,
      });
      return;
    }

    if (response.status === 423) {
      const errorData = await response.json().catch(() => ({}));
      onError(errorData.error || "Billing is locked", {
        status: "error",
        requestId,
        error: errorData.error,
        code:
          typeof errorData.code === "string"
            ? errorData.code
            : "BILLING_LOCKED",
      });
      return;
    }

    // Handle other non-stream errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const fallbackError = `API error: ${response.status}`;
      onError(errorData.message || errorData.error || fallbackError, {
        status: "error",
        requestId,
        error:
          typeof errorData.error === "string" ? errorData.error : fallbackError,
        code: typeof errorData.code === "string" ? errorData.code : undefined,
        suggestedAction:
          errorData.suggestedAction === "upgrade" ? "upgrade" : "topup",
        requiredPlanId:
          typeof errorData.requiredPlanId === "string"
            ? errorData.requiredPlanId
            : undefined,
        httpStatus: response.status,
      });
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let lastElapsedMs = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === "data: [DONE]") {
          onDone({
            status: "done",
            requestId,
            elapsedMs: lastElapsedMs,
          });
          return;
        }
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));

          // Update request ID if present
          if (json.requestId) {
            requestId = json.requestId;
          }

          // Track elapsed time
          if (json.elapsedMs) {
            lastElapsedMs = json.elapsedMs;
          }

          // Handle tokens
          if (json.token) {
            onToken(json.token);
          }

          // Handle completion
          if (json.done) {
            onDone({
              status: "done",
              requestId,
              elapsedMs: json.elapsedMs,
              usage: json.usage,
              costUsd:
                typeof json.costUsd === "number" ? json.costUsd : undefined,
            });
            return;
          }

          // Handle errors (including timeouts)
          if (json.error) {
            const status = json.status || "error";
            onError(json.error, {
              status:
                status === "timeout"
                  ? "timeout"
                  : status === "cancelled"
                    ? "cancelled"
                    : "error",
              requestId,
              elapsedMs: json.elapsedMs,
              error: json.error,
            });
            return;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    onDone({
      status: "done",
      requestId,
      elapsedMs: lastElapsedMs,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      // Stream was cancelled by user
      onDone({
        status: "cancelled",
        requestId,
      });
      return;
    }
    onError(error instanceof Error ? error.message : "Unknown error", {
      status: "error",
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

function truncateText(value: string, max = 170) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalized.length > max
    ? `${normalized.slice(0, max - 3).trimEnd()}...`
    : normalized;
}

function sentenceSummary(value: string, fallback: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return fallback;
  const sentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
  return truncateText(sentence, 150);
}

function normalizeTitle(value: string) {
  return value.trim().toLowerCase();
}

function isPlaceholderConversationTitle(
  title: string | undefined,
  locale: string,
) {
  if (!title) return true;

  const placeholders = new Set([
    normalizeTitle(t(locale, "navigation.newChat")),
    normalizeTitle(t(locale, "navigation.untitledChat")),
    normalizeTitle("New chat"),
    normalizeTitle("Untitled chat"),
    normalizeTitle("Шинэ чат"),
    normalizeTitle("Нэргүй чат"),
  ]);

  return placeholders.has(normalizeTitle(title));
}

function buildAutoConversationTitle(message: string, fallback: string) {
  const normalized = message.trim().replace(/\s+/g, " ");
  if (!normalized) return fallback;

  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
  const cleaned = firstSentence.replace(/^[`"'([{]+|[`"')\]}]+$/g, "").trim();
  const source = cleaned || normalized;

  return source.length > AUTO_CHAT_TITLE_MAX_CHARS
    ? `${source.slice(0, AUTO_CHAT_TITLE_MAX_CHARS - 3).trimEnd()}...`
    : source;
}

function joinModelNames(names: string[], locale: string): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) {
    return locale === "mn"
      ? `${names[0]} ба ${names[1]}`
      : `${names[0]} and ${names[1]}`;
  }
  const head = names.slice(0, -1).join(", ");
  const tail = names[names.length - 1];
  return locale === "mn" ? `${head}, ба ${tail}` : `${head}, and ${tail}`;
}

function buildUnifiedAnswerText(
  locale: string,
  perspectiveRuns: Run[],
  isFinal: boolean,
): string {
  const successful = perspectiveRuns.filter(
    (run) => run.status !== "error" && run.text.trim().length > 0,
  );
  if (successful.length === 0) {
    return isFinal
      ? t(locale, "chat.unifiedNoAnswer")
      : t(locale, "chat.unifiedCollecting");
  }

  const modelNames = Array.from(new Set(successful.map((run) => run.model)));
  const lead = isFinal
    ? t(locale, "chat.unifiedLeadFinal", {
        models: joinModelNames(modelNames, locale),
      })
    : t(locale, "chat.unifiedLeadDraft", {
        models: joinModelNames(modelNames, locale),
      });

  const bullets = successful.slice(0, 3).map((run) => {
    const preview = sentenceSummary(run.text, t(locale, "chat.thinking"));
    return `- ${run.model}: ${preview}`;
  });

  return `${lead}\n\n${bullets.join("\n")}`;
}

function pickUnifiedSynthesisModelId(slots: ModelSlot[]): string {
  const enabledSlots = slots.filter((slot) => slot.enabled);
  const openAISlot = enabledSlots.find((slot) =>
    slot.modelId.startsWith("openai/"),
  );
  return openAISlot?.modelId ?? DEFAULT_UNIFIED_SYNTHESIS_MODEL_ID;
}

function buildUnifiedSynthesisPrompt(
  locale: string,
  userPrompt: string,
  perspectiveRuns: Run[],
) {
  const localeInstruction = getLocaleResponseInstruction(locale);
  const perspectives = perspectiveRuns
    .map(
      (run, index) =>
        `### Perspective ${index + 1} (${run.model})\n${run.text.trim()}`,
    )
    .join("\n\n");

  const messages: Array<{
    role: "system" | "user";
    content: string;
  }> = [
    {
      role: "system",
      content:
        "Synthesize multiple model drafts into one final answer. Keep concrete implementation details. When code is needed, include complete runnable code blocks and do not summarize code away. Always use fenced code blocks with explicit language tags (for example: ```html, ```javascript, ```python).",
    },
  ];

  if (localeInstruction) {
    messages.push({ role: "system", content: localeInstruction });
  }

  messages.push({
    role: "user",
    content: [
      `Original user request:\n${userPrompt.trim()}`,
      "Model drafts:",
      perspectives,
      "Return one unified final answer that resolves conflicts and picks the strongest technical approach.",
    ].join("\n\n"),
  });

  return messages;
}

function buildUnifiedFallbackText(
  locale: string,
  successfulRuns: Run[],
): string {
  if (successfulRuns.length === 0) {
    return t(locale, "chat.unifiedNoAnswer");
  }

  const bestRun = successfulRuns.reduce((best, current) => {
    return current.text.length > best.text.length ? current : best;
  }, successfulRuns[0]);

  return `${t(locale, "chat.unifiedLeadFinal", { models: bestRun.model })}\n\n${bestRun.text}`;
}

function toLoggableError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (error && typeof error === "object") {
    const candidate = error as {
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      message?: unknown;
      status?: unknown;
    };

    return {
      message:
        typeof candidate.message === "string"
          ? candidate.message
          : "Unknown error",
      code: typeof candidate.code === "string" ? candidate.code : undefined,
      details:
        typeof candidate.details === "string" ? candidate.details : undefined,
      hint: typeof candidate.hint === "string" ? candidate.hint : undefined,
      status:
        typeof candidate.status === "number"
          ? candidate.status
          : typeof candidate.status === "string"
            ? candidate.status
            : undefined,
    };
  }

  return { message: String(error) };
}

/**
 * Hook for chat actions - bridges all stores together
 */
export function useChatActions() {
  const conversationStore = useConversationStore();
  const modelStore = useModelStore();
  const settingsStore = useSettingsStore();
  const streamStore = useStreamStore();
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const usageStore = useUsageStore();
  const locale = useAppSettingsStore((state) => state.locale);
  const isE2eBypass =
    process.env.NEXT_PUBLIC_E2E_BYPASS === "true" ||
    process.env.NEXT_PUBLIC_E2E_BYPASS === "1";
  const supabase = isE2eBypass ? null : createSupabaseBrowserClient();

  const resolveWorkspaceId = async () => {
    if (isE2eBypass) return "e2e-workspace";
    if (workspaceId) return workspaceId;

    if (!supabase) return "e2e-workspace";
    const nextWorkspaceId = await ensureWorkspaceId(supabase);
    useWorkspaceStore.getState().setWorkspaceId(nextWorkspaceId);
    return nextWorkspaceId;
  };

  const ensureServerConversation = async (
    conversationId: string,
    title: string,
    projectId?: string | null,
  ) => {
    if (isE2eBypass) return conversationId;
    if (!supabase) return undefined;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return undefined;
    }

    const resolvedWorkspaceId = await resolveWorkspaceId();
    await upsertConversation(supabase, {
      id: conversationId,
      workspaceId: resolvedWorkspaceId,
      title,
      projectId,
    });

    return conversationId;
  };

  const startRuns = async (
    conversationId: string,
    content: string,
    mode: string,
    projectId: string | null,
    slots: ModelSlot[],
    runs: Run[],
    assistantMessageId: string,
    apiMessages: { role: "system" | "user" | "assistant"; content: string }[],
    serverConversationId?: string,
  ) => {
    const unifiedRun = runs.find((run) => run.model === UNIFIED_MODEL_NAME);
    const perspectiveRuns = runs.filter(
      (run) => run.model !== UNIFIED_MODEL_NAME,
    );
    const perspectiveRunIds = perspectiveRuns.map((run) => run.id);
    const slotByRunId = new Map<string, ModelSlot>();
    perspectiveRuns.forEach((run) => {
      const slot = slots.find((entry) => entry.slotId === run.slotId);
      if (slot) {
        slotByRunId.set(run.id, slot);
      }
    });

    const schedulerState = { cancelled: false };
    const cancelScheduler = () => {
      schedulerState.cancelled = true;
    };
    const conversationCancels =
      activeRunSchedulerCancels.get(conversationId) ?? new Set<() => void>();
    conversationCancels.add(cancelScheduler);
    activeRunSchedulerCancels.set(conversationId, conversationCancels);

    const getCurrentPerspectiveRuns = () => {
      const conversation = useConversationStore
        .getState()
        .conversations.find((entry) => entry.id === conversationId);
      const assistantMessage = conversation?.messages.find(
        (entry) => entry.id === assistantMessageId,
      );
      if (!assistantMessage?.runs) return [] as Run[];

      return assistantMessage.runs.filter((entry) =>
        perspectiveRunIds.includes(entry.id),
      );
    };

    const syncUnifiedRun = () => {
      if (!unifiedRun) return;

      const conversation = useConversationStore
        .getState()
        .conversations.find((entry) => entry.id === conversationId);
      const assistantMessage = conversation?.messages.find(
        (entry) => entry.id === assistantMessageId,
      );
      if (!assistantMessage?.runs) return;
      const currentUnifiedRun = assistantMessage.runs.find(
        (entry) => entry.id === unifiedRun.id,
      );
      if (
        currentUnifiedRun?.status === "done" &&
        currentUnifiedRun.text.trim()
      ) {
        return;
      }

      const currentPerspectiveRuns = getCurrentPerspectiveRuns();
      const anyPending = currentPerspectiveRuns.some(
        (entry) => entry.status === "streaming" || entry.status === "queued",
      );
      const mergedText = buildUnifiedAnswerText(
        locale,
        currentPerspectiveRuns,
        !anyPending,
      );

      conversationStore.completeRun(
        conversationId,
        assistantMessageId,
        unifiedRun.id,
        {
          text: mergedText,
          status: anyPending ? "streaming" : "done",
        },
      );
    };

    if (unifiedRun) {
      conversationStore.completeRun(
        conversationId,
        assistantMessageId,
        unifiedRun.id,
        {
          text: t(locale, "chat.unifiedCollecting"),
          status: "streaming",
        },
      );
    }

    perspectiveRuns.forEach((run) => {
      conversationStore.completeRun(
        conversationId,
        assistantMessageId,
        run.id,
        {
          status: "queued",
          text: t(locale, "chat.waitingForSlot"),
        },
      );
      if (run.slotId) {
        modelStore.updateSlotStatus(run.slotId, "idle");
      }
    });
    syncUnifiedRun();

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });

    const runSingleStreamAttempt = async (run: Run, slot: ModelSlot) => {
      const controller = new AbortController();
      streamStore.registerStream(run.id, controller);
      const startTime = Date.now();
      let accumulatedText = "";

      conversationStore.completeRun(
        conversationId,
        assistantMessageId,
        run.id,
        {
          status: "streaming",
          text: "",
        },
      );
      if (run.slotId) {
        modelStore.updateSlotStatus(run.slotId, "streaming");
      }
      syncUnifiedRun();

      const result = await new Promise<StreamResult>((resolve) => {
        fetchStreamingChat(
          apiMessages,
          slot.modelId,
          mode,
          projectId,
          {
            conversationId: serverConversationId,
            messageId: assistantMessageId,
            runId: run.id,
          },
          controller,
          (token) => {
            accumulatedText += token;
            conversationStore.appendRunChunk(
              conversationId,
              assistantMessageId,
              run.id,
              token,
            );
          },
          (doneResult) => resolve(doneResult),
          (_error, errorResult) => resolve(errorResult),
        );
      });

      streamStore.removeStream(run.id);
      return {
        result,
        accumulatedText,
        latencyMs: result.elapsedMs ?? Date.now() - startTime,
      };
    };

    const finalizeRun = (
      run: Run,
      slot: ModelSlot,
      result: StreamResult,
      accumulatedText: string,
      latencyMs: number,
    ) => {
      if (result.status === "cancelled") {
        conversationStore.completeRun(
          conversationId,
          assistantMessageId,
          run.id,
          {
            status: "done",
            interrupted: true,
            latencyMs,
          },
        );
        if (run.slotId) {
          modelStore.updateSlotStatus(run.slotId, "done");
        }
        syncUnifiedRun();
        return;
      }

      if (result.status === "done") {
        conversationStore.completeRun(
          conversationId,
          assistantMessageId,
          run.id,
          {
            latencyMs,
            costUsd: result.costUsd,
            tokens: result.usage
              ? {
                  prompt: result.usage.promptTokens,
                  completion: result.usage.completionTokens,
                  total: result.usage.totalTokens,
                }
              : undefined,
          },
        );
        if (run.slotId) {
          modelStore.updateSlotStatus(run.slotId, "done");
        }
        syncUnifiedRun();

        const inputTokens =
          result.usage?.promptTokens ?? estimateTokens(content);
        const outputTokens =
          result.usage?.completionTokens ?? estimateTokens(accumulatedText);
        const estimatedCostUsd =
          result.costUsd ??
          estimateTokenCostUsd({
            modelId: slot.modelId,
            inputTokens,
            outputTokens,
          });

        usageStore.addRecord({
          timestamp: Date.now(),
          model: slot.modelId,
          inputTokens,
          outputTokens,
          latencyMs,
          estimatedCostUsd,
        });

        analytics.trackApiUsage({
          model: slot.modelId,
          latencyMs,
          inputTokens,
          outputTokens,
          success: true,
        });
        return;
      }

      if (result.status === "concurrency_limited") {
        const details =
          typeof result.activeStreams === "number" &&
          typeof result.maxStreams === "number"
            ? ` (${result.activeStreams}/${result.maxStreams})`
            : "";
        conversationStore.markRunError(
          conversationId,
          assistantMessageId,
          run.id,
          `${t(locale, "errors.tooManyConcurrent")}${details}`,
        );
      } else if (result.status === "rate_limited") {
        const retryMessage = result.retryAfter
          ? t(locale, "errors.rateLimitedSeconds", {
              seconds: result.retryAfter,
            })
          : t(locale, "errors.rateLimitedLater");
        conversationStore.markRunError(
          conversationId,
          assistantMessageId,
          run.id,
          retryMessage,
        );
      } else if (result.status === "timeout") {
        conversationStore.markRunError(
          conversationId,
          assistantMessageId,
          run.id,
          t(locale, "errors.requestTimedOut"),
        );
      } else {
        conversationStore.markRunError(
          conversationId,
          assistantMessageId,
          run.id,
          result.error ?? t(locale, "errors.somethingWentWrong"),
        );

        if (result.code === "INSUFFICIENT_CREDITS") {
          if (result.suggestedAction === "upgrade") {
            const requiredPlanId =
              result.requiredPlanId === "plus" ||
              result.requiredPlanId === "pro" ||
              result.requiredPlanId === "team" ||
              result.requiredPlanId === "free"
                ? result.requiredPlanId
                : undefined;

            useBillingStore.getState().openUpgradeModal({
              reason: t(locale, "billing.upgradeNeededAction"),
              requiredPlanId,
            });
          } else {
            useBillingStore.getState().openOutOfCreditsModal();
          }
        }
      }

      if (run.slotId) {
        modelStore.updateSlotStatus(run.slotId, "error");
      }
      syncUnifiedRun();

      analytics.trackApiUsage({
        model: slot.modelId,
        latencyMs,
        success: false,
      });
    };

    const runWithRetry = async (run: Run, slot: ModelSlot) => {
      let attempt = 0;
      while (!schedulerState.cancelled) {
        const { result, accumulatedText, latencyMs } =
          await runSingleStreamAttempt(run, slot);

        const shouldRetryConcurrency =
          result.status === "concurrency_limited" &&
          attempt < CONCURRENCY_RETRY_DELAYS_MS.length &&
          !schedulerState.cancelled;
        if (shouldRetryConcurrency) {
          conversationStore.completeRun(
            conversationId,
            assistantMessageId,
            run.id,
            {
              status: "queued",
              text: t(locale, "chat.waitingForSlot"),
            },
          );
          if (run.slotId) {
            modelStore.updateSlotStatus(run.slotId, "idle");
          }
          syncUnifiedRun();
          await wait(CONCURRENCY_RETRY_DELAYS_MS[attempt]);
          attempt += 1;
          continue;
        }

        finalizeRun(run, slot, result, accumulatedText, latencyMs);
        break;
      }
    };

    const runUnifiedSynthesis = async () => {
      if (!unifiedRun || schedulerState.cancelled) return;

      const currentPerspectiveRuns = getCurrentPerspectiveRuns();
      const successfulRuns = currentPerspectiveRuns.filter(
        (run) => run.status !== "error" && run.text.trim().length > 0,
      );

      if (successfulRuns.length === 0) {
        conversationStore.completeRun(
          conversationId,
          assistantMessageId,
          unifiedRun.id,
          {
            status: "done",
            text: t(locale, "chat.unifiedNoAnswer"),
          },
        );
        return;
      }

      const synthesisModelId = pickUnifiedSynthesisModelId(slots);
      const synthesisMessages = buildUnifiedSynthesisPrompt(
        locale,
        content,
        successfulRuns,
      );
      const controller = new AbortController();
      const synthesisStart = Date.now();
      let synthesizedText = "";

      streamStore.registerStream(unifiedRun.id, controller);
      conversationStore.completeRun(
        conversationId,
        assistantMessageId,
        unifiedRun.id,
        { status: "streaming", text: "" },
      );

      const result = await new Promise<StreamResult>((resolve) => {
        fetchStreamingChat(
          synthesisMessages,
          synthesisModelId,
          mode,
          projectId,
          {
            conversationId: serverConversationId,
            messageId: assistantMessageId,
            runId: unifiedRun.id,
          },
          controller,
          (token) => {
            synthesizedText += token;
            conversationStore.appendRunChunk(
              conversationId,
              assistantMessageId,
              unifiedRun.id,
              token,
            );
          },
          (doneResult) => resolve(doneResult),
          (_error, errorResult) => resolve(errorResult),
        );
      });

      streamStore.removeStream(unifiedRun.id);
      const latencyMs = result.elapsedMs ?? Date.now() - synthesisStart;

      if (result.status === "cancelled") {
        conversationStore.completeRun(
          conversationId,
          assistantMessageId,
          unifiedRun.id,
          {
            status: "done",
            interrupted: true,
            latencyMs,
            text:
              synthesizedText.trim().length > 0
                ? synthesizedText
                : buildUnifiedFallbackText(locale, successfulRuns),
          },
        );
        return;
      }

      if (result.status === "done") {
        const finalText =
          synthesizedText.trim().length > 0
            ? synthesizedText
            : buildUnifiedFallbackText(locale, successfulRuns);

        conversationStore.completeRun(
          conversationId,
          assistantMessageId,
          unifiedRun.id,
          {
            status: "done",
            text: finalText,
            latencyMs,
            costUsd: result.costUsd,
            tokens: result.usage
              ? {
                  prompt: result.usage.promptTokens,
                  completion: result.usage.completionTokens,
                  total: result.usage.totalTokens,
                }
              : undefined,
          },
        );

        const inputTokens =
          result.usage?.promptTokens ?? estimatePromptTokens(synthesisMessages);
        const outputTokens =
          result.usage?.completionTokens ?? estimateTokens(finalText);
        const estimatedCostUsd =
          result.costUsd ??
          estimateTokenCostUsd({
            modelId: synthesisModelId,
            inputTokens,
            outputTokens,
          });

        usageStore.addRecord({
          timestamp: Date.now(),
          model: synthesisModelId,
          inputTokens,
          outputTokens,
          latencyMs,
          estimatedCostUsd,
        });

        analytics.trackApiUsage({
          model: synthesisModelId,
          latencyMs,
          inputTokens,
          outputTokens,
          success: true,
        });
        return;
      }

      conversationStore.completeRun(
        conversationId,
        assistantMessageId,
        unifiedRun.id,
        {
          status: "done",
          text: buildUnifiedFallbackText(locale, successfulRuns),
        },
      );

      analytics.trackApiUsage({
        model: synthesisModelId,
        latencyMs,
        success: false,
      });
    };

    const applyGuardrailFlagging = () => {
      // Guardrail flagging removed with workflow packs feature
    };

    let cursor = 0;
    const workerCount = Math.min(MAX_PARALLEL_STREAMS, perspectiveRuns.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (!schedulerState.cancelled) {
        const run = perspectiveRuns[cursor];
        cursor += 1;
        if (!run) break;

        const slot = slotByRunId.get(run.id);
        if (!slot) {
          conversationStore.markRunError(
            conversationId,
            assistantMessageId,
            run.id,
            t(locale, "errors.somethingWentWrong"),
          );
          syncUnifiedRun();
          continue;
        }

        await runWithRetry(run, slot);
      }
    });

    try {
      await Promise.all(workers);
      await runUnifiedSynthesis();
      applyGuardrailFlagging();
    } finally {
      const cancelSet = activeRunSchedulerCancels.get(conversationId);
      if (cancelSet) {
        cancelSet.delete(cancelScheduler);
        if (cancelSet.size === 0) {
          activeRunSchedulerCancels.delete(conversationId);
        }
      }
      syncUnifiedRun();
    }
  };

  const sendMessage = async (content: string, projectId?: string) => {
    if (!content.trim()) return;

    // Track message sent
    analytics.trackMessageSent(
      modelStore.slots
        .filter((s) => s.enabled)
        .map((s) => s.modelId)
        .join(","),
      content.length,
    );

    // Get or create conversation
    let conversationId = conversationStore.currentConversationId;
    const targetProjectId = projectId ?? null;
    if (conversationId) {
      const currentConversation = conversationStore.conversations.find(
        (conversation) => conversation.id === conversationId,
      );
      const currentProjectId = currentConversation?.projectId ?? null;
      if (currentProjectId !== targetProjectId) {
        conversationId = null;
      }
    }

    if (!conversationId) {
      conversationId = conversationStore.createConversation(
        t(locale, "navigation.untitledChat"),
        projectId,
      );
      conversationStore.setCurrentConversation(conversationId);
    }

    const conversationBeforeMessage = conversationStore.conversations.find(
      (conversation) => conversation.id === conversationId,
    );
    const shouldAutoTitle =
      (conversationBeforeMessage?.messages.length ?? 0) === 0 &&
      isPlaceholderConversationTitle(conversationBeforeMessage?.title, locale);
    if (shouldAutoTitle) {
      conversationStore.updateConversationTitle(
        conversationId,
        buildAutoConversationTitle(
          content,
          t(locale, "navigation.untitledChat"),
        ),
      );
    }

    const { slots } = modelStore;
    const { mode, instructions } = settingsStore;

    // Create user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: Date.now(),
    };

    // Create runs for each enabled model
    const runs = generateRuns(mode, slots);

    // Create assistant message with runs
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      runs,
    };

    // Add messages to conversation
    conversationStore.addMessages(conversationId, [
      userMessage,
      assistantMessage,
    ]);

    let serverConversationId: string | undefined = isE2eBypass
      ? conversationId
      : undefined;

    // Persist turn metadata in Supabase before streaming starts.
    if (supabase) {
      try {
        const currentConversation = useConversationStore
          .getState()
          .conversations.find(
            (conversation) => conversation.id === conversationId,
          );

        serverConversationId = await ensureServerConversation(
          conversationId,
          currentConversation?.title ?? t(locale, "navigation.untitledChat"),
          currentConversation?.projectId,
        );

        if (serverConversationId) {
          const runRows = runs
            .filter((run) => run.model !== UNIFIED_MODEL_NAME)
            .map((run) => {
              const slot = slots.find((entry) => entry.slotId === run.slotId);
              if (!slot) return null;

              return {
                id: run.id,
                modelId: slot.modelId,
                provider: getProviderFromModelId(slot.modelId),
              };
            })
            .filter(
              (
                value,
              ): value is { id: string; modelId: string; provider: string } =>
                Boolean(value),
            );

          await createTurnRecords(supabase, {
            conversationId: serverConversationId,
            userMessageId: userMessage.id,
            assistantMessageId: assistantMessage.id,
            userContent: content,
            runs: runRows,
          });
        }
      } catch (error) {
        console.error("[useChatActions] Failed to persist turn pre-stream", {
          conversationId,
          assistantMessageId: assistantMessage.id,
          userMessageId: userMessage.id,
          error: toLoggableError(error),
        });
      }
    }

    // Build message history for API
    const conversation = useConversationStore
      .getState()
      .conversations.find((c) => c.id === conversationId);
    const historyMessages = (conversation?.messages ?? [])
      .filter(
        (m) =>
          m.id !== userMessage.id &&
          (m.role === "user" || (m.role === "assistant" && m.runs?.[0]?.text)),
      )
      .slice(-10) // Last 10 messages for context
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.role === "user" ? m.content : (m.runs?.[0]?.text ?? ""),
      }));

    // Build ONE consolidated system message (locale + viz + pptx)
    const localeInstruction = getLocaleResponseInstruction(locale);
    const consolidatedPrompt = buildConsolidatedSystemPrompt(
      content,
      localeInstruction,
    );
    const apiMessages: {
      role: "system" | "user" | "assistant";
      content: string;
    }[] = [];
    if (instructions.trim()) {
      apiMessages.push({
        role: "system",
        content: `${instructions}\n\n${consolidatedPrompt}`,
      });
    } else {
      apiMessages.push({ role: "system", content: consolidatedPrompt });
    }
    apiMessages.push(...historyMessages);
    apiMessages.push({
      role: "user",
      content,
    });

    try {
      await startRuns(
        conversationId!,
        content,
        mode,
        targetProjectId,
        slots,
        runs,
        assistantMessage.id,
        apiMessages,
        serverConversationId,
      );
    } catch (error) {
      console.error("[useChatActions] Failed to start runs", {
        conversationId,
        assistantMessageId: assistantMessage.id,
        error: toLoggableError(error),
      });
      for (const run of runs) {
        conversationStore.markRunError(
          conversationId,
          assistantMessage.id,
          run.id,
          t(locale, "errors.somethingWentWrong"),
        );
        if (run.slotId) {
          modelStore.updateSlotStatus(run.slotId, "error");
        }
      }
    }
  };

  const respondToEditedMessage = async (
    conversationId: string,
    userMessageId: string,
    content: string,
  ) => {
    if (!content.trim()) return;

    // Track message sent
    analytics.trackMessageSent(
      modelStore.slots
        .filter((s) => s.enabled)
        .map((s) => s.modelId)
        .join(","),
      content.length,
    );

    const { slots } = modelStore;
    const { mode, instructions } = settingsStore;

    // Create runs for each enabled model
    const runs = generateRuns(mode, slots);

    // Create assistant message with runs and replace the current turn
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      runs,
    };

    conversationStore.replaceTurnAssistant(conversationId, userMessageId, [
      assistantMessage,
    ]);

    let serverConversationId: string | undefined = isE2eBypass
      ? conversationId
      : undefined;

    if (supabase) {
      try {
        const currentConversation = useConversationStore
          .getState()
          .conversations.find(
            (conversation) => conversation.id === conversationId,
          );

        serverConversationId = await ensureServerConversation(
          conversationId,
          currentConversation?.title ?? t(locale, "navigation.untitledChat"),
          currentConversation?.projectId,
        );

        if (serverConversationId) {
          await updateUserMessageContent(supabase, {
            messageId: userMessageId,
            content,
          });

          const runRows = runs
            .filter((run) => run.model !== UNIFIED_MODEL_NAME)
            .map((run) => {
              const slot = slots.find((entry) => entry.slotId === run.slotId);
              if (!slot) return null;
              return {
                id: run.id,
                modelId: slot.modelId,
                provider: getProviderFromModelId(slot.modelId),
              };
            })
            .filter(
              (
                value,
              ): value is { id: string; modelId: string; provider: string } =>
                Boolean(value),
            );

          await createAssistantMessageWithRuns(supabase, {
            conversationId: serverConversationId,
            assistantMessageId: assistantMessage.id,
            runs: runRows,
          });
        }
      } catch (error) {
        console.error("[useChatActions] Failed to persist edited turn", {
          conversationId,
          assistantMessageId: assistantMessage.id,
          userMessageId,
          error: toLoggableError(error),
        });
      }
    }

    const conversation = useConversationStore
      .getState()
      .conversations.find((c) => c.id === conversationId);
    const historyMessages = (conversation?.messages ?? [])
      .filter(
        (m) =>
          m.id !== userMessageId &&
          (m.role === "user" || (m.role === "assistant" && m.runs?.[0]?.text)),
      )
      .slice(-10)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.role === "user" ? m.content : (m.runs?.[0]?.text ?? ""),
      }));

    // Build ONE consolidated system message (locale + viz + pptx)
    const localeInstruction2 = getLocaleResponseInstruction(locale);
    const consolidatedPrompt2 = buildConsolidatedSystemPrompt(
      content,
      localeInstruction2,
    );
    const apiMessages: {
      role: "system" | "user" | "assistant";
      content: string;
    }[] = [];
    if (instructions.trim()) {
      apiMessages.push({
        role: "system",
        content: `${instructions}\n\n${consolidatedPrompt2}`,
      });
    } else {
      apiMessages.push({ role: "system", content: consolidatedPrompt2 });
    }
    apiMessages.push(...historyMessages);
    apiMessages.push({
      role: "user",
      content,
    });

    await startRuns(
      conversationId,
      content,
      mode,
      conversation?.projectId ?? null,
      slots,
      runs,
      assistantMessage.id,
      apiMessages,
      serverConversationId,
    );
  };

  const stopAllStreams = () => {
    const conversationId = conversationStore.currentConversationId;
    if (conversationId) {
      const cancels = activeRunSchedulerCancels.get(conversationId);
      cancels?.forEach((cancel) => cancel());
      activeRunSchedulerCancels.delete(conversationId);
    } else {
      activeRunSchedulerCancels.forEach((cancels) => {
        cancels.forEach((cancel) => cancel());
      });
      activeRunSchedulerCancels.clear();
    }
    streamStore.abortAllStreams();
    if (conversationId) {
      conversationStore.interruptStreamingRuns(conversationId);
    }
    modelStore.slots.forEach((slot) => {
      if (slot.status === "streaming") {
        modelStore.updateSlotStatus(slot.slotId, "done");
      }
    });
  };

  return {
    sendMessage,
    respondToEditedMessage,
    stopAllStreams,
  };
}
