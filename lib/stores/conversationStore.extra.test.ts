import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("zustand/middleware", async () => {
  const actual =
    await vi.importActual<typeof import("zustand/middleware")>(
      "zustand/middleware",
    );
  return {
    ...actual,
    persist: (config: unknown) => config,
    createJSONStorage: () => ({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }),
  };
});

const { useConversationStore } = await import("@/lib/stores/conversationStore");

describe("conversationStore extra coverage", () => {
  beforeEach(() => {
    const current = useConversationStore.getState();
    useConversationStore.setState({
      conversations: [],
      currentConversationId: null,
      projects: current.projects,
    });
  });

  it("updates message content only when changed", () => {
    let conversationId = "";

    act(() => {
      conversationId = useConversationStore
        .getState()
        .createConversation("Title");
      useConversationStore.getState().addMessages(conversationId, [
        {
          id: "msg-1",
          role: "user",
          content: "old",
          createdAt: Date.now(),
        },
      ]);
    });

    const beforeEditedAt =
      useConversationStore.getState().conversations[0].messages[0].editedAt;

    act(() => {
      useConversationStore
        .getState()
        .updateMessageContent(conversationId, "msg-1", "new");
    });

    const updated =
      useConversationStore.getState().conversations[0].messages[0];
    expect(updated.content).toBe("new");
    expect(updated.editedAt).not.toBe(beforeEditedAt);
  });

  it("replaces assistant turns after an edited user message", () => {
    let conversationId = "";

    act(() => {
      conversationId = useConversationStore
        .getState()
        .createConversation("Title");
      useConversationStore.getState().addMessages(conversationId, [
        { id: "u1", role: "user", content: "Q1", createdAt: Date.now() },
        { id: "a1", role: "assistant", content: "A1", createdAt: Date.now() },
        { id: "u2", role: "user", content: "Q2", createdAt: Date.now() },
      ]);

      useConversationStore
        .getState()
        .replaceTurnAssistant(conversationId, "u1", [
          {
            id: "a1-new",
            role: "assistant",
            content: "A1-new",
            createdAt: Date.now(),
          },
        ]);
    });

    const ids = useConversationStore
      .getState()
      .conversations[0].messages.map((m) => m.id);
    expect(ids).toEqual(["u1", "a1-new", "u2"]);
  });

  it("interrupts queued and streaming runs", () => {
    let conversationId = "";

    act(() => {
      conversationId = useConversationStore
        .getState()
        .createConversation("Title");
      useConversationStore.getState().addMessages(conversationId, [
        {
          id: "assistant",
          role: "assistant",
          content: "",
          createdAt: Date.now(),
          runs: [
            { id: "r1", model: "m", status: "streaming", text: "" },
            { id: "r2", model: "m", status: "queued", text: "" },
            { id: "r3", model: "m", status: "done", text: "done" },
          ],
        },
      ]);

      useConversationStore.getState().interruptStreamingRuns(conversationId);
    });

    const runs =
      useConversationStore.getState().conversations[0].messages[0].runs!;
    expect(runs[0].status).toBe("done");
    expect(runs[0].interrupted).toBe(true);
    expect(runs[1].status).toBe("done");
    expect(runs[1].interrupted).toBe(true);
    expect(runs[2].status).toBe("done");
    expect(runs[2].interrupted).toBeUndefined();
  });
});
