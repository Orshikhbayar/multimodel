import { nanoid } from "nanoid";
import { createHmac, timingSafeEqual } from "node:crypto";

import {
  completeToolAudit,
  failToolAudit,
  startToolAudit,
} from "@/lib/tools/audit";
import {
  getRegisteredToolDefinitions,
  initializeToolDefinitions,
} from "@/lib/tools/definitions";
import { getToolRegistry } from "@/lib/tools/registry";
import {
  acquireToolConcurrency,
  checkAndConsumeToolRateLimit,
  releaseToolConcurrency,
} from "@/lib/tools/rateLimit";
import { validateAgainstSchema } from "@/lib/tools/schema";
import { syncToolRegistryToDb } from "@/lib/tools/supabaseRegistrySync";
import { hashCanonicalJson, projectScopeKey } from "@/lib/tools/hash";
import type {
  ToolExecutionContext,
  ToolExecutionRequest,
} from "@/lib/tools/types";

const DEFAULT_TIMEOUT_MS = 90_000;
const CONFIRMATION_TOKEN_MIN_LENGTH = 6;
const CONFIRMATION_TTL_MS = 5 * 60_000;
const RETRYABLE_ERROR_CODES = [
  "ETIMEDOUT",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "TOO_MANY_REQUESTS",
];

export class ToolExecutionError extends Error {
  statusCode: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

async function withTimeout<T>(
  executor: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const abortController = new AbortController();
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      abortController.abort();
      reject(
        new ToolExecutionError(504, "TOOL_TIMEOUT", "Tool execution timed out"),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([executor(abortController.signal), timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function shouldRetry(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return RETRYABLE_ERROR_CODES.some((code) => message.includes(code));
}

async function maybeRetry<T>(executor: () => Promise<T>): Promise<T> {
  try {
    return await executor();
  } catch (error) {
    if (!shouldRetry(error)) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 700));
    return executor();
  }
}

async function findIdempotentRun(
  context: ToolExecutionContext,
  toolName: string,
  toolVersion: string,
  request: ToolExecutionRequest,
  inputHash: string,
): Promise<{ id: string; output: unknown } | null> {
  if (!request.idempotency_key) {
    return null;
  }

  const db = context.supabase as unknown as {
    from: (table: string) => {
      select: (value: string) => {
        eq: (
          column: string,
          filter: string,
        ) => {
          eq: (
            column: string,
            filter: string,
          ) => {
            eq: (
              column: string,
              filter: string,
            ) => {
              eq: (
                column: string,
                filter: string,
              ) => {
                eq: (
                  column: string,
                  filter: string,
                ) => {
                  maybeSingle: () => Promise<{
                    data: Record<string, unknown> | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
          };
        };
      };
    };
  };

  const query = db
    .from("tool_runs")
    .select("id,output_payload_redacted,status,input_hash")
    .eq("caller_user_id", context.userId)
    .eq("project_scope_key", projectScopeKey(context.projectId))
    .eq("tool_name", toolName)
    .eq("tool_version", toolVersion)
    .eq("idempotency_key", request.idempotency_key);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Failed to read idempotency run: ${error.message}`);
  }

  const row = data as {
    id?: string;
    status?: string;
    input_hash?: string;
    output_payload_redacted?: unknown;
  } | null;

  if (!row) {
    return null;
  }

  if (row.input_hash !== inputHash) {
    throw new ToolExecutionError(
      409,
      "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_INPUT",
      "idempotency_key was previously used with a different input payload",
    );
  }

  if (row.status === "running") {
    throw new ToolExecutionError(
      409,
      "IDEMPOTENCY_KEY_IN_PROGRESS",
      "idempotency_key is already in progress for this tool/version/input",
    );
  }

  if (row.status !== "succeeded" || typeof row.id !== "string") {
    throw new ToolExecutionError(
      409,
      "IDEMPOTENCY_KEY_ALREADY_USED",
      `idempotency_key was already used for a ${row.status ?? "previous"} run`,
    );
  }

  return {
    id: row.id,
    output: row.output_payload_redacted,
  };
}

function getConfirmationSecret(): string {
  return (
    process.env.TOOL_CONFIRMATION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "development-tool-confirmation-secret"
  );
}

function signConfirmationPayload(payload: string): string {
  return createHmac("sha256", getConfirmationSecret())
    .update(payload)
    .digest("base64url")
    .slice(0, 24);
}

function issueConfirmationChallenge(
  context: ToolExecutionContext,
  toolName: string,
  toolVersion: string,
  inputHash: string,
): { confirmation_token: string; expires_at: string } {
  const expiresAt = Date.now() + CONFIRMATION_TTL_MS;
  const nonce = nanoid(10);
  const payload = [
    toolName,
    toolVersion,
    inputHash,
    context.userId,
    projectScopeKey(context.projectId),
    String(expiresAt),
    nonce,
  ].join("|");
  const signature = signConfirmationPayload(payload);

  return {
    confirmation_token: `${expiresAt.toString(36)}.${nonce}.${signature}`,
    expires_at: new Date(expiresAt).toISOString(),
  };
}

function secureEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyConfirmationToken(
  context: ToolExecutionContext,
  toolName: string,
  toolVersion: string,
  inputHash: string,
  token: string,
): void {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new ToolExecutionError(
      400,
      "INVALID_CONFIRMATION_TOKEN",
      "confirmation_token is malformed",
    );
  }

  const [expiresBase36, nonce, signature] = parts;
  const expiresAt = Number.parseInt(expiresBase36, 36);
  if (!Number.isFinite(expiresAt)) {
    throw new ToolExecutionError(
      400,
      "INVALID_CONFIRMATION_TOKEN",
      "confirmation_token has invalid expiry",
    );
  }

  if (expiresAt <= Date.now()) {
    throw new ToolExecutionError(
      400,
      "CONFIRMATION_TOKEN_EXPIRED",
      "confirmation_token has expired",
    );
  }

  const payload = [
    toolName,
    toolVersion,
    inputHash,
    context.userId,
    projectScopeKey(context.projectId),
    String(expiresAt),
    nonce,
  ].join("|");
  const expectedSignature = signConfirmationPayload(payload);

  if (!secureEquals(signature, expectedSignature)) {
    throw new ToolExecutionError(
      400,
      "INVALID_CONFIRMATION_TOKEN",
      "confirmation_token does not match this request context",
    );
  }
}

function requireWriteConfirmation(
  context: ToolExecutionContext,
  request: ToolExecutionRequest,
  toolName: string,
  toolVersion: string,
  inputHash: string,
  requiresConfirmation: boolean | undefined,
): void {
  if (!requiresConfirmation) return;

  const token = request.confirmation_token?.trim();
  if (!token || token.length < CONFIRMATION_TOKEN_MIN_LENGTH) {
    const challenge = issueConfirmationChallenge(
      context,
      toolName,
      toolVersion,
      inputHash,
    );

    throw new ToolExecutionError(
      409,
      "CONFIRMATION_REQUIRED",
      "This tool requires explicit server-issued confirmation before execution",
      challenge,
    );
  }

  verifyConfirmationToken(context, toolName, toolVersion, inputHash, token);
}

function coerceToToolExecutionError(error: unknown): ToolExecutionError | null {
  if (error instanceof ToolExecutionError) {
    return error;
  }

  if (error && typeof error === "object") {
    const candidate = error as {
      statusCode?: unknown;
      code?: unknown;
      message?: unknown;
    };
    if (
      typeof candidate.statusCode === "number" &&
      typeof candidate.code === "string" &&
      typeof candidate.message === "string"
    ) {
      return new ToolExecutionError(
        candidate.statusCode,
        candidate.code,
        candidate.message,
      );
    }
  }

  return null;
}

export async function executeToolRequest(
  context: ToolExecutionContext,
  request: ToolExecutionRequest,
): Promise<{
  run_id: string;
  tool_name: string;
  tool_version: string;
  output: unknown;
  cost?: unknown;
  from_idempotency_cache?: boolean;
}> {
  initializeToolDefinitions();
  getRegisteredToolDefinitions();
  await syncToolRegistryToDb();

  const rate = checkAndConsumeToolRateLimit(context.userId, context.projectId);

  if (!rate.allowed) {
    throw new ToolExecutionError(
      429,
      "TOOL_RATE_LIMIT",
      `Tool rate limit exceeded. Retry in ${rate.retryAfterSeconds}s`,
    );
  }

  const registry = getToolRegistry();
  const definition = registry.get(request.tool_name, request.tool_version);

  if (!definition) {
    throw new ToolExecutionError(
      404,
      "TOOL_NOT_FOUND",
      "Requested tool is not registered",
    );
  }

  const inputValidation = validateAgainstSchema(
    definition.input_schema,
    request.input,
  );

  if (!inputValidation.valid) {
    throw new ToolExecutionError(
      400,
      "TOOL_INPUT_SCHEMA_VIOLATION",
      `Invalid tool input: ${inputValidation.errors.join("; ")}`,
    );
  }

  const inputHash = hashCanonicalJson(request.input);

  const idempotent = await findIdempotentRun(
    context,
    definition.tool_name,
    definition.tool_version,
    request,
    inputHash,
  );
  if (idempotent) {
    return {
      run_id: idempotent.id,
      tool_name: definition.tool_name,
      tool_version: definition.tool_version,
      output: idempotent.output,
      from_idempotency_cache: true,
    };
  }

  requireWriteConfirmation(
    context,
    request,
    definition.tool_name,
    definition.tool_version,
    inputHash,
    definition.requires_confirmation,
  );
  let run: Awaited<ReturnType<typeof startToolAudit>>;
  try {
    run = await startToolAudit(
      context,
      definition,
      request.input,
      request.idempotency_key,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (request.idempotency_key && message.includes("duplicate key value")) {
      const existing = await findIdempotentRun(
        context,
        definition.tool_name,
        definition.tool_version,
        request,
        inputHash,
      );
      if (existing) {
        return {
          run_id: existing.id,
          tool_name: definition.tool_name,
          tool_version: definition.tool_version,
          output: existing.output,
          from_idempotency_cache: true,
        };
      }
      throw new ToolExecutionError(
        409,
        "IDEMPOTENCY_KEY_ALREADY_USED",
        "idempotency_key is already reserved for this tool run",
      );
    }

    throw error;
  }

  const localRunId = nanoid(12);
  const concurrency = acquireToolConcurrency(
    context.userId,
    context.projectId,
    localRunId,
  );

  if (!concurrency.allowed) {
    await failToolAudit(
      context,
      run,
      new ToolExecutionError(
        429,
        "TOOL_CONCURRENCY_LIMIT",
        `Too many concurrent tool runs (${concurrency.active}/${concurrency.limit})`,
      ),
      "TOOL_CONCURRENCY_LIMIT",
    );

    throw new ToolExecutionError(
      429,
      "TOOL_CONCURRENCY_LIMIT",
      `Too many concurrent tool runs (${concurrency.active}/${concurrency.limit})`,
    );
  }

  try {
    const executed = await maybeRetry(() =>
      withTimeout(
        (signal) =>
          definition.execute(
            {
              ...context,
              abortSignal: signal,
            },
            request.input,
          ),
        DEFAULT_TIMEOUT_MS,
      ),
    );

    const outputValidation = validateAgainstSchema(
      definition.output_schema,
      executed.output,
    );

    if (!outputValidation.valid) {
      throw new ToolExecutionError(
        500,
        "TOOL_OUTPUT_SCHEMA_VIOLATION",
        `Tool output schema invalid: ${outputValidation.errors.join("; ")}`,
      );
    }

    await completeToolAudit(
      context,
      run,
      executed.output,
      executed.actual_cost,
      executed.metadata,
    );

    return {
      run_id: run.runId,
      tool_name: definition.tool_name,
      tool_version: definition.tool_version,
      output: executed.output,
      cost: executed.actual_cost,
    };
  } catch (error) {
    const known = coerceToToolExecutionError(error);
    if (known) {
      await failToolAudit(context, run, known, known.code);
      throw known;
    }

    const message = error instanceof Error ? error.message : String(error);
    const wrapped = new ToolExecutionError(
      500,
      "TOOL_EXECUTION_FAILED",
      message,
    );
    await failToolAudit(context, run, wrapped, wrapped.code);
    throw wrapped;
  } finally {
    releaseToolConcurrency(context.userId, context.projectId, localRunId);
  }
}
