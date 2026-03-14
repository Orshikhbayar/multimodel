import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolRunCost,
} from "@/lib/tools/types";
import { hashCanonicalJson } from "@/lib/tools/hash";
import { redactSecretsDeep } from "@/lib/security/secrets";

export interface ToolAuditStart {
  runId: string;
  startedAt: number;
}

export async function startToolAudit(
  context: ToolExecutionContext,
  definition: ToolDefinition,
  input: unknown,
  idempotencyKey?: string,
): Promise<ToolAuditStart> {
  const db = context.supabase as unknown as {
    from: (table: string) => {
      insert: (value: Record<string, unknown>) => {
        select: (value: string) => {
          single: () => Promise<{
            data: { id?: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };

  const startedAt = Date.now();
  const inputHash = hashCanonicalJson(input);
  const redactedInput = redactSecretsDeep(input);

  const { data, error } = await db
    .from("tool_runs")
    .insert({
      workspace_id: context.workspaceId,
      project_id: context.projectId,
      conversation_id: context.conversationId,
      message_id: context.messageId,
      caller_user_id: context.userId,
      tool_name: definition.tool_name,
      tool_version: definition.tool_version,
      status: "running",
      idempotency_key: idempotencyKey ?? null,
      input_hash: inputHash,
      input_payload_redacted: redactedInput,
      estimated_cost: definition.estimated_cost,
      started_at: new Date(startedAt).toISOString(),
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(
      `Failed to create tool audit run: ${error?.message ?? "unknown"}`,
    );
  }

  return {
    runId: data.id,
    startedAt,
  };
}

export async function completeToolAudit(
  context: ToolExecutionContext,
  run: ToolAuditStart,
  output: unknown,
  actualCost?: ToolRunCost,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const db = context.supabase as unknown as {
    from: (table: string) => {
      update: (value: Record<string, unknown>) => {
        eq: (
          column: string,
          filter: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
  };

  const completedAt = Date.now();

  const { error } = await db
    .from("tool_runs")
    .update({
      status: "succeeded",
      output_hash: hashCanonicalJson(output),
      output_payload_redacted: redactSecretsDeep(output),
      actual_cost: actualCost ?? null,
      metadata: metadata ?? null,
      duration_ms: completedAt - run.startedAt,
      completed_at: new Date(completedAt).toISOString(),
    })
    .eq("id", run.runId);

  if (error) {
    throw new Error(`Failed to complete tool audit run: ${error.message}`);
  }
}

export async function failToolAudit(
  context: ToolExecutionContext,
  run: ToolAuditStart,
  error: unknown,
  errorCode?: string,
): Promise<void> {
  const db = context.supabase as unknown as {
    from: (table: string) => {
      update: (value: Record<string, unknown>) => {
        eq: (
          column: string,
          filter: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
  };

  const completedAt = Date.now();
  const errorMessage = error instanceof Error ? error.message : String(error);

  const { error: updateError } = await db
    .from("tool_runs")
    .update({
      status: "failed",
      error_code: errorCode ?? "TOOL_EXECUTION_FAILED",
      error_message: errorMessage,
      duration_ms: completedAt - run.startedAt,
      completed_at: new Date(completedAt).toISOString(),
    })
    .eq("id", run.runId);

  if (updateError) {
    throw new Error(`Failed to fail tool audit run: ${updateError.message}`);
  }
}
