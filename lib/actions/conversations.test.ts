import { beforeEach, describe, expect, it, vi } from "vitest";

function createThenableTableMock() {
  let result: { data: unknown; error: unknown } = { data: null, error: null };

  const table: Record<string, any> = {
    select: vi.fn(() => table),
    insert: vi.fn(() => table),
    update: vi.fn(() => table),
    delete: vi.fn(() => table),
    eq: vi.fn(() => table),
    in: vi.fn(() => table),
    order: vi.fn(() => table),
    limit: vi.fn(() => table),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    setResult: (next: { data: unknown; error: unknown }) => {
      result = next;
    },
  };

  return table;
}

const { mockAuth, mockCreateSupabaseServerClient, mockRevalidatePath } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCreateSupabaseServerClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

import {
  addMessage,
  createConversation,
  deleteConversation,
  getConversations,
  markRunError,
  updateConversationTitle,
} from "@/lib/actions/conversations";

describe("conversation actions", () => {
  const conversations = createThenableTableMock();
  const messages = createThenableTableMock();
  const modelRuns = createThenableTableMock();
  const workspaces = createThenableTableMock();
  const workspaceMembers = createThenableTableMock();
  const projects = createThenableTableMock();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "u@example.com", name: "U" },
    });

    mockCreateSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "conversations") return conversations;
        if (table === "messages") return messages;
        if (table === "model_runs") return modelRuns;
        if (table === "workspaces") return workspaces;
        if (table === "workspace_members") return workspaceMembers;
        if (table === "projects") return projects;
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    conversations.setResult({ data: null, error: null });
    messages.setResult({ data: null, error: null });
    modelRuns.setResult({ data: null, error: null });
    workspaces.setResult({ data: null, error: null });
    workspaceMembers.setResult({ data: null, error: null });
    projects.setResult({ data: null, error: null });
  });

  it("returns empty list when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const list = await getConversations();
    expect(list).toEqual([]);
  });

  it("creates conversation and revalidates", async () => {
    workspaces.setResult({ data: { id: "w1" }, error: null });
    conversations.setResult({ data: { id: "conv-1" }, error: null });

    const id = await createConversation("My Chat");

    expect(id).toBe("conv-1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("returns null when project scope is invalid", async () => {
    workspaces.setResult({ data: { id: "w1" }, error: null });
    projects.setResult({ data: null, error: null });

    const id = await createConversation("Scoped chat", "proj-missing");

    expect(id).toBeNull();
  });

  it("updates title with ownership constraint", async () => {
    conversations.setResult({ data: { id: "conv-1" }, error: null });

    const ok = await updateConversationTitle("conv-1", "New Title");

    expect(ok).toBe(true);
  });

  it("deletes conversation with ownership constraint", async () => {
    conversations.setResult({ data: { id: "conv-1" }, error: null });

    const ok = await deleteConversation("conv-1");

    expect(ok).toBe(true);
  });

  it("adds message only if conversation exists", async () => {
    conversations.setResult({ data: { id: "conv-1" }, error: null });
    messages.setResult({ data: { id: "msg-1" }, error: null });

    const messageId = await addMessage("conv-1", {
      role: "user",
      content: "hello",
      attachments: undefined,
      toolCalls: undefined,
      runs: undefined,
      editedAt: undefined,
    });

    expect(messageId).toBe("msg-1");
  });

  it("marks run error when run belongs to user", async () => {
    modelRuns.setResult({ data: { id: "run-1" }, error: null });

    const ok = await markRunError("run-1", { message: "boom", code: "ERR" });

    expect(ok).toBe(true);
  });
});
