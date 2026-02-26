import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

export type ToolPermission =
  | "web:read"
  | "files:read"
  | "files:write"
  | "github:read"
  | "github:write"
  | "export:docx"
  | "export:pdf"
  | "export:pptx"
  | "images:generate"
  | "images:edit"
  | "skills:run"
  | "research:write";

export interface ToolCostEstimate {
  estimated_tokens_in?: number;
  estimated_tokens_out?: number;
  estimated_external_cost_usd?: number;
}

export interface ToolRunCost {
  tokens_in?: number;
  tokens_out?: number;
  total_tokens?: number;
  external_cost_usd?: number;
}

export type JsonSchema = Record<string, unknown>;

export interface ToolExecutionContext {
  requestId: string;
  userId: string;
  userEmail: string | null;
  workspaceId: string;
  projectId: string | null;
  conversationId: string | null;
  messageId: string | null;
  supabase: SupabaseClient<Database>;
  abortSignal?: AbortSignal;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  tool_name: string;
  tool_version: string;
  description: string;
  input_schema: JsonSchema;
  output_schema: JsonSchema;
  permissions: ToolPermission[];
  estimated_cost: ToolCostEstimate;
  requires_confirmation?: boolean;
  changelog: string;
  deprecated_at?: string;
  execute: (
    context: ToolExecutionContext,
    input: TInput,
  ) => Promise<{
    output: TOutput;
    actual_cost?: ToolRunCost;
    metadata?: Record<string, unknown>;
  }>;
}

export interface ToolExecutionRequest {
  tool_name: string;
  tool_version?: string;
  input: unknown;
  idempotency_key?: string;
  require_confirmation?: boolean;
  confirmation_token?: string;
  project_id?: string | null;
  conversation_id?: string | null;
  message_id?: string | null;
}
