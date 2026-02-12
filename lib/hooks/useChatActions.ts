import { nanoid } from "nanoid";
import {
  useConversationStore,
  useModelStore,
  useSettingsStore,
  useStreamStore,
} from "@/lib/stores";
import type { Message, Run, InteractionMode, ModelSlot } from "@/lib/types";
import { analytics } from "@/lib/analytics";
import { useUsageStore } from "@/lib/analytics/usage";
import { useBillingStore } from "@/lib/billing/store";
import { useAppSettingsStore } from "@/lib/state/settingsStore";
import {
  getLocaleResponseInstruction,
  normalizeLocale,
} from "@/lib/i18n/locale";

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
    | "concurrency_limited"
    | "quota_exceeded"
    | "insufficient_credits"
    | "billing_unavailable";
  requestId?: string;
  elapsedMs?: number;
  error?: string;
  retryAfter?: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Fetch streaming chat completion from our API route
 * Enhanced with proper handling of rate limits, timeouts, and cancellation
 */
async function fetchStreamingChat(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  modelId: string,
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
      body: JSON.stringify({ messages, modelId }),
      signal: controller.signal,
    });

    // Get request ID from headers
    requestId = response.headers.get("X-Request-Id") ?? undefined;

    // Handle billing failures (402 Payment Required)
    if (response.status === 402) {
      const errorData = await response.json().catch(() => ({}));
      const status =
        errorData.code === "INSUFFICIENT_CREDITS"
          ? "insufficient_credits"
          : "quota_exceeded";
      onError(errorData.message || errorData.error || "Billing check failed", {
        status,
        requestId,
        error: errorData.error,
      });
      return;
    }

    if (response.status === 503) {
      const errorData = await response.json().catch(() => ({}));
      onError(errorData.error || "Billing unavailable", {
        status: "billing_unavailable",
        requestId,
        error: errorData.error,
      });
      return;
    }

    // Handle rate limiting and concurrency limiting (both return 429)
    if (response.status === 429) {
      const errorData = await response.json().catch(() => ({}));
      const retryAfter = parseInt(
        response.headers.get("Retry-After") || "60",
        10,
      );
      
      // Check if it's a concurrency limit vs rate limit
      const isConcurrencyLimit = errorData.error === "Too many concurrent requests" || 
                                  errorData.activeStreams !== undefined;
      
      onError(errorData.message || errorData.error || "Rate limit exceeded", {
        status: isConcurrencyLimit ? "concurrency_limited" : "rate_limited",
        requestId,
        retryAfter: isConcurrencyLimit ? undefined : retryAfter,
        error: errorData.error,
      });
      return;
    }

    // Handle other errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API error: ${response.status}`);
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
            });
            return;
          }

          // Handle errors (including timeouts)
          if (json.error) {
            const status = json.status || "error";
            const isBillingUnavailable = json.code === "BILLING_UNAVAILABLE";
            onError(json.error, {
              status: isBillingUnavailable
                ? "billing_unavailable"
                : status === "timeout"
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

/**
 * Generate runs based on mode and enabled slots
 */
function generateRuns(mode: InteractionMode, slots: ModelSlot[]): Run[] {
  const enabledSlots = slots.filter((slot) => slot.enabled);
  const pickedSlots = enabledSlots.length ? enabledSlots : slots.slice(0, 1);

  const baseRuns: Run[] = pickedSlots.map((slot) => ({
    id: nanoid(),
    model: slot.label,
    slotId: slot.slotId,
    status: "streaming" as const,
    text: "",
  }));

  // For ensemble/debate modes, add a unified response at the end
  if (mode === "ensemble" || mode === "debate") {
    baseRuns.push({
      id: nanoid(),
      model: "Unified",
      status: "streaming" as const,
      text: "",
    });
  }

  return baseRuns;
}

/**
 * Hook for chat actions - bridges all stores together
 */
export function useChatActions() {
  const conversationStore = useConversationStore();
  const modelStore = useModelStore();
  const settingsStore = useSettingsStore();
  const streamStore = useStreamStore();
  const usageStore = useUsageStore();
  const locale = useAppSettingsStore((state) => state.locale);
  const openOutOfCreditsModal = useBillingStore(
    (state) => state.openOutOfCreditsModal,
  );

  const startRuns = async (
    conversationId: string,
    content: string,
    slots: ModelSlot[],
    runs: Run[],
    assistantMessageId: string,
    apiMessages: { role: "system" | "user" | "assistant"; content: string }[],
  ) => {
    // Update slot statuses
    runs.forEach((run) => {
      if (run.slotId) {
        modelStore.updateSlotStatus(run.slotId, "streaming");
      }
    });

    // Start streaming for each run
    for (const run of runs) {
      // Skip unified run (it's synthesized, not from API)
      if (run.model === "Unified") {
        // For now, just complete unified run with a placeholder
        setTimeout(() => {
          conversationStore.completeRun(
            conversationId,
            assistantMessageId,
            run.id,
            {
              text: "Synthesis of all model responses would appear here.",
              status: "done",
            },
          );
        }, 1500);
        continue;
      }

      const slot = slots.find((s) => s.slotId === run.slotId);
      if (!slot) continue;

      const controller = new AbortController();
      streamStore.registerStream(run.id, controller);

      // Track API request timing
      const startTime = Date.now();
      let accumulatedText = "";

      fetchStreamingChat(
        apiMessages,
        slot.modelId,
        controller,
        // onToken
        (token) => {
          accumulatedText += token;
          conversationStore.appendRunChunk(
            conversationId,
            assistantMessageId,
            run.id,
            token,
          );
        },
        // onDone
        (result) => {
          const latencyMs = result.elapsedMs ?? Date.now() - startTime;

          // Handle cancelled streams (mark as interrupted, not error)
          if (result.status === "cancelled") {
            conversationStore.completeRun(
              conversationId,
              assistantMessageId,
              run.id,
              {
                status: "done",
                interrupted: true,
              },
            );
            if (run.slotId) {
              modelStore.updateSlotStatus(run.slotId, "done");
            }
            streamStore.removeStream(run.id);
            return;
          }

          conversationStore.completeRun(
            conversationId,
            assistantMessageId,
            run.id,
          );
          if (run.slotId) {
            modelStore.updateSlotStatus(run.slotId, "done");
          }
          streamStore.removeStream(run.id);

          // Track API usage - prefer real usage data from API
          const inputTokens = result.usage?.promptTokens ?? Math.ceil(content.length / 4);
          const outputTokens = result.usage?.completionTokens ?? Math.ceil(accumulatedText.length / 4);
          
          // Calculate cost based on model pricing
          const costPerInputToken = 0.00015 / 1000; // gpt-4o-mini input
          const costPerOutputToken = 0.0006 / 1000; // gpt-4o-mini output
          const estimatedCostUsd = inputTokens * costPerInputToken + outputTokens * costPerOutputToken;

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
        },
        // onError
        (error, result) => {
          const latencyMs = result.elapsedMs ?? Date.now() - startTime;

          if (result.status === "insufficient_credits") {
            openOutOfCreditsModal();
            conversationStore.markRunError(
              conversationId,
              assistantMessageId,
              run.id,
              "Insufficient credits. Please top up or change plan.",
            );
          }
          // Handle quota exceeded
          else if (result.status === "quota_exceeded") {
            conversationStore.markRunError(
              conversationId,
              assistantMessageId,
              run.id,
              "Token quota exceeded. Please upgrade your plan or wait for reset.",
            );
          }
          // Handle billing service failures
          else if (result.status === "billing_unavailable") {
            conversationStore.markRunError(
              conversationId,
              assistantMessageId,
              run.id,
              "Billing temporarily unavailable. Please try again in a moment.",
            );
          }
          // Handle concurrency limiting
          else if (result.status === "concurrency_limited") {
            conversationStore.markRunError(
              conversationId,
              assistantMessageId,
              run.id,
              "Too many concurrent requests. Please wait for current responses to complete.",
            );
          }
          // Handle rate limiting
          else if (result.status === "rate_limited") {
            const retryMessage = result.retryAfter
              ? `Rate limited. Please wait ${result.retryAfter} seconds.`
              : "Rate limited. Please try again later.";

            conversationStore.markRunError(
              conversationId,
              assistantMessageId,
              run.id,
              retryMessage,
            );
          }
          // Handle timeouts
          else if (result.status === "timeout") {
            conversationStore.markRunError(
              conversationId,
              assistantMessageId,
              run.id,
              "Request timed out. The response took too long.",
            );
          }
          // Handle other errors
          else {
            conversationStore.markRunError(
              conversationId,
              assistantMessageId,
              run.id,
              error,
            );
          }

          if (run.slotId) {
            modelStore.updateSlotStatus(run.slotId, "error");
          }
          streamStore.removeStream(run.id);

          analytics.trackApiUsage({
            model: slot.modelId,
            latencyMs,
            success: false,
          });
        },
      );
    }
  };

  const sendMessage = async (content: string) => {
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
    if (!conversationId) {
      conversationId = conversationStore.createConversation(
        normalizeLocale(locale) === "mn" ? "Шинэ чат" : "New chat",
      );
    }

    const { slots } = modelStore;
    const { mode, instructions } = settingsStore;

    // Create user message
    const userMessage: Message = {
      id: nanoid(),
      role: "user",
      content,
      createdAt: Date.now(),
    };

    // Create runs for each enabled model
    const runs = generateRuns(mode, slots);

    // Create assistant message with runs
    const assistantMessage: Message = {
      id: nanoid(),
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

    // Update slot statuses
    runs.forEach((run) => {
      if (run.slotId) {
        modelStore.updateSlotStatus(run.slotId, "streaming");
      }
    });

    // Build message history for API
    const conversation = conversationStore.conversations.find(
      (c) => c.id === conversationId,
    );
    const historyMessages = (conversation?.messages ?? [])
      .filter(
        (m) =>
          m.role === "user" || (m.role === "assistant" && m.runs?.[0]?.text),
      )
      .slice(-10) // Last 10 messages for context
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.role === "user" ? m.content : (m.runs?.[0]?.text ?? ""),
      }));

    // Add system instructions if provided
    const apiMessages: {
      role: "system" | "user" | "assistant";
      content: string;
    }[] = [];
    if (instructions.trim()) {
      apiMessages.push({ role: "system", content: instructions });
    }
    const localeInstruction = getLocaleResponseInstruction(locale);
    if (localeInstruction) {
      apiMessages.push({ role: "system", content: localeInstruction });
    }
    apiMessages.push(...historyMessages);
    apiMessages.push({ role: "user", content });

    await startRuns(
      conversationId!,
      content,
      slots,
      runs,
      assistantMessage.id,
      apiMessages,
    );
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
      id: nanoid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      runs,
    };

    conversationStore.replaceTurnAssistant(conversationId, userMessageId, [
      assistantMessage,
    ]);

    const conversation = useConversationStore
      .getState()
      .conversations.find((c) => c.id === conversationId);
    const historyMessages = (conversation?.messages ?? [])
      .filter(
        (m) =>
          m.role === "user" || (m.role === "assistant" && m.runs?.[0]?.text),
      )
      .slice(-10)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.role === "user" ? m.content : (m.runs?.[0]?.text ?? ""),
      }));

    const apiMessages: {
      role: "system" | "user" | "assistant";
      content: string;
    }[] = [];
    if (instructions.trim()) {
      apiMessages.push({ role: "system", content: instructions });
    }
    const localeInstruction = getLocaleResponseInstruction(locale);
    if (localeInstruction) {
      apiMessages.push({ role: "system", content: localeInstruction });
    }
    apiMessages.push(...historyMessages);
    apiMessages.push({ role: "user", content });

    await startRuns(
      conversationId,
      content,
      slots,
      runs,
      assistantMessage.id,
      apiMessages,
    );
  };

  const stopAllStreams = () => {
    const conversationId = conversationStore.currentConversationId;
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
