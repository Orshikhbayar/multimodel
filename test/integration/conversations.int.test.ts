import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasSupabase = Boolean(supabaseUrl && supabaseServiceRoleKey);
const describeIfSupabase = hasSupabase ? describe : describe.skip;

let supabase: SupabaseClient<Database>;

describeIfSupabase("conversations integration", () => {
  beforeAll(() => {
    supabase = createClient<Database>(supabaseUrl!, supabaseServiceRoleKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  });

  it("creates a conversation without projectId", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `conv-test-${unique}@example.com`;

    const createUserResult = await supabase.auth.admin.createUser({
      email,
      password: `IntTest-${unique}-A1!`,
      email_confirm: true,
    });

    expect(createUserResult.error).toBeNull();
    const userId = createUserResult.data.user?.id;
    expect(userId).toBeTruthy();

    let workspaceId: string | null = null;
    let conversationId: string | null = null;

    try {
      // Create workspace
      const workspaceInsert = await supabase
        .from("workspaces")
        .insert({
          owner_id: userId!,
          name: `Workspace ${unique}`,
        })
        .select("id")
        .single();

      expect(workspaceInsert.error).toBeNull();
      workspaceId = workspaceInsert.data?.id ?? null;
      expect(workspaceId).toBeTruthy();

      // Create conversation without projectId
      const conversationInsert = await supabase
        .from("conversations")
        .insert({
          workspace_id: workspaceId!,
          title: "Test Conversation",
          project_id: null,
        })
        .select("id,title,project_id")
        .single();

      expect(conversationInsert.error).toBeNull();
      expect(conversationInsert.data).toBeTruthy();
      conversationId = conversationInsert.data?.id ?? null;
      expect(conversationId).toBeTruthy();
      expect(conversationInsert.data?.title).toBe("Test Conversation");
      expect(conversationInsert.data?.project_id).toBeNull();
    } finally {
      if (workspaceId) {
        await supabase.from("workspaces").delete().eq("id", workspaceId);
      }
      if (userId) {
        await supabase.auth.admin.deleteUser(userId);
      }
    }
  });

  it("creates a conversation with projectId", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `conv-project-${unique}@example.com`;

    const createUserResult = await supabase.auth.admin.createUser({
      email,
      password: `IntTest-${unique}-A1!`,
      email_confirm: true,
    });

    expect(createUserResult.error).toBeNull();
    const userId = createUserResult.data.user?.id;
    expect(userId).toBeTruthy();

    let workspaceId: string | null = null;
    let projectId: string | null = null;

    try {
      // Create workspace
      const workspaceInsert = await supabase
        .from("workspaces")
        .insert({
          owner_id: userId!,
          name: `Workspace ${unique}`,
        })
        .select("id")
        .single();

      expect(workspaceInsert.error).toBeNull();
      workspaceId = workspaceInsert.data?.id ?? null;
      expect(workspaceId).toBeTruthy();

      // Create project
      const projectInsert = await supabase
        .from("projects")
        .insert({
          workspace_id: workspaceId!,
          name: `Project ${unique}`,
        })
        .select("id")
        .single();

      expect(projectInsert.error).toBeNull();
      projectId = projectInsert.data?.id ?? null;
      expect(projectId).toBeTruthy();

      // Create conversation with projectId
      const conversationInsert = await supabase
        .from("conversations")
        .insert({
          workspace_id: workspaceId!,
          title: "Project Conversation",
          project_id: projectId!,
        })
        .select("id,title,project_id")
        .single();

      expect(conversationInsert.error).toBeNull();
      expect(conversationInsert.data).toBeTruthy();
      expect(conversationInsert.data?.title).toBe("Project Conversation");
      expect(conversationInsert.data?.project_id).toBe(projectId);
    } finally {
      if (workspaceId) {
        await supabase.from("workspaces").delete().eq("id", workspaceId);
      }
      if (userId) {
        await supabase.auth.admin.deleteUser(userId);
      }
    }
  });

  it("updates conversation title", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `conv-update-${unique}@example.com`;

    const createUserResult = await supabase.auth.admin.createUser({
      email,
      password: `IntTest-${unique}-A1!`,
      email_confirm: true,
    });

    expect(createUserResult.error).toBeNull();
    const userId = createUserResult.data.user?.id;
    expect(userId).toBeTruthy();

    let workspaceId: string | null = null;
    let conversationId: string | null = null;

    try {
      // Create workspace
      const workspaceInsert = await supabase
        .from("workspaces")
        .insert({
          owner_id: userId!,
          name: `Workspace ${unique}`,
        })
        .select("id")
        .single();

      expect(workspaceInsert.error).toBeNull();
      workspaceId = workspaceInsert.data?.id ?? null;

      // Create conversation
      const conversationInsert = await supabase
        .from("conversations")
        .insert({
          workspace_id: workspaceId!,
          title: "Original Title",
        })
        .select("id")
        .single();

      expect(conversationInsert.error).toBeNull();
      conversationId = conversationInsert.data?.id ?? null;

      // Update title
      const updateResult = await supabase
        .from("conversations")
        .update({ title: "Updated Title" })
        .eq("id", conversationId!)
        .select("id,title")
        .single();

      expect(updateResult.error).toBeNull();
      expect(updateResult.data?.title).toBe("Updated Title");
    } finally {
      if (workspaceId) {
        await supabase.from("workspaces").delete().eq("id", workspaceId);
      }
      if (userId) {
        await supabase.auth.admin.deleteUser(userId);
      }
    }
  });

  it("adds messages to a conversation", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `conv-messages-${unique}@example.com`;

    const createUserResult = await supabase.auth.admin.createUser({
      email,
      password: `IntTest-${unique}-A1!`,
      email_confirm: true,
    });

    expect(createUserResult.error).toBeNull();
    const userId = createUserResult.data.user?.id;
    expect(userId).toBeTruthy();

    let workspaceId: string | null = null;
    let conversationId: string | null = null;

    try {
      // Create workspace
      const workspaceInsert = await supabase
        .from("workspaces")
        .insert({
          owner_id: userId!,
          name: `Workspace ${unique}`,
        })
        .select("id")
        .single();

      expect(workspaceInsert.error).toBeNull();
      workspaceId = workspaceInsert.data?.id ?? null;

      // Create conversation
      const conversationInsert = await supabase
        .from("conversations")
        .insert({
          workspace_id: workspaceId!,
          title: "Message Test",
        })
        .select("id")
        .single();

      expect(conversationInsert.error).toBeNull();
      conversationId = conversationInsert.data?.id ?? null;

      // Add user message
      const userMessageInsert = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId!,
          role: "user",
          content: "Hello, how are you?",
        })
        .select("id,role,content")
        .single();

      expect(userMessageInsert.error).toBeNull();
      expect(userMessageInsert.data?.role).toBe("user");
      expect(userMessageInsert.data?.content).toBe("Hello, how are you?");

      // Add assistant message
      const assistantMessageInsert = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId!,
          role: "assistant",
          content: "I am doing well, thank you!",
        })
        .select("id,role,content")
        .single();

      expect(assistantMessageInsert.error).toBeNull();
      expect(assistantMessageInsert.data?.role).toBe("assistant");
      expect(assistantMessageInsert.data?.content).toBe(
        "I am doing well, thank you!",
      );

      // Query all messages
      const { data: allMessages, error: messagesError } = await supabase
        .from("messages")
        .select("id,role,content")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true });

      expect(messagesError).toBeNull();
      expect(allMessages).toHaveLength(2);
      expect(allMessages?.[0]?.role).toBe("user");
      expect(allMessages?.[1]?.role).toBe("assistant");
    } finally {
      if (workspaceId) {
        await supabase.from("workspaces").delete().eq("id", workspaceId);
      }
      if (userId) {
        await supabase.auth.admin.deleteUser(userId);
      }
    }
  });

  it("creates and updates model runs", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `conv-runs-${unique}@example.com`;

    const createUserResult = await supabase.auth.admin.createUser({
      email,
      password: `IntTest-${unique}-A1!`,
      email_confirm: true,
    });

    expect(createUserResult.error).toBeNull();
    const userId = createUserResult.data.user?.id;
    expect(userId).toBeTruthy();

    let workspaceId: string | null = null;
    let conversationId: string | null = null;
    let messageId: string | null = null;

    try {
      // Create workspace
      const workspaceInsert = await supabase
        .from("workspaces")
        .insert({
          owner_id: userId!,
          name: `Workspace ${unique}`,
        })
        .select("id")
        .single();

      expect(workspaceInsert.error).toBeNull();
      workspaceId = workspaceInsert.data?.id ?? null;

      // Create conversation
      const conversationInsert = await supabase
        .from("conversations")
        .insert({
          workspace_id: workspaceId!,
          title: "Runs Test",
        })
        .select("id")
        .single();

      expect(conversationInsert.error).toBeNull();
      conversationId = conversationInsert.data?.id ?? null;

      // Create message
      const messageInsert = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId!,
          role: "user",
          content: "Test message",
        })
        .select("id")
        .single();

      expect(messageInsert.error).toBeNull();
      messageId = messageInsert.data?.id ?? null;

      // Create model run
      const runInsert = await supabase
        .from("model_runs")
        .insert({
          message_id: messageId!,
          conversation_id: conversationId!,
          model: "openai/gpt-4o-mini",
          provider: "openai",
          status: "streaming",
          output_text: "Initial response",
        })
        .select("id,status,output_text")
        .single();

      expect(runInsert.error).toBeNull();
      const runId = runInsert.data?.id;
      expect(runId).toBeTruthy();
      expect(runInsert.data?.status).toBe("streaming");

      // Append to run text
      const { error: appendError } = await supabase
        .from("model_runs")
        .update({
          output_text: "Initial response more text",
        })
        .eq("id", runId!);

      expect(appendError).toBeNull();

      // Complete the run
      const completeUpdate = await supabase
        .from("model_runs")
        .update({
          status: "done",
          output_text: "Final response",
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30,
          latency_ms: 500,
        })
        .eq("id", runId!)
        .select("id,status,output_text,total_tokens,latency_ms")
        .single();

      expect(completeUpdate.error).toBeNull();
      expect(completeUpdate.data?.status).toBe("done");
      expect(completeUpdate.data?.output_text).toBe("Final response");
      expect(completeUpdate.data?.total_tokens).toBe(30);
      expect(completeUpdate.data?.latency_ms).toBe(500);
    } finally {
      if (workspaceId) {
        await supabase.from("workspaces").delete().eq("id", workspaceId);
      }
      if (userId) {
        await supabase.auth.admin.deleteUser(userId);
      }
    }
  });

  it("tests full lifecycle: create conversation → add message → create run → update run → complete run", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `conv-lifecycle-${unique}@example.com`;

    const createUserResult = await supabase.auth.admin.createUser({
      email,
      password: `IntTest-${unique}-A1!`,
      email_confirm: true,
    });

    expect(createUserResult.error).toBeNull();
    const userId = createUserResult.data.user?.id;
    expect(userId).toBeTruthy();

    let workspaceId: string | null = null;

    try {
      // 1. Create workspace
      const workspaceInsert = await supabase
        .from("workspaces")
        .insert({
          owner_id: userId!,
          name: `Workspace ${unique}`,
        })
        .select("id")
        .single();

      expect(workspaceInsert.error).toBeNull();
      workspaceId = workspaceInsert.data?.id ?? null;
      expect(workspaceId).toBeTruthy();

      // 2. Create conversation
      const conversationInsert = await supabase
        .from("conversations")
        .insert({
          workspace_id: workspaceId!,
          title: "Lifecycle Test",
        })
        .select("id")
        .single();

      expect(conversationInsert.error).toBeNull();
      const conversationId = conversationInsert.data?.id;
      expect(conversationId).toBeTruthy();

      // 3. Add message
      const messageInsert = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId!,
          role: "user",
          content: "What is the capital of France?",
        })
        .select("id")
        .single();

      expect(messageInsert.error).toBeNull();
      const messageId = messageInsert.data?.id;
      expect(messageId).toBeTruthy();

      // 4. Create model run
      const runInsert = await supabase
        .from("model_runs")
        .insert({
          message_id: messageId!,
          conversation_id: conversationId!,
          model: "openai/gpt-4o-mini",
          provider: "openai",
          status: "queued",
        })
        .select("id")
        .single();

      expect(runInsert.error).toBeNull();
      const runId = runInsert.data?.id;
      expect(runId).toBeTruthy();

      // 5. Update run to streaming with partial output
      const streamingUpdate = await supabase
        .from("model_runs")
        .update({
          status: "streaming",
          output_text: "The capital of France is ",
        })
        .eq("id", runId!)
        .select("id,status")
        .single();

      expect(streamingUpdate.error).toBeNull();
      expect(streamingUpdate.data?.status).toBe("streaming");

      // 6. Update run again with more output
      const moreOutputUpdate = await supabase
        .from("model_runs")
        .update({
          output_text: "The capital of France is Paris.",
        })
        .eq("id", runId!)
        .select("id,output_text")
        .single();

      expect(moreOutputUpdate.error).toBeNull();
      expect(moreOutputUpdate.data?.output_text).toBe(
        "The capital of France is Paris.",
      );

      // 7. Complete the run with final data
      const completeUpdate = await supabase
        .from("model_runs")
        .update({
          status: "done",
          output_text: "The capital of France is Paris.",
          input_tokens: 8,
          output_tokens: 5,
          total_tokens: 13,
          latency_ms: 250,
        })
        .eq("id", runId!)
        .select("id,status,output_text,total_tokens,latency_ms")
        .single();

      expect(completeUpdate.error).toBeNull();
      expect(completeUpdate.data?.status).toBe("done");
      expect(completeUpdate.data?.output_text).toBe(
        "The capital of France is Paris.",
      );
      expect(completeUpdate.data?.total_tokens).toBe(13);
      expect(completeUpdate.data?.latency_ms).toBe(250);

      // 8. Verify full conversation state
      const { data: messages, error: messagesError } = await supabase
        .from("messages")
        .select("id,role,content")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true });

      expect(messagesError).toBeNull();
      expect(messages).toHaveLength(1);
      expect(messages?.[0]?.content).toBe("What is the capital of France?");

      // 9. Verify the run is associated with the message
      const { data: runs, error: runsError } = await supabase
        .from("model_runs")
        .select("id,message_id,status,output_text")
        .eq("message_id", messageId!)
        .order("created_at", { ascending: true });

      expect(runsError).toBeNull();
      expect(runs).toHaveLength(1);
      expect(runs?.[0]?.status).toBe("done");
      expect(runs?.[0]?.output_text).toBe("The capital of France is Paris.");
    } finally {
      if (workspaceId) {
        await supabase.from("workspaces").delete().eq("id", workspaceId);
      }
      if (userId) {
        await supabase.auth.admin.deleteUser(userId);
      }
    }
  });

  it("deletes a conversation", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `conv-delete-${unique}@example.com`;

    const createUserResult = await supabase.auth.admin.createUser({
      email,
      password: `IntTest-${unique}-A1!`,
      email_confirm: true,
    });

    expect(createUserResult.error).toBeNull();
    const userId = createUserResult.data.user?.id;
    expect(userId).toBeTruthy();

    let workspaceId: string | null = null;

    try {
      // Create workspace
      const workspaceInsert = await supabase
        .from("workspaces")
        .insert({
          owner_id: userId!,
          name: `Workspace ${unique}`,
        })
        .select("id")
        .single();

      expect(workspaceInsert.error).toBeNull();
      workspaceId = workspaceInsert.data?.id ?? null;

      // Create conversation
      const conversationInsert = await supabase
        .from("conversations")
        .insert({
          workspace_id: workspaceId!,
          title: "To Delete",
        })
        .select("id")
        .single();

      expect(conversationInsert.error).toBeNull();
      const conversationId = conversationInsert.data?.id;

      // Delete conversation
      const deleteResult = await supabase
        .from("conversations")
        .delete()
        .eq("id", conversationId!)
        .select("id");

      expect(deleteResult.error).toBeNull();

      // Verify it's deleted
      const { data: deleted, error: deletedError } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", conversationId!)
        .maybeSingle();

      expect(deletedError).toBeNull();
      expect(deleted).toBeNull();
    } finally {
      if (workspaceId) {
        await supabase.from("workspaces").delete().eq("id", workspaceId);
      }
      if (userId) {
        await supabase.auth.admin.deleteUser(userId);
      }
    }
  });
});
