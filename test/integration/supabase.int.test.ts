import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasSupabase = Boolean(supabaseUrl && supabaseServiceRoleKey);
const describeIfSupabase = hasSupabase ? describe : describe.skip;

let supabase: SupabaseClient<Database>;

describeIfSupabase("supabase integration", () => {
  beforeAll(() => {
    supabase = createClient<Database>(supabaseUrl!, supabaseServiceRoleKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  });

  it("creates and reads workspace conversation records", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `integration-${unique}@example.com`;

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

      const conversationId = crypto.randomUUID();
      const messageId = crypto.randomUUID();
      const runId = crypto.randomUUID();

      const conversationInsert = await supabase.from("conversations").insert({
        id: conversationId,
        workspace_id: workspaceId!,
        title: "Integration Conversation",
      });
      expect(conversationInsert.error).toBeNull();

      const messageInsert = await supabase.from("messages").insert({
        id: messageId,
        conversation_id: conversationId,
        role: "user",
        content: "hello from integration",
      });
      expect(messageInsert.error).toBeNull();

      const runInsert = await supabase.from("model_runs").insert({
        id: runId,
        message_id: messageId,
        conversation_id: conversationId,
        model: "openai/gpt-4o-mini",
        provider: "openai",
        status: "completed",
        output_text: "ok",
      });
      expect(runInsert.error).toBeNull();

      const conversationRead = await supabase
        .from("conversations")
        .select("id, title")
        .eq("id", conversationId)
        .single();

      expect(conversationRead.error).toBeNull();
      expect(conversationRead.data?.title).toBe("Integration Conversation");
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
