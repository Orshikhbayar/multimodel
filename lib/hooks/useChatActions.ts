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

/**
 * Fetch streaming chat completion from our API route
 */
async function fetchStreamingChat(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  modelId: string,
  controller: AbortController,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
) {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, modelId }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

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
          onDone();
          return;
        }
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          if (json.token) {
            onToken(json.token);
          }
          if (json.error) {
            onError(json.error);
            return;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    onDone();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      // Stream was cancelled, not an error
      return;
    }
    onError(error instanceof Error ? error.message : "Unknown error");
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
      conversationId = conversationStore.createConversation("New chat");
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
    apiMessages.push(...historyMessages);
    apiMessages.push({ role: "user", content });

    // Start streaming for each run
    for (const run of runs) {
      // Skip unified run (it's synthesized, not from API)
      if (run.model === "Unified") {
        // For now, just complete unified run with a placeholder
        setTimeout(() => {
          conversationStore.completeRun(
            conversationId!,
            assistantMessage.id,
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
            conversationId!,
            assistantMessage.id,
            run.id,
            token,
          );
        },
        // onDone
        () => {
          const latencyMs = Date.now() - startTime;

          conversationStore.completeRun(
            conversationId!,
            assistantMessage.id,
            run.id,
          );
          if (run.slotId) {
            modelStore.updateSlotStatus(run.slotId, "done");
          }
          streamStore.removeStream(run.id);

          // Track API usage
          const inputTokens = Math.ceil(content.length / 4); // ~4 chars per token estimate
          const outputTokens = Math.ceil(accumulatedText.length / 4);

          usageStore.addRecord({
            timestamp: Date.now(),
            model: slot.modelId,
            inputTokens,
            outputTokens,
            latencyMs,
            estimatedCostUsd: inputTokens * 0.00003 + outputTokens * 0.00006, // GPT-4 pricing estimate
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
        (error) => {
          const latencyMs = Date.now() - startTime;

          conversationStore.markRunError(
            conversationId!,
            assistantMessage.id,
            run.id,
            error,
          );
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

  const stopAllStreams = () => {
    streamStore.abortAllStreams();
  };

  return {
    sendMessage,
    stopAllStreams,
  };
}
