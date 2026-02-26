import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useChatActions } from "@/lib/hooks/useChatActions";
import { useConversationStore, useModelStore, useStreamStore } from "@/lib/stores";

function sseResponse() {
  const body = [
    `data: ${JSON.stringify({ token: "hello", requestId: "req-1" })}\n\n`,
    `data: ${JSON.stringify({
      done: true,
      requestId: "req-1",
      elapsedMs: 10,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      costUsd: 0.001,
    })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "X-Request-Id": "req-1",
    },
  });
}

describe("useChatActions behavior", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_E2E_BYPASS", "true");
    useConversationStore.getState().resetConversations();
    useModelStore.getState().resetSlots();
    useStreamStore.setState({ activeStreams: new Map() });
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse()));
  });

  it("ignores empty messages", async () => {
    const { result } = renderHook(() => useChatActions());

    await act(async () => {
      await result.current.sendMessage("   ");
    });

    expect(useConversationStore.getState().conversations).toHaveLength(0);
  });

  it("sends a message and appends assistant response", async () => {
    const { result } = renderHook(() => useChatActions());

    await act(async () => {
      await result.current.sendMessage("hello world");
    });

    await waitFor(() => {
      const conversation = useConversationStore.getState().conversations[0];
      expect(conversation.messages.length).toBeGreaterThanOrEqual(2);
    });

    const conversation = useConversationStore.getState().conversations[0];
    expect(conversation.messages[0].role).toBe("user");
    expect(conversation.messages[1].role).toBe("assistant");
  });

  it("auto-generates a title from the first user message", async () => {
    const { result } = renderHook(() => useChatActions());

    await act(async () => {
      await result.current.sendMessage("Draft a release checklist for launch day.");
    });

    await waitFor(() => {
      const conversation = useConversationStore.getState().conversations[0];
      expect(conversation.title).toBe("Draft a release checklist for launch day.");
    });
  });

  it("stops active streams", () => {
    const { result } = renderHook(() => useChatActions());
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, "abort");

    act(() => {
      useStreamStore.getState().registerStream("run-1", controller);
      result.current.stopAllStreams();
    });

    expect(abortSpy).toHaveBeenCalled();
  });
});
