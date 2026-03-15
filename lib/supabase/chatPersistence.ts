import type { SupabaseClient } from "@supabase/supabase-js";
import { getModelById } from "@/lib/modelCatalog";
import type { Conversation, Message, Run } from "@/lib/types";
import type { Database, Tables } from "@/lib/supabase/database.types";

export type SupabaseBrowserClient = SupabaseClient<Database>;

function toRunStatus(status: Tables<"model_runs">["status"]): Run["status"] {
  switch (status) {
    case "queued":
      return "queued";
    case "streaming":
    case "running":
      return "streaming";
    case "done":
    case "completed":
      return "done";
    case "error":
    case "failed":
    default:
      return "error";
  }
}

function toMessageRole(role: Tables<"messages">["role"]): Message["role"] {
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  return "system";
}

function toMessage(messages: Tables<"messages">, runs: Run[]): Message {
  return {
    id: messages.id,
    role: toMessageRole(messages.role),
    content: messages.content,
    createdAt: new Date(messages.created_at).getTime(),
    editedAt: messages.edited_at
      ? new Date(messages.edited_at).getTime()
      : undefined,
    attachments: Array.isArray(messages.attachments)
      ? (messages.attachments as unknown as Message["attachments"])
      : undefined,
    toolCalls: Array.isArray(messages.tool_calls)
      ? (messages.tool_calls as unknown as Message["toolCalls"])
      : undefined,
    runs: runs.length > 0 ? runs : undefined,
  };
}

function getWorkspaceName(email: string | null | undefined) {
  const prefix = email?.split("@")[0]?.trim();
  return `${prefix && prefix.length > 0 ? prefix : "My"} workspace`;
}

export function getProviderFromModelId(modelId: string): string {
  const provider = modelId.split("/")[0]?.trim();
  return provider || "unknown";
}

export async function ensureWorkspaceId(client: SupabaseBrowserClient) {
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError || !user) {
    throw new Error(userError?.message ?? "Not authenticated");
  }

  const { data: existingWorkspace, error: workspaceError } = await client
    .from("workspaces")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (workspaceError) {
    throw workspaceError;
  }

  if (existingWorkspace?.id) {
    return existingWorkspace.id;
  }

  await client.from("profiles").upsert({
    id: user.id,
    email: user.email ?? null,
  });

  const { data: createdWorkspace, error: createWorkspaceError } = await client
    .from("workspaces")
    .insert({
      owner_id: user.id,
      name: getWorkspaceName(user.email),
    })
    .select("id")
    .single();

  if (createWorkspaceError || !createdWorkspace) {
    throw createWorkspaceError ?? new Error("Failed to create workspace");
  }

  await client.from("workspace_members").upsert({
    workspace_id: createdWorkspace.id,
    user_id: user.id,
    role: "owner",
  });

  return createdWorkspace.id;
}

export async function hydrateWorkspaceConversations(
  client: SupabaseBrowserClient,
  workspaceId: string,
): Promise<Conversation[]> {
  const { data: conversations, error: conversationsError } = await client
    .from("conversations")
    .select("id, workspace_id, title, project_id, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (conversationsError) {
    throw conversationsError;
  }

  if (!conversations || conversations.length === 0) {
    return [];
  }

  const conversationIds = conversations.map((conversation) => conversation.id);

  const [
    { data: messages, error: messagesError },
    { data: modelRuns, error: modelRunsError },
  ] = await Promise.all([
    client
      .from("messages")
      .select(
        "id, conversation_id, role, content, created_at, edited_at, attachments, tool_calls",
      )
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: true }),
    client
      .from("model_runs")
      .select(
        "id, message_id, conversation_id, model, status, output_text, input_tokens, output_tokens, latency_ms, error_text, cost_usd, created_at",
      )
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: true }),
  ]);

  if (messagesError) {
    throw messagesError;
  }

  if (modelRunsError) {
    throw modelRunsError;
  }

  const runsByMessageId = new Map<string, Run[]>();

  (modelRuns ?? []).forEach((row) => {
    if (!row.message_id) return;

    const existing = runsByMessageId.get(row.message_id) ?? [];
    const catalogModel = getModelById(row.model);

    existing.push({
      id: row.id,
      model: catalogModel?.label ?? row.model,
      status: toRunStatus(row.status),
      text: row.output_text ?? "",
      tokens:
        typeof row.input_tokens === "number" &&
        typeof row.output_tokens === "number"
          ? {
              prompt: row.input_tokens,
              completion: row.output_tokens,
              total: row.input_tokens + row.output_tokens,
            }
          : undefined,
      latencyMs: row.latency_ms ?? undefined,
      costUsd:
        typeof row.cost_usd === "number"
          ? row.cost_usd
          : row.cost_usd !== null && row.cost_usd !== undefined
            ? Number(row.cost_usd)
            : undefined,
      error: row.error_text ? { message: row.error_text } : undefined,
    });

    runsByMessageId.set(row.message_id, existing);
  });

  const messagesByConversationId = new Map<string, Message[]>();

  (messages ?? []).forEach((row) => {
    const messageRuns = runsByMessageId.get(row.id) ?? [];
    const existing = messagesByConversationId.get(row.conversation_id) ?? [];

    existing.push(toMessage(row, messageRuns));
    messagesByConversationId.set(row.conversation_id, existing);
  });

  return conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    projectId: conversation.project_id ?? undefined,
    createdAt: new Date(conversation.created_at).getTime(),
    messages: messagesByConversationId.get(conversation.id) ?? [],
  }));
}

export async function upsertConversation(
  client: SupabaseBrowserClient,
  payload: {
    id: string;
    workspaceId: string;
    title: string;
    projectId?: string | null;
  },
) {
  const row: Database["public"]["Tables"]["conversations"]["Insert"] = {
    id: payload.id,
    workspace_id: payload.workspaceId,
    title: payload.title,
  };

  if (payload.projectId !== undefined) {
    row.project_id = payload.projectId;
  }

  const { error } = await client
    .from("conversations")
    .upsert(row, { onConflict: "id" });

  if (error) {
    throw error;
  }
}

export async function updateConversationTitle(
  client: SupabaseBrowserClient,
  payload: {
    id: string;
    title: string;
  },
) {
  const { error } = await client
    .from("conversations")
    .update({ title: payload.title })
    .eq("id", payload.id);

  if (error) {
    throw error;
  }
}

export async function deleteConversation(
  client: SupabaseBrowserClient,
  conversationId: string,
) {
  const { error } = await client
    .from("conversations")
    .delete()
    .eq("id", conversationId);

  if (error) {
    throw error;
  }
}

export async function createTurnRecords(
  client: SupabaseBrowserClient,
  payload: {
    conversationId: string;
    userMessageId: string;
    assistantMessageId: string;
    userContent: string;
    runs: Array<{
      id: string;
      modelId: string;
      provider: string;
    }>;
  },
) {
  const { error: userMessageError } = await client.from("messages").insert({
    id: payload.userMessageId,
    conversation_id: payload.conversationId,
    role: "user",
    content: payload.userContent,
  });

  if (userMessageError) {
    throw userMessageError;
  }

  const { error: assistantMessageError } = await client
    .from("messages")
    .insert({
      id: payload.assistantMessageId,
      conversation_id: payload.conversationId,
      role: "assistant",
      content: "",
    });

  if (assistantMessageError) {
    throw assistantMessageError;
  }

  if (payload.runs.length === 0) {
    return;
  }

  const { error: runError } = await client.from("model_runs").insert(
    payload.runs.map((run) => ({
      id: run.id,
      message_id: payload.assistantMessageId,
      conversation_id: payload.conversationId,
      model: run.modelId,
      provider: run.provider,
      status: "running" as const,
      output_text: "",
    })),
  );

  if (runError) {
    throw runError;
  }
}

export async function createAssistantMessageWithRuns(
  client: SupabaseBrowserClient,
  payload: {
    conversationId: string;
    assistantMessageId: string;
    runs: Array<{
      id: string;
      modelId: string;
      provider: string;
    }>;
  },
) {
  const { error: assistantMessageError } = await client
    .from("messages")
    .insert({
      id: payload.assistantMessageId,
      conversation_id: payload.conversationId,
      role: "assistant",
      content: "",
    });

  if (assistantMessageError) {
    throw assistantMessageError;
  }

  if (payload.runs.length === 0) {
    return;
  }

  const { error: runError } = await client.from("model_runs").insert(
    payload.runs.map((run) => ({
      id: run.id,
      message_id: payload.assistantMessageId,
      conversation_id: payload.conversationId,
      model: run.modelId,
      provider: run.provider,
      status: "running" as const,
      output_text: "",
    })),
  );

  if (runError) {
    throw runError;
  }
}

export async function updateUserMessageContent(
  client: SupabaseBrowserClient,
  payload: {
    messageId: string;
    content: string;
  },
) {
  const { error } = await client
    .from("messages")
    .update({ content: payload.content })
    .eq("id", payload.messageId)
    .eq("role", "user");

  if (error) {
    throw error;
  }
}
