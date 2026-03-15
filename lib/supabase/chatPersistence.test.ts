import { describe, expect, it } from "vitest";

import { createSupabaseClientMock } from "@/test/utils/mockSupabase";
import {
  createAssistantMessageWithRuns,
  createTurnRecords,
  deleteConversation,
  ensureWorkspaceId,
  getProviderFromModelId,
  hydrateWorkspaceConversations,
  updateConversationTitle,
  updateUserMessageContent,
  upsertConversation,
} from "@/lib/supabase/chatPersistence";

describe("supabase chat persistence", () => {
  it("parses provider from model ID", () => {
    expect(getProviderFromModelId("openai/gpt-4.1")).toBe("openai");
    expect(getProviderFromModelId("")).toBe("unknown");
  });

  it("reuses existing workspace", async () => {
    const client = createSupabaseClientMock();
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "u1@example.com" } as never },
      error: null,
    });

    const workspaces = client.from("workspaces");
    workspaces.maybeSingle.mockResolvedValue({
      data: { id: "w1" },
      error: null,
    });

    const id = await ensureWorkspaceId(client as never);
    expect(id).toBe("w1");
  });

  it("creates workspace when none exists", async () => {
    const client = createSupabaseClientMock();
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "u1@example.com" } as never },
      error: null,
    });

    const workspaces = client.from("workspaces");
    workspaces.maybeSingle.mockResolvedValue({ data: null, error: null });
    workspaces.single.mockResolvedValue({ data: { id: "w2" }, error: null });

    const id = await ensureWorkspaceId(client as never);
    expect(id).toBe("w2");
  });

  it("persists conversation/message helpers", async () => {
    const client = createSupabaseClientMock();
    const conversations = client.from("conversations");

    await upsertConversation(client as never, {
      id: "c1",
      workspaceId: "w1",
      title: "Title",
    });
    await updateConversationTitle(client as never, { id: "c1", title: "New" });
    await deleteConversation(client as never, "c1");
    await updateUserMessageContent(client as never, {
      messageId: "m1",
      content: "updated",
    });

    expect(client.from).toHaveBeenCalledWith("conversations");
    expect(client.from).toHaveBeenCalledWith("messages");
    expect(conversations.upsert).toHaveBeenCalledWith(
      expect.not.objectContaining({ project_id: expect.anything() }),
      { onConflict: "id" },
    );
  });

  it("persists project-scoped conversation linkage", async () => {
    const client = createSupabaseClientMock();
    const conversations = client.from("conversations");

    await upsertConversation(client as never, {
      id: "c-proj",
      workspaceId: "w1",
      title: "Project chat",
      projectId: "p1",
    });

    expect(conversations.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "c-proj",
        workspace_id: "w1",
        title: "Project chat",
        project_id: "p1",
      }),
      { onConflict: "id" },
    );
  });

  it("hydrates conversations with project IDs", async () => {
    const client = createSupabaseClientMock();

    const conversationsTable = client.from("conversations");
    conversationsTable.order.mockResolvedValue({
      data: [
        {
          id: "c1",
          workspace_id: "w1",
          title: "Scoped chat",
          project_id: "p1",
          created_at: "2026-02-20T10:00:00.000Z",
          updated_at: "2026-02-20T10:05:00.000Z",
        },
      ],
      error: null,
    });

    const messagesTable = client.from("messages");
    messagesTable.order.mockResolvedValue({
      data: [],
      error: null,
    });

    const runsTable = client.from("model_runs");
    runsTable.order.mockResolvedValue({
      data: [],
      error: null,
    });

    const conversations = await hydrateWorkspaceConversations(
      client as never,
      "w1",
    );
    expect(conversations).toHaveLength(1);
    expect(conversations[0].projectId).toBe("p1");
  });

  it("creates turn records and assistant messages with runs", async () => {
    const client = createSupabaseClientMock();

    await createTurnRecords(client as never, {
      conversationId: "c1",
      userMessageId: "u1",
      assistantMessageId: "a1",
      userContent: "hello",
      runs: [{ id: "r1", modelId: "openai/gpt-4.1", provider: "openai" }],
    });

    await createAssistantMessageWithRuns(client as never, {
      conversationId: "c1",
      assistantMessageId: "a2",
      runs: [{ id: "r2", modelId: "openai/gpt-4.1", provider: "openai" }],
    });

    expect(client.from).toHaveBeenCalledWith("model_runs");
    expect(client.from).toHaveBeenCalledWith("messages");
  });
});
