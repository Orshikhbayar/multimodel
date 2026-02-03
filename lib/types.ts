// Core types
export type Role = "user" | "assistant";
export type RunStatus = "streaming" | "done" | "error";
export type SlotStatus = "idle" | "streaming" | "done" | "error";

export interface Source {
  title: string;
  url: string;
  date?: string;
  snippet?: string;
}

export interface Disagreement {
  claim: string;
  models: { model: string; stance: string }[];
}

export interface Run {
  id: string;
  model: string;
  slotId?: string;
  status: RunStatus;
  text: string;
  /** True when a stream was manually stopped */
  interrupted?: boolean;
  sources?: Source[];
  disagreements?: Disagreement[];
  /** Token usage statistics */
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** Latency in milliseconds */
  latencyMs?: number;
  /** Error details if status is 'error' */
  error?: {
    message: string;
    code?: string;
  };
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  runs?: Run[];
  /** File attachments on this message */
  attachments?: Attachment[];
  /** Tool calls made during this message */
  toolCalls?: ToolCall[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  projectId?: string;
  messages: Message[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

// Interaction modes for multi-model orchestration
export type InteractionMode =
  | "smart" // Single best model selected automatically
  | "conversation" // Standard single-model chat
  | "ensemble" // Multiple models answer, synthesized
  | "expert" // Domain-specific expert model
  | "debate" // Models debate each other
  | "simulation" // Agent simulation mode
  | "web"; // Web search augmented

export interface ModelOption {
  id: string;
  label: string;
  hint?: string;
}

export interface ModelSlot {
  slotId: string;
  providerId: string;
  modelId: string;
  label: string;
  enabled: boolean;
  status: SlotStatus;
}

// ============================================
// Orchestration Types (for multi-model runs)
// ============================================

/** File attachment on a message */
export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  /** Size in bytes */
  size: number;
  /** URL or data URI */
  url: string;
  /** Extracted text content if applicable */
  extractedText?: string;
}

/** A tool/function call made by the model */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
  /** Timestamp when the tool call started */
  startedAt?: number;
  /** Timestamp when the tool call completed */
  completedAt?: number;
}

/** Response from a single model in a multi-model run */
export interface PerModelResponse {
  modelId: string;
  slotId?: string;
  content: string;
  status: RunStatus;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  latencyMs?: number;
  error?: {
    message: string;
    code?: string;
  };
}

/** Synthesized response from multiple model outputs */
export interface Synthesis {
  content: string;
  /** Which model performed the synthesis */
  synthesizer?: string;
  /** Citations referencing per-model responses */
  citations?: Array<{
    modelId: string;
    excerpt: string;
  }>;
  /** Points of disagreement between models */
  disagreements?: Disagreement[];
}

/** Orchestration run for multi-model queries */
export interface OrchestrationRun {
  id: string;
  mode: InteractionMode;
  models: string[];
  status: "pending" | "streaming" | "synthesizing" | "done" | "error";
  /** Individual model responses */
  perModelResponses: PerModelResponse[];
  /** Final synthesized response (if applicable) */
  synthesis?: Synthesis;
  startedAt: number;
  completedAt?: number;
  /** Total tokens across all models */
  totalTokens?: number;
  /** Total cost in credits */
  totalCost?: number;
  error?: {
    message: string;
    code?: string;
  };
}

// ============================================
// Provider & Model Configuration
// ============================================

export interface Provider {
  id: string;
  name: string;
  /** Base URL for API calls */
  baseUrl?: string;
  /** Whether this provider is enabled */
  enabled: boolean;
}

export interface ModelConfig {
  id: string;
  providerId: string;
  name: string;
  displayName: string;
  /** Context window size in tokens */
  contextWindow: number;
  /** Maximum output tokens */
  maxOutput: number;
  /** Cost per 1K input tokens */
  inputCostPer1k: number;
  /** Cost per 1K output tokens */
  outputCostPer1k: number;
  /** Supported capabilities */
  capabilities: Array<"chat" | "vision" | "tools" | "code">;
}
