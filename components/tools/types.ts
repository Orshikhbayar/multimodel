export interface ToolRegistryEntry {
  tool_name: string;
  tool_version: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  permissions: string[];
  estimated_cost?: {
    estimated_tokens_in?: number;
    estimated_tokens_out?: number;
    estimated_external_cost_usd?: number;
  };
  requires_confirmation: boolean;
  changelog?: string;
  deprecated_at?: string | null;
}

export interface ToolRunSummary {
  id: string;
  tool_name: string;
  tool_version: string;
  status: string;
  input_hash?: string | null;
  output_hash?: string | null;
  actual_cost?: {
    tokens_in?: number;
    tokens_out?: number;
    total_tokens?: number;
    external_cost_usd?: number;
  } | null;
  error_code?: string | null;
  error_message?: string | null;
  duration_ms?: number | null;
  started_at: string;
  completed_at?: string | null;
  project_id?: string | null;
  conversation_id?: string | null;
  message_id?: string | null;
}

export interface ToolRunDetail extends ToolRunSummary {
  input_payload_redacted?: unknown;
  output_payload_redacted?: unknown;
  metadata?: Record<string, unknown> | null;
  idempotency_key?: string | null;
  estimated_cost?: Record<string, unknown> | null;
}

export interface ToolExecuteSuccess {
  requestId: string;
  run_id: string;
  tool_name: string;
  tool_version: string;
  output: unknown;
  cost?: {
    tokens_in?: number;
    tokens_out?: number;
    total_tokens?: number;
    external_cost_usd?: number;
  };
  from_idempotency_cache?: boolean;
}

export interface ToolExecuteError {
  requestId?: string;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface ToolConfirmationChallenge {
  confirmation_token: string;
  expires_at: string;
}

export interface ArtifactListItem {
  id: string;
  artifact_type: string;
  title: string;
  mime_type: string;
  storage_path: string;
  byte_size?: number | null;
  metadata?: Record<string, unknown> | null;
  citations?: Array<Record<string, unknown>> | null;
  created_at: string;
  conversation_id?: string | null;
  message_id?: string | null;
  project_id?: string | null;
  download_url?: string | null;
}

export interface AppendToolResultResponse {
  requestId: string;
  message: {
    id: string;
    role: "system" | "assistant" | "user";
    content: string;
    createdAt: number;
    toolCalls?: unknown;
    attachments?: unknown;
  };
}

export interface JsonSchemaNode {
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  required?: string[];
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  additionalProperties?: boolean | JsonSchemaNode;
  anyOf?: unknown[];
  oneOf?: unknown[];
  allOf?: unknown[];
}
