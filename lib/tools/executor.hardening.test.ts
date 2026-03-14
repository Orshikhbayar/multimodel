import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashCanonicalJson } from "@/lib/tools/hash";
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionRequest,
} from "@/lib/tools/types";

const mocks = vi.hoisted(() => ({
  initializeToolDefinitions: vi.fn(),
  getRegisteredToolDefinitions: vi.fn(() => []),
  registryGet: vi.fn(),
  syncToolRegistryToDb: vi.fn(async () => {}),
  checkAndConsumeToolRateLimit: vi.fn(() => ({
    allowed: true,
    retryAfterSeconds: 1,
    remaining: 29,
    limit: 30,
  })),
  acquireToolConcurrency: vi.fn(() => ({
    allowed: true,
    active: 1,
    limit: 3,
  })),
  releaseToolConcurrency: vi.fn(),
  validateAgainstSchema: vi.fn(() => ({ valid: true, errors: [] as string[] })),
  startToolAudit: vi.fn(async () => ({
    runId: "run-new",
    startedAt: Date.now(),
  })),
  completeToolAudit: vi.fn(async () => {}),
  failToolAudit: vi.fn(async () => {}),
}));

vi.mock("@/lib/tools/definitions", () => ({
  initializeToolDefinitions: mocks.initializeToolDefinitions,
  getRegisteredToolDefinitions: mocks.getRegisteredToolDefinitions,
}));

vi.mock("@/lib/tools/registry", () => ({
  getToolRegistry: () => ({
    get: mocks.registryGet,
  }),
}));

vi.mock("@/lib/tools/supabaseRegistrySync", () => ({
  syncToolRegistryToDb: mocks.syncToolRegistryToDb,
}));

vi.mock("@/lib/tools/rateLimit", () => ({
  checkAndConsumeToolRateLimit: mocks.checkAndConsumeToolRateLimit,
  acquireToolConcurrency: mocks.acquireToolConcurrency,
  releaseToolConcurrency: mocks.releaseToolConcurrency,
}));

vi.mock("@/lib/tools/schema", () => ({
  validateAgainstSchema: mocks.validateAgainstSchema,
}));

vi.mock("@/lib/tools/audit", () => ({
  startToolAudit: mocks.startToolAudit,
  completeToolAudit: mocks.completeToolAudit,
  failToolAudit: mocks.failToolAudit,
}));

import { executeToolRequest, ToolExecutionError } from "@/lib/tools/executor";

function createBaseContext(
  supabase: unknown,
  projectId: string | null = null,
): ToolExecutionContext {
  return {
    requestId: "req-1",
    userId: "user-1",
    userEmail: "user@example.com",
    workspaceId: "workspace-1",
    projectId,
    conversationId: null,
    messageId: null,
    supabase: supabase as ToolExecutionContext["supabase"],
  };
}

function createToolRunsSupabase(rows: Array<Record<string, unknown>>) {
  const filtersLog: Array<Record<string, unknown>> = [];

  const client = {
    from: vi.fn((table: string) => {
      if (table !== "tool_runs") {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select: vi.fn(() => {
          const filters: Record<string, unknown> = {};
          filtersLog.push(filters);

          const chain = {
            eq: vi.fn((column: string, value: string) => {
              filters[column] = value;
              return chain;
            }),
            maybeSingle: vi.fn(async () => {
              const match = rows.find((row) =>
                Object.entries(filters).every(
                  ([key, value]) => row[key] === value,
                ),
              );
              return { data: match ?? null, error: null };
            }),
          };

          return chain;
        }),
      };
    }),
  };

  return {
    client,
    filtersLog,
  };
}

function createDefinition(
  overrides: Partial<ToolDefinition> = {},
): ToolDefinition {
  return {
    tool_name: "read_tool",
    tool_version: "1.0.0",
    description: "test tool",
    input_schema: { type: "object", additionalProperties: true },
    output_schema: { type: "object", additionalProperties: true },
    permissions: ["web:read"],
    estimated_cost: {},
    changelog: "test",
    execute: async () => ({ output: { ok: true } }),
    ...overrides,
  };
}

describe("executeToolRequest hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRegisteredToolDefinitions.mockReturnValue([]);
    mocks.checkAndConsumeToolRateLimit.mockReturnValue({
      allowed: true,
      retryAfterSeconds: 1,
      remaining: 29,
      limit: 30,
    });
    mocks.acquireToolConcurrency.mockReturnValue({
      allowed: true,
      active: 1,
      limit: 3,
    });
    mocks.validateAgainstSchema.mockReturnValue({
      valid: true,
      errors: [],
    });
    mocks.startToolAudit.mockResolvedValue({
      runId: "run-new",
      startedAt: Date.now(),
    });
    mocks.completeToolAudit.mockResolvedValue(undefined);
    mocks.failToolAudit.mockResolvedValue(undefined);
    mocks.syncToolRegistryToDb.mockResolvedValue(undefined);
  });

  it("enforces confirmation based on tool definition, not request flag", async () => {
    const definition = createDefinition({
      tool_name: "apply_patch",
      requires_confirmation: true,
      execute: vi.fn(async () => ({ output: { should_not_run: true } })),
    });
    mocks.registryGet.mockReturnValue(definition);

    const context = createBaseContext({ from: vi.fn() });
    const request: ToolExecutionRequest = {
      tool_name: "apply_patch",
      input: { any: "value" },
      require_confirmation: false,
    };

    await expect(executeToolRequest(context, request)).rejects.toMatchObject({
      code: "CONFIRMATION_REQUIRED",
      statusCode: 409,
    });

    try {
      await executeToolRequest(context, request);
    } catch (error) {
      const typed = error as ToolExecutionError;
      expect(typed.details?.confirmation_token).toEqual(expect.any(String));
      expect(
        String(typed.details?.confirmation_token).length,
      ).toBeGreaterThanOrEqual(6);
    }

    expect(mocks.startToolAudit).not.toHaveBeenCalled();
  });

  it("returns cached output for same idempotency key and same input hash", async () => {
    const input = { query: "same-input" };
    const inputHash = hashCanonicalJson(input);
    const row = {
      id: "run-cached",
      caller_user_id: "user-1",
      project_scope_key: "**null**",
      tool_name: "read_tool",
      tool_version: "1.0.0",
      idempotency_key: "idem-1",
      status: "succeeded",
      input_hash: inputHash,
      output_payload_redacted: { cached: true },
    };

    const { client } = createToolRunsSupabase([row]);
    const context = createBaseContext(client);
    mocks.registryGet.mockReturnValue(createDefinition());

    const result = await executeToolRequest(context, {
      tool_name: "read_tool",
      input,
      idempotency_key: "idem-1",
    });

    expect(result.from_idempotency_cache).toBe(true);
    expect(result.run_id).toBe("run-cached");
    expect(result.output).toEqual({ cached: true });
    expect(mocks.startToolAudit).not.toHaveBeenCalled();
  });

  it("rejects idempotency key reuse when input differs", async () => {
    const row = {
      id: "run-cached",
      caller_user_id: "user-1",
      project_scope_key: "**null**",
      tool_name: "read_tool",
      tool_version: "1.0.0",
      idempotency_key: "idem-1",
      status: "succeeded",
      input_hash: hashCanonicalJson({ query: "original" }),
      output_payload_redacted: { cached: true },
    };

    const { client } = createToolRunsSupabase([row]);
    const context = createBaseContext(client);
    mocks.registryGet.mockReturnValue(createDefinition());

    await expect(
      executeToolRequest(context, {
        tool_name: "read_tool",
        input: { query: "different" },
        idempotency_key: "idem-1",
      }),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_INPUT",
      statusCode: 409,
    });
  });

  it("does not replay when idempotent row exists for a different tool version", async () => {
    const input = { query: "version-test" };
    const staleRow = {
      id: "run-stale",
      caller_user_id: "user-1",
      project_scope_key: "**null**",
      tool_name: "read_tool",
      tool_version: "1.0.0",
      idempotency_key: "idem-2",
      status: "succeeded",
      input_hash: hashCanonicalJson(input),
      output_payload_redacted: { cached: true },
    };

    const liveExecute = vi.fn(async () => ({ output: { live: true } }));
    const definition = createDefinition({
      tool_version: "2.0.0",
      execute: liveExecute,
    });
    mocks.registryGet.mockReturnValue(definition);

    const { client } = createToolRunsSupabase([staleRow]);
    const context = createBaseContext(client);

    const result = await executeToolRequest(context, {
      tool_name: "read_tool",
      tool_version: "2.0.0",
      input,
      idempotency_key: "idem-2",
    });

    expect(result.from_idempotency_cache).toBeUndefined();
    expect(result.output).toEqual({ live: true });
    expect(mocks.startToolAudit).toHaveBeenCalledTimes(1);
    expect(liveExecute).toHaveBeenCalledTimes(1);
  });

  it("uses null-safe project scope key for idempotency lookup", async () => {
    const input = { query: "null-scope" };
    const row = {
      id: "run-null-project",
      caller_user_id: "user-1",
      project_scope_key: "**null**",
      tool_name: "read_tool",
      tool_version: "1.0.0",
      idempotency_key: "idem-3",
      status: "succeeded",
      input_hash: hashCanonicalJson(input),
      output_payload_redacted: { cached: "null-project" },
    };

    const { client, filtersLog } = createToolRunsSupabase([row]);
    const context = createBaseContext(client, null);
    mocks.registryGet.mockReturnValue(createDefinition());

    const result = await executeToolRequest(context, {
      tool_name: "read_tool",
      input,
      idempotency_key: "idem-3",
    });

    expect(result.from_idempotency_cache).toBe(true);
    expect(filtersLog[0]?.project_scope_key).toBe("**null**");
  });
});
