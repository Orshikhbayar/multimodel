"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Conversation, Message, Run } from "@/lib/types";

type DbRunStatus = Database["public"]["Enums"]["run_status"];

function mapDbRunStatusToApp(status: DbRunStatus | string): Run["status"] {
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
      return "error";
    default:
      return "error";
  }
}

function mapAppRunStatusToDb(status: Run["status"]): DbRunStatus {
  switch (status) {
    case "queued":
      return "queued";
    case "streaming":
      return "streaming";
    case "done":
      return "done";
    case "error":
      return "error";
    default:
      return "error";
  }
}

function getProviderFromModelId(modelId: string) {
  const provider = modelId.split("/")[0]?.trim();
  return provider || "unknown";
}

async function getPrimaryWorkspaceId(userId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();

  const { data: ownerWorkspace, error: ownerError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ownerError) {
    throw ownerError;
  }

  if (ownerWorkspace?.id) {
    return ownerWorkspace.id;
  }

  const { data: memberWorkspace, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memberError) {
    throw memberError;
  }

  return memberWorkspace?.workspace_id ?? null;
}

function mapRun(row: {
  id: string;
  model: string;
  status: string;
  slot_id: number | null;
  output_text: string | null;
  interrupted: boolean;
  sources: unknown;
  disagreements: unknown;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  error_text: string | null;
  error_code: string | null;
}): Run {
  const prompt = row.input_tokens ?? 0;
  const completion = row.output_tokens ?? 0;
  const total = row.total_tokens ?? prompt + completion;

  return {
    id: row.id,
    model: row.model,
    slotId: typeof row.slot_id === "number" ? String(row.slot_id) : undefined,
    status: mapDbRunStatusToApp(row.status),
    text: row.output_text ?? "",
    interrupted: row.interrupted,
    sources: (Array.isArray(row.sources) ? row.sources : undefined) as Run["sources"],
    disagreements: (Array.isArray(row.disagreements)
      ? row.disagreements
      : undefined) as Run["disagreements"],
    tokens:
      row.input_tokens !== null || row.output_tokens !== null || row.total_tokens !== null
        ? {
            prompt,
            completion,
            total,
          }
        : undefined,
    latencyMs: row.latency_ms ?? undefined,
    error: row.error_text
      ? {
          message: row.error_text,
          code: row.error_code ?? undefined,
        }
      : undefined,
  };
}

function mapMessage(
  row: {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    created_at: string;
    edited_at: string | null;
    attachments: unknown;
    tool_calls: unknown;
  },
  runs: Run[],
): Message {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: new Date(row.created_at).getTime(),
    editedAt: row.edited_at ? new Date(row.edited_at).getTime() : undefined,
    attachments: (Array.isArray(row.attachments)
      ? row.attachments
      : undefined) as Message["attachments"],
    toolCalls: (Array.isArray(row.tool_calls)
      ? row.tool_calls
      : undefined) as Message["toolCalls"],
    runs: runs.length > 0 ? runs : undefined,
  };
}

function mapConversation(
  row: {
    id: string;
    title: string;
    created_at: string;
    project_id: string | null;
  },
  messages: Message[],
): Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: new Date(row.created_at).getTime(),
    projectId: row.project_id ?? undefined,
    messages,
  };
}

export async function getConversations(): Promise<Conversation[]> {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data: conversations, error: convError } = await supabase
    .from("conversations")
    .select("id,title,created_at,project_id,updated_at")
    .order("updated_at", { ascending: false });

  if (convError) {
    throw convError;
  }

  if (!conversations || conversations.length === 0) {
    return [];
  }

  const conversationIds = conversations.map((conversation) => conversation.id);

  const [{ data: messages, error: messageError }, { data: runs, error: runError }] =
    await Promise.all([
      supabase
        .from("messages")
        .select("id,conversation_id,role,content,created_at,edited_at,attachments,tool_calls")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: true }),
      supabase
        .from("model_runs")
        .select(
          "id,message_id,conversation_id,model,status,slot_id,output_text,interrupted,sources,disagreements,input_tokens,output_tokens,total_tokens,latency_ms,error_text,error_code,created_at",
        )
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: true }),
    ]);

  if (messageError) {
    throw messageError;
  }

  if (runError) {
    throw runError;
  }

  const runsByMessageId = new Map<string, Run[]>();
  for (const run of runs ?? []) {
    if (!run.message_id) continue;
    const bucket = runsByMessageId.get(run.message_id) ?? [];
    bucket.push(
      mapRun({
        id: run.id,
        model: run.model,
        status: run.status,
        slot_id: run.slot_id,
        output_text: run.output_text,
        interrupted: run.interrupted,
        sources: run.sources,
        disagreements: run.disagreements,
        input_tokens: run.input_tokens,
        output_tokens: run.output_tokens,
        total_tokens: run.total_tokens,
        latency_ms: run.latency_ms,
        error_text: run.error_text,
        error_code: run.error_code,
      }),
    );
    runsByMessageId.set(run.message_id, bucket);
  }

  const messagesByConversationId = new Map<string, Message[]>();
  for (const row of messages ?? []) {
    const bucket = messagesByConversationId.get(row.conversation_id) ?? [];
    bucket.push(
      mapMessage(
        {
          id: row.id,
          role: row.role,
          content: row.content,
          created_at: row.created_at,
          edited_at: row.edited_at,
          attachments: row.attachments,
          tool_calls: row.tool_calls,
        },
        runsByMessageId.get(row.id) ?? [],
      ),
    );
    messagesByConversationId.set(row.conversation_id, bucket);
  }

  return conversations.map((conversation) =>
    mapConversation(
      {
        id: conversation.id,
        title: conversation.title,
        created_at: conversation.created_at,
        project_id: conversation.project_id,
      },
      messagesByConversationId.get(conversation.id) ?? [],
    ),
  );
}

export async function getConversation(
  conversationId: string,
): Promise<Conversation | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const conversations = await getConversations();
  return conversations.find((conversation) => conversation.id === conversationId) ?? null;
}

export async function createConversation(
  title: string = "Untitled chat",
  projectId?: string,
): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const workspaceId = await getPrimaryWorkspaceId(session.user.id);
  if (!workspaceId) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  if (projectId) {
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (projectError) {
      throw projectError;
    }

    if (!project) {
      return null;
    }
  }

  const insertConversation: Database["public"]["Tables"]["conversations"]["Insert"] = {
    workspace_id: workspaceId,
    title,
    project_id: projectId ?? null,
  };
  const { data, error } = await supabase
    .from("conversations")
    .insert(insertConversation)
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to create conversation");
  }

  revalidatePath("/");
  return data.id;
}

export async function updateConversationTitle(
  conversationId: string,
  title: string,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .update({ title })
    .eq("id", conversationId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  revalidatePath("/");
  return Boolean(data?.id);
}

export async function deleteConversation(
  conversationId: string,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  revalidatePath("/");
  return Boolean(data?.id);
}

export async function addMessage(
  conversationId: string,
  message: Omit<Message, "id" | "createdAt">,
): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError) {
    throw conversationError;
  }

  if (!conversation) {
    return null;
  }

  const insertMessage: Database["public"]["Tables"]["messages"]["Insert"] = {
    conversation_id: conversationId,
    role: message.role,
    content: message.content,
    attachments: (message.attachments ?? null) as Json,
    tool_calls: (message.toolCalls ?? null) as Json,
  };

  const { data, error } = await supabase
    .from("messages")
    .insert(insertMessage)
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to add message");
  }

  return data.id;
}

export async function updateMessageContent(
  conversationId: string,
  messageId: string,
  content: string,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  const supabase = await createSupabaseServerClient();

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError) {
    throw conversationError;
  }

  if (!conversation) {
    return false;
  }

  const { data, error } = await supabase
    .from("messages")
    .update({
      content,
      edited_at: new Date().toISOString(),
    })
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
}

export async function createRun(
  conversationId: string,
  messageId: string,
  run: Omit<Run, "id">,
): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError) {
    throw conversationError;
  }

  if (!conversation) {
    return null;
  }

  const slotId = run.slotId ? Number.parseInt(run.slotId, 10) : null;
  const insertRun: Database["public"]["Tables"]["model_runs"]["Insert"] = {
    message_id: messageId,
    conversation_id: conversationId,
    model: run.model,
    provider: getProviderFromModelId(run.model),
    status: mapAppRunStatusToDb(run.status),
    slot_id: Number.isFinite(slotId) ? slotId : null,
    output_text: run.text,
    interrupted: Boolean(run.interrupted),
    sources: (run.sources ?? null) as Json,
    disagreements: (run.disagreements ?? null) as Json,
    input_tokens: run.tokens?.prompt ?? null,
    output_tokens: run.tokens?.completion ?? null,
    total_tokens: run.tokens?.total ?? null,
    latency_ms: run.latencyMs ?? null,
    error_text: run.error?.message ?? null,
    error_code: run.error?.code ?? null,
  };

  const { data, error } = await supabase
    .from("model_runs")
    .insert(insertRun)
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to create run");
  }

  return data.id;
}

export async function updateRun(
  runId: string,
  data: Partial<{
    status: Run["status"];
    text: string;
    interrupted: boolean;
    sources: Run["sources"];
    disagreements: Run["disagreements"];
    tokens: Run["tokens"];
    latencyMs: number;
    error: Run["error"];
  }>,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  const updatePayload: Record<string, unknown> = {};

  if (data.status !== undefined) {
    updatePayload.status = mapAppRunStatusToDb(data.status);
  }
  if (data.text !== undefined) {
    updatePayload.output_text = data.text;
  }
  if (data.interrupted !== undefined) {
    updatePayload.interrupted = data.interrupted;
  }
  if (data.sources !== undefined) {
    updatePayload.sources = data.sources;
  }
  if (data.disagreements !== undefined) {
    updatePayload.disagreements = data.disagreements;
  }
  if (data.tokens !== undefined) {
    updatePayload.input_tokens = data.tokens?.prompt ?? null;
    updatePayload.output_tokens = data.tokens?.completion ?? null;
    updatePayload.total_tokens = data.tokens?.total ?? null;
  }
  if (data.latencyMs !== undefined) {
    updatePayload.latency_ms = data.latencyMs;
  }
  if (data.error !== undefined) {
    updatePayload.error_text = data.error?.message ?? null;
    updatePayload.error_code = data.error?.code ?? null;
  }

  const supabase = await createSupabaseServerClient();
  const { data: updated, error } = await supabase
    .from("model_runs")
    .update(updatePayload)
    .eq("id", runId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(updated?.id);
}

export async function appendRunText(
  runId: string,
  chunk: string,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing, error: existingError } = await supabase
    .from("model_runs")
    .select("id,output_text")
    .eq("id", runId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (!existing) {
    return false;
  }

  const { data, error } = await supabase
    .from("model_runs")
    .update({
      output_text: `${existing.output_text ?? ""}${chunk}`,
      status: "streaming",
    })
    .eq("id", runId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
}

export async function completeRun(
  runId: string,
  finalData?: Partial<{
    text: string;
    sources: Run["sources"];
    disagreements: Run["disagreements"];
    tokens: Run["tokens"];
    latencyMs: number;
  }>,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  const supabase = await createSupabaseServerClient();
  const { data: run, error: runError } = await supabase
    .from("model_runs")
    .select("id,output_text")
    .eq("id", runId)
    .maybeSingle();

  if (runError) {
    throw runError;
  }

  if (!run) {
    return false;
  }

  const { data, error } = await supabase
    .from("model_runs")
    .update({
      status: "done",
      output_text: finalData?.text ?? run.output_text ?? "",
      sources: (finalData?.sources ?? null) as Json,
      disagreements: (finalData?.disagreements ?? null) as Json,
      input_tokens: finalData?.tokens?.prompt ?? null,
      output_tokens: finalData?.tokens?.completion ?? null,
      total_tokens: finalData?.tokens?.total ?? null,
      latency_ms: finalData?.latencyMs ?? null,
      error_text: null,
      error_code: null,
    })
    .eq("id", runId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
}

export async function markRunError(
  runId: string,
  error: { message: string; code?: string },
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error: updateError } = await supabase
    .from("model_runs")
    .update({
      status: "error",
      error_text: error.message,
      error_code: error.code ?? null,
    })
    .eq("id", runId)
    .select("id")
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  return Boolean(data?.id);
}
