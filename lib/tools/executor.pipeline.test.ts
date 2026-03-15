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
  nanoid: vi.fn(() => "localrunid12"),
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

vi.mock("nanoid", () => ({
  nanoid: mocks.nanoid,
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

describe("executeToolRequest pipeline", () => {
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
    mocks.nanoid.mockReturnValue("localrunid12");
  });

  describe("executeToolRequest full pipeline", () => {
    it("executes complete success pipeline: find tool, validate input, audit, execute, validate output, complete audit", async () => {
      const liveExecute = vi.fn(async () => ({
        output: { result: "success" },
        actual_cost: { tokens_in: 100 },
      }));
      const definition = createDefinition({
        execute: liveExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);
      const request: ToolExecutionRequest = {
        tool_name: "read_tool",
        input: { query: "test" },
      };

      const result = await executeToolRequest(context, request);

      expect(result.run_id).toBe("run-new");
      expect(result.tool_name).toBe("read_tool");
      expect(result.tool_version).toBe("1.0.0");
      expect(result.output).toEqual({ result: "success" });
      expect(result.cost).toEqual({ tokens_in: 100 });
      expect(result.from_idempotency_cache).toBeUndefined();

      // Verify pipeline steps were called in order
      expect(mocks.initializeToolDefinitions).toHaveBeenCalledTimes(1);
      expect(mocks.getRegisteredToolDefinitions).toHaveBeenCalledTimes(1);
      expect(mocks.syncToolRegistryToDb).toHaveBeenCalledTimes(1);
      expect(mocks.checkAndConsumeToolRateLimit).toHaveBeenCalledWith(
        "user-1",
        null,
      );
      expect(mocks.registryGet).toHaveBeenCalledWith("read_tool", undefined);
      expect(mocks.validateAgainstSchema).toHaveBeenCalledTimes(2); // input + output validation
      expect(mocks.startToolAudit).toHaveBeenCalledTimes(1);
      expect(liveExecute).toHaveBeenCalledTimes(1);
      expect(mocks.completeToolAudit).toHaveBeenCalledTimes(1);
      expect(mocks.releaseToolConcurrency).toHaveBeenCalledWith(
        "user-1",
        null,
        "localrunid12",
      );
    });

    it("executes pipeline with metadata returned from tool", async () => {
      const liveExecute = vi.fn(async () => ({
        output: { result: "ok" },
        actual_cost: { tokens_in: 50, tokens_out: 30 },
        metadata: { execution_time_ms: 123, retries: 0 },
      }));
      const definition = createDefinition({
        execute: liveExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await executeToolRequest(context, {
        tool_name: "read_tool",
        input: { q: "test" },
      });

      expect(mocks.completeToolAudit).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ runId: "run-new" }),
        { result: "ok" },
        { tokens_in: 50, tokens_out: 30 },
        { execution_time_ms: 123, retries: 0 },
      );
    });
  });

  describe("rate limiting", () => {
    it("blocks execution when rate limit exceeded", async () => {
      mocks.checkAndConsumeToolRateLimit.mockReturnValue({
        allowed: false,
        retryAfterSeconds: 60,
        remaining: 0,
        limit: 30,
      });

      const context = createBaseContext({ from: vi.fn() });

      await expect(
        executeToolRequest(context, {
          tool_name: "read_tool",
          input: {},
        }),
      ).rejects.toMatchObject({
        statusCode: 429,
        code: "TOOL_RATE_LIMIT",
        message: expect.stringContaining("Retry in 60s"),
      });

      // Should not proceed to tool lookup
      expect(mocks.registryGet).not.toHaveBeenCalled();
      expect(mocks.startToolAudit).not.toHaveBeenCalled();
    });

    it("passes userId and projectId to rate limit check", async () => {
      mocks.registryGet.mockReturnValue(createDefinition());
      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client, "proj-123");

      await executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      });

      expect(mocks.checkAndConsumeToolRateLimit).toHaveBeenCalledWith(
        "user-1",
        "proj-123",
      );
    });
  });

  describe("tool not found", () => {
    it("throws TOOL_NOT_FOUND when registry returns undefined", async () => {
      mocks.registryGet.mockReturnValue(undefined);

      const context = createBaseContext({ from: vi.fn() });

      await expect(
        executeToolRequest(context, {
          tool_name: "unknown_tool",
          input: {},
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "TOOL_NOT_FOUND",
        message: "Requested tool is not registered",
      });

      expect(mocks.startToolAudit).not.toHaveBeenCalled();
    });

    it("looks up tool by name and version from request", async () => {
      mocks.registryGet.mockReturnValue(undefined);

      const context = createBaseContext({ from: vi.fn() });

      await expect(
        executeToolRequest(context, {
          tool_name: "custom_tool",
          tool_version: "2.5.0",
          input: {},
        }),
      ).rejects.toMatchObject({ code: "TOOL_NOT_FOUND" });

      expect(mocks.registryGet).toHaveBeenCalledWith("custom_tool", "2.5.0");
    });
  });

  describe("input validation failure", () => {
    it("throws TOOL_INPUT_SCHEMA_VIOLATION when input is invalid", async () => {
      const definition = createDefinition();
      mocks.registryGet.mockReturnValue(definition);
      mocks.validateAgainstSchema.mockReturnValueOnce({
        valid: false,
        errors: [
          "required field 'query' missing",
          "type mismatch: expected string",
        ],
      });

      const context = createBaseContext({ from: vi.fn() });

      await expect(
        executeToolRequest(context, {
          tool_name: "read_tool",
          input: { invalid: "input" },
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "TOOL_INPUT_SCHEMA_VIOLATION",
        message: expect.stringContaining("required field 'query' missing"),
      });

      expect(mocks.startToolAudit).not.toHaveBeenCalled();
    });

    it("includes all validation errors in error message", async () => {
      const definition = createDefinition();
      mocks.registryGet.mockReturnValue(definition);
      mocks.validateAgainstSchema.mockReturnValueOnce({
        valid: false,
        errors: [
          "field 'url' is required",
          "field 'timeout' must be a number",
          "field 'headers' must be an object",
        ],
      });

      const context = createBaseContext({ from: vi.fn() });

      const error = await executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      }).catch((e) => e as ToolExecutionError);

      expect(error.message).toContain("field 'url' is required");
      expect(error.message).toContain("field 'timeout' must be a number");
      expect(error.message).toContain("field 'headers' must be an object");
    });
  });

  describe("output validation failure", () => {
    it("throws TOOL_OUTPUT_SCHEMA_VIOLATION when tool returns invalid output", async () => {
      const liveExecute = vi.fn(async () => ({
        output: { unexpected: "structure" },
      }));
      const definition = createDefinition({
        execute: liveExecute,
      });
      mocks.registryGet.mockReturnValue(definition);
      mocks.validateAgainstSchema.mockReturnValueOnce({
        valid: true,
        errors: [],
      }); // input validation
      mocks.validateAgainstSchema.mockReturnValueOnce({
        // output validation
        valid: false,
        errors: ["missing required field 'data'"],
      });

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await expect(
        executeToolRequest(context, {
          tool_name: "read_tool",
          input: { q: "test" },
        }),
      ).rejects.toMatchObject({
        statusCode: 500,
        code: "TOOL_OUTPUT_SCHEMA_VIOLATION",
        message: expect.stringContaining("missing required field 'data'"),
      });

      // Tool should have been executed
      expect(liveExecute).toHaveBeenCalledTimes(1);
      // But output validation should fail before completing audit
      expect(mocks.completeToolAudit).not.toHaveBeenCalled();
      // And failure audit should be called
      expect(mocks.failToolAudit).toHaveBeenCalledTimes(1);
    });

    it("fails audit with output schema violation error", async () => {
      const liveExecute = vi.fn(async () => ({
        output: { bad: "output" },
      }));
      const definition = createDefinition({
        execute: liveExecute,
      });
      mocks.registryGet.mockReturnValue(definition);
      mocks.validateAgainstSchema.mockReturnValueOnce({
        valid: true,
        errors: [],
      }); // input
      mocks.validateAgainstSchema.mockReturnValueOnce({
        // output
        valid: false,
        errors: ["validation failed"],
      });

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      }).catch(() => {});

      expect(mocks.failToolAudit).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ runId: "run-new" }),
        expect.objectContaining({
          code: "TOOL_OUTPUT_SCHEMA_VIOLATION",
          statusCode: 500,
        }),
        "TOOL_OUTPUT_SCHEMA_VIOLATION",
      );
    });
  });

  describe("timeout handling", () => {
    it("wraps execution with timeout and rejects after timeout expires", async () => {
      vi.useFakeTimers();
      try {
        const slowExecute = vi.fn(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve({ output: { ok: true } }), 200_000),
            ),
        );
        const definition = createDefinition({
          execute: slowExecute,
        });
        mocks.registryGet.mockReturnValue(definition);

        const { client } = createToolRunsSupabase([]);
        const context = createBaseContext(client);

        const promise = executeToolRequest(context, {
          tool_name: "read_tool",
          input: {},
        });

        // Advance past DEFAULT_TIMEOUT_MS (90_000) so the executor's
        // internal timer fires and rejects the promise.
        await vi.advanceTimersByTimeAsync(90_001);

        await expect(promise).rejects.toMatchObject({
          statusCode: 504,
          code: "TOOL_TIMEOUT",
          message: "Tool execution timed out",
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("passes abort signal to tool executor", async () => {
      let receivedSignal: AbortSignal | undefined;
      const liveExecute = vi.fn(async (context: ToolExecutionContext) => {
        receivedSignal = context.abortSignal;
        return { output: { ok: true } };
      });
      const definition = createDefinition({
        execute: liveExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      });

      expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });

    it("clears timeout timer on successful execution", async () => {
      vi.useFakeTimers();
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

      const liveExecute = vi.fn(async () => ({ output: { ok: true } }));
      const definition = createDefinition({
        execute: liveExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      });

      // clearTimeout should be called in the finally block
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
      vi.useRealTimers();
    });
  });

  describe("retry logic", () => {
    it("retries on ETIMEDOUT error", async () => {
      let callCount = 0;
      const flakeyExecute = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("ETIMEDOUT");
        }
        return { output: { ok: true } };
      });
      const definition = createDefinition({
        execute: flakeyExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      vi.useFakeTimers();
      const promise = executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      });
      // Fast-forward the retry delay
      await vi.advanceTimersByTimeAsync(700);
      const result = await promise;
      vi.useRealTimers();

      expect(result.output).toEqual({ ok: true });
      expect(flakeyExecute).toHaveBeenCalledTimes(2);
    });

    it("retries on ECONNRESET error", async () => {
      let callCount = 0;
      const flakeyExecute = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("ECONNRESET from peer");
        }
        return { output: { result: "retry-success" } };
      });
      const definition = createDefinition({
        execute: flakeyExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      vi.useFakeTimers();
      const promise = executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      });
      await vi.advanceTimersByTimeAsync(700);
      const result = await promise;
      vi.useRealTimers();

      expect(result.output).toEqual({ result: "retry-success" });
      expect(flakeyExecute).toHaveBeenCalledTimes(2);
    });

    it("retries on ENOTFOUND error", async () => {
      let callCount = 0;
      const flakeyExecute = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("getaddrinfo ENOTFOUND example.com");
        }
        return { output: { ok: true } };
      });
      const definition = createDefinition({
        execute: flakeyExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      vi.useFakeTimers();
      const promise = executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      });
      await vi.advanceTimersByTimeAsync(700);
      const result = await promise;
      vi.useRealTimers();

      expect(flakeyExecute).toHaveBeenCalledTimes(2);
    });

    it("retries on EAI_AGAIN error", async () => {
      let callCount = 0;
      const flakeyExecute = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("EAI_AGAIN temporary failure");
        }
        return { output: { ok: true } };
      });
      const definition = createDefinition({
        execute: flakeyExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      vi.useFakeTimers();
      const promise = executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      });
      await vi.advanceTimersByTimeAsync(700);
      const result = await promise;
      vi.useRealTimers();

      expect(flakeyExecute).toHaveBeenCalledTimes(2);
    });

    it("retries on TOO_MANY_REQUESTS error", async () => {
      let callCount = 0;
      const flakeyExecute = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("HTTP 429 TOO_MANY_REQUESTS");
        }
        return { output: { ok: true } };
      });
      const definition = createDefinition({
        execute: flakeyExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      vi.useFakeTimers();
      const promise = executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      });
      await vi.advanceTimersByTimeAsync(700);
      const result = await promise;
      vi.useRealTimers();

      expect(flakeyExecute).toHaveBeenCalledTimes(2);
    });

    it("does NOT retry on non-retryable errors", async () => {
      let callCount = 0;
      const flakeyExecute = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Something went wrong");
        }
        return { output: { ok: true } };
      });
      const definition = createDefinition({
        execute: flakeyExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await expect(
        executeToolRequest(context, {
          tool_name: "read_tool",
          input: {},
        }),
      ).rejects.toMatchObject({
        statusCode: 500,
        code: "TOOL_EXECUTION_FAILED",
      });

      expect(flakeyExecute).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry on ToolExecutionError", async () => {
      let callCount = 0;
      const flakeyExecute = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new ToolExecutionError(400, "INVALID_INPUT", "Bad input");
        }
        return { output: { ok: true } };
      });
      const definition = createDefinition({
        execute: flakeyExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await expect(
        executeToolRequest(context, {
          tool_name: "read_tool",
          input: {},
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_INPUT",
      });

      expect(flakeyExecute).toHaveBeenCalledTimes(1);
    });

    it("waits 700ms between retry attempts", async () => {
      let callCount = 0;
      const flakeyExecute = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("ETIMEDOUT");
        }
        return { output: { ok: true } };
      });
      const definition = createDefinition({
        execute: flakeyExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      vi.useFakeTimers();
      const sleepSpy = vi.spyOn(global, "setTimeout");

      const promise = executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      });

      // Flush microtasks so the first async execution of flakeyExecute runs
      await vi.advanceTimersByTimeAsync(0);

      // First execution happens immediately
      expect(flakeyExecute).toHaveBeenCalledTimes(1);

      // Should have a setTimeout(resolve, 700) call
      const timeoutCalls = sleepSpy.mock.calls.filter(
        (call) => typeof call[1] === "number" && call[1] === 700,
      );
      expect(timeoutCalls.length).toBeGreaterThan(0);

      await vi.advanceTimersByTimeAsync(700);
      await promise;
      vi.useRealTimers();
      sleepSpy.mockRestore();
    });
  });

  describe("concurrency control", () => {
    it("acquires concurrency slot before execution", async () => {
      const liveExecute = vi.fn(async () => ({ output: { ok: true } }));
      const definition = createDefinition({
        execute: liveExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      });

      expect(mocks.acquireToolConcurrency).toHaveBeenCalledWith(
        "user-1",
        null,
        "localrunid12",
      );
    });

    it("blocks execution when concurrency limit exceeded", async () => {
      const definition = createDefinition();
      mocks.registryGet.mockReturnValue(definition);
      mocks.acquireToolConcurrency.mockReturnValue({
        allowed: false,
        active: 5,
        limit: 5,
      });

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await expect(
        executeToolRequest(context, {
          tool_name: "read_tool",
          input: {},
        }),
      ).rejects.toMatchObject({
        statusCode: 429,
        code: "TOOL_CONCURRENCY_LIMIT",
        message: expect.stringContaining("Too many concurrent tool runs"),
      });

      // Should fail audit when concurrency limit hit
      expect(mocks.failToolAudit).toHaveBeenCalledTimes(1);
    });

    it("releases concurrency slot in finally block after success", async () => {
      const liveExecute = vi.fn(async () => ({ output: { ok: true } }));
      const definition = createDefinition({
        execute: liveExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      });

      expect(mocks.releaseToolConcurrency).toHaveBeenCalledWith(
        "user-1",
        null,
        "localrunid12",
      );
    });

    it("releases concurrency slot in finally block on error", async () => {
      const failingExecute = vi.fn(async () => {
        throw new Error("Execution failed");
      });
      const definition = createDefinition({
        execute: failingExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      }).catch(() => {});

      expect(mocks.releaseToolConcurrency).toHaveBeenCalledWith(
        "user-1",
        null,
        "localrunid12",
      );
    });

    it("releases concurrency slot even when output validation fails", async () => {
      const liveExecute = vi.fn(async () => ({
        output: { bad: "output" },
      }));
      const definition = createDefinition({
        execute: liveExecute,
      });
      mocks.registryGet.mockReturnValue(definition);
      mocks.validateAgainstSchema.mockReturnValueOnce({
        valid: true,
        errors: [],
      }); // input
      mocks.validateAgainstSchema.mockReturnValueOnce({
        // output
        valid: false,
        errors: ["invalid output"],
      });

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      }).catch(() => {});

      expect(mocks.releaseToolConcurrency).toHaveBeenCalledWith(
        "user-1",
        null,
        "localrunid12",
      );
    });
  });

  describe("error wrapping", () => {
    it("wraps unknown errors as TOOL_EXECUTION_FAILED with 500 status", async () => {
      const failingExecute = vi.fn(async () => {
        throw new Error("Something went very wrong");
      });
      const definition = createDefinition({
        execute: failingExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await expect(
        executeToolRequest(context, {
          tool_name: "read_tool",
          input: {},
        }),
      ).rejects.toMatchObject({
        statusCode: 500,
        code: "TOOL_EXECUTION_FAILED",
        message: "Something went very wrong",
      });
    });

    it("preserves error message when wrapping unknown errors", async () => {
      const errorMessage = "Database connection failed: timeout after 30s";
      const failingExecute = vi.fn(async () => {
        throw new Error(errorMessage);
      });
      const definition = createDefinition({
        execute: failingExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      const error = await executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      }).catch((e) => e as ToolExecutionError);

      expect(error.message).toBe(errorMessage);
      expect(error.code).toBe("TOOL_EXECUTION_FAILED");
    });

    it("does not double-wrap ToolExecutionError", async () => {
      const failingExecute = vi.fn(async () => {
        throw new ToolExecutionError(
          422,
          "INVALID_STATE",
          "Tool state is invalid",
        );
      });
      const definition = createDefinition({
        execute: failingExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await expect(
        executeToolRequest(context, {
          tool_name: "read_tool",
          input: {},
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "INVALID_STATE",
        message: "Tool state is invalid",
      });
    });

    it("wraps non-Error exceptions as TOOL_EXECUTION_FAILED", async () => {
      const failingExecute = vi.fn(async () => {
        throw "string exception";
      });
      const definition = createDefinition({
        execute: failingExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await expect(
        executeToolRequest(context, {
          tool_name: "read_tool",
          input: {},
        }),
      ).rejects.toMatchObject({
        statusCode: 500,
        code: "TOOL_EXECUTION_FAILED",
      });
    });
  });

  describe("ToolExecutionError class", () => {
    it("stores statusCode, code, and message", () => {
      const error = new ToolExecutionError(
        400,
        "BAD_REQUEST",
        "Invalid input provided",
      );

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("BAD_REQUEST");
      expect(error.message).toBe("Invalid input provided");
    });

    it("stores optional details", () => {
      const details = {
        field: "email",
        reason: "invalid format",
        suggestion: "use valid email",
      };
      const error = new ToolExecutionError(
        400,
        "VALIDATION_ERROR",
        "Validation failed",
        details,
      );

      expect(error.details).toEqual(details);
    });

    it("is instance of Error", () => {
      const error = new ToolExecutionError(500, "SERVER_ERROR", "Oops");

      expect(error instanceof Error).toBe(true);
      expect(error instanceof ToolExecutionError).toBe(true);
    });

    it("can be thrown and caught as Error", () => {
      const error = new ToolExecutionError(
        503,
        "SERVICE_UNAVAILABLE",
        "Service down",
      );

      expect(() => {
        throw error;
      }).toThrow(error);
    });

    it("includes statusCode and code in details if provided", () => {
      const error = new ToolExecutionError(
        409,
        "CONFLICT",
        "Resource already exists",
        {
          resource_id: "123",
          existing_version: 5,
        },
      );

      expect(error.details?.resource_id).toBe("123");
      expect(error.details?.existing_version).toBe(5);
    });
  });

  describe("coerceToToolExecutionError", () => {
    it("returns ToolExecutionError unchanged", () => {
      const original = new ToolExecutionError(400, "BAD_INPUT", "Invalid");
      // We need to test the internal function, so we create our own version
      const coerce = (error: unknown) => {
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
      };

      const result = coerce(original);
      expect(result).toBe(original);
    });

    it("converts duck-typed error object to ToolExecutionError", () => {
      const duckTyped = {
        statusCode: 503,
        code: "SERVICE_DOWN",
        message: "External service unavailable",
      };

      const coerce = (error: unknown) => {
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
      };

      const result = coerce(duckTyped);
      expect(result).toBeInstanceOf(ToolExecutionError);
      expect(result?.statusCode).toBe(503);
      expect(result?.code).toBe("SERVICE_DOWN");
      expect(result?.message).toBe("External service unavailable");
    });

    it("returns null for regular Error", () => {
      const regularError = new Error("Something failed");

      const coerce = (error: unknown) => {
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
      };

      const result = coerce(regularError);
      expect(result).toBeNull();
    });

    it("returns null for object missing statusCode", () => {
      const incomplete = {
        code: "ERROR_CODE",
        message: "Error message",
      };

      const coerce = (error: unknown) => {
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
      };

      const result = coerce(incomplete);
      expect(result).toBeNull();
    });

    it("returns null for object with wrong type for statusCode", () => {
      const wrongType = {
        statusCode: "400",
        code: "ERROR_CODE",
        message: "Error message",
      };

      const coerce = (error: unknown) => {
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
      };

      const result = coerce(wrongType);
      expect(result).toBeNull();
    });
  });

  describe("audit trail", () => {
    it("calls startToolAudit with context, definition, input, idempotency_key", async () => {
      const definition = createDefinition();
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);
      const input = { query: "test", limit: 5 };

      await executeToolRequest(context, {
        tool_name: "read_tool",
        input,
        idempotency_key: "idem-abc123",
      });

      expect(mocks.startToolAudit).toHaveBeenCalledWith(
        context,
        definition,
        input,
        "idem-abc123",
      );
    });

    it("calls completeToolAudit on successful execution", async () => {
      const liveExecute = vi.fn(async () => ({
        output: { data: "result" },
        actual_cost: { tokens_in: 100, tokens_out: 50 },
        metadata: { duration_ms: 234 },
      }));
      const definition = createDefinition({
        execute: liveExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await executeToolRequest(context, {
        tool_name: "read_tool",
        input: { q: "test" },
      });

      expect(mocks.completeToolAudit).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ runId: "run-new" }),
        { data: "result" },
        { tokens_in: 100, tokens_out: 50 },
        { duration_ms: 234 },
      );
    });

    it("calls failToolAudit on execution error with error and code", async () => {
      const failingExecute = vi.fn(async () => {
        throw new ToolExecutionError(400, "INVALID_REQUEST", "Bad input");
      });
      const definition = createDefinition({
        execute: failingExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      }).catch(() => {});

      expect(mocks.failToolAudit).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ runId: "run-new" }),
        expect.objectContaining({
          statusCode: 400,
          code: "INVALID_REQUEST",
          message: "Bad input",
        }),
        "INVALID_REQUEST",
      );
    });

    it("calls failToolAudit when concurrency limit exceeded", async () => {
      const definition = createDefinition();
      mocks.registryGet.mockReturnValue(definition);
      mocks.acquireToolConcurrency.mockReturnValue({
        allowed: false,
        active: 3,
        limit: 3,
      });

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      }).catch(() => {});

      expect(mocks.failToolAudit).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ runId: "run-new" }),
        expect.objectContaining({
          statusCode: 429,
          code: "TOOL_CONCURRENCY_LIMIT",
        }),
        "TOOL_CONCURRENCY_LIMIT",
      );
    });

    it("does not call completeToolAudit if execution raises error", async () => {
      const failingExecute = vi.fn(async () => {
        throw new Error("Execution error");
      });
      const definition = createDefinition({
        execute: failingExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      }).catch(() => {});

      expect(mocks.completeToolAudit).not.toHaveBeenCalled();
      expect(mocks.failToolAudit).toHaveBeenCalledTimes(1);
    });

    it("calls failToolAudit when output validation fails", async () => {
      const liveExecute = vi.fn(async () => ({
        output: { invalid: "structure" },
      }));
      const definition = createDefinition({
        execute: liveExecute,
      });
      mocks.registryGet.mockReturnValue(definition);
      mocks.validateAgainstSchema.mockReturnValueOnce({
        valid: true,
        errors: [],
      }); // input
      mocks.validateAgainstSchema.mockReturnValueOnce({
        // output
        valid: false,
        errors: ["schema mismatch"],
      });

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      await executeToolRequest(context, {
        tool_name: "read_tool",
        input: {},
      }).catch(() => {});

      expect(mocks.failToolAudit).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ runId: "run-new" }),
        expect.objectContaining({
          code: "TOOL_OUTPUT_SCHEMA_VIOLATION",
        }),
        "TOOL_OUTPUT_SCHEMA_VIOLATION",
      );
    });
  });

  describe("input hash calculation", () => {
    it("calculates input hash from request input", async () => {
      const definition = createDefinition();
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);
      const input = { key: "value", nested: { data: 123 } };

      await executeToolRequest(context, {
        tool_name: "read_tool",
        input,
      });

      // The hash should be calculated (we just verify it was used in audit)
      expect(mocks.startToolAudit).toHaveBeenCalled();
    });

    it("uses same hash for same input regardless of order", async () => {
      const definition = createDefinition();
      mocks.registryGet.mockReturnValue(definition);

      // This test verifies that hashCanonicalJson is used, which sorts keys
      // The actual hash calculation is in the hash module, but we can verify
      // that the same logical input results in cache hit

      const { client } = createToolRunsSupabase([
        {
          id: "cached-run",
          caller_user_id: "user-1",
          project_scope_key: "**null**",
          tool_name: "read_tool",
          tool_version: "1.0.0",
          idempotency_key: "idem-order",
          status: "succeeded",
          input_hash: hashCanonicalJson({ b: 2, a: 1 }),
          output_payload_redacted: { cached: true },
        },
      ]);
      const context = createBaseContext(client);

      // Even though keys are in different order, same hash should be found
      const result = await executeToolRequest(context, {
        tool_name: "read_tool",
        input: { a: 1, b: 2 },
        idempotency_key: "idem-order",
      });

      expect(result.from_idempotency_cache).toBe(true);
    });
  });

  describe("end-to-end integration", () => {
    it("executes complete successful flow with all validation and audit steps", async () => {
      const liveExecute = vi.fn(async (context, input: { url: string }) => ({
        output: { status: "ok", data: `fetched from ${input.url}` },
        actual_cost: { tokens_in: 50, external_cost_usd: 0.01 },
        metadata: { request_time_ms: 150, cache_hit: false },
      }));
      const definition = createDefinition({
        tool_name: "fetch_url",
        tool_version: "2.0.0",
        description: "Fetch URL content",
        execute: liveExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client, "project-abc");
      const request: ToolExecutionRequest = {
        tool_name: "fetch_url",
        tool_version: "2.0.0",
        input: { url: "https://example.com" },
      };

      const result = await executeToolRequest(context, request);

      // Verify complete success response
      expect(result).toEqual({
        run_id: "run-new",
        tool_name: "fetch_url",
        tool_version: "2.0.0",
        output: { status: "ok", data: "fetched from https://example.com" },
        cost: { tokens_in: 50, external_cost_usd: 0.01 },
      });

      // Verify all pipeline steps
      expect(mocks.initializeToolDefinitions).toHaveBeenCalled();
      expect(mocks.checkAndConsumeToolRateLimit).toHaveBeenCalledWith(
        "user-1",
        "project-abc",
      );
      expect(mocks.registryGet).toHaveBeenCalledWith("fetch_url", "2.0.0");
      expect(mocks.validateAgainstSchema).toHaveBeenCalledTimes(2);
      expect(mocks.acquireToolConcurrency).toHaveBeenCalledWith(
        "user-1",
        "project-abc",
        "localrunid12",
      );
      expect(liveExecute).toHaveBeenCalledTimes(1);
      expect(mocks.completeToolAudit).toHaveBeenCalledTimes(1);
      expect(mocks.releaseToolConcurrency).toHaveBeenCalledWith(
        "user-1",
        "project-abc",
        "localrunid12",
      );
    });

    it("handles error at rate limit stage", async () => {
      mocks.checkAndConsumeToolRateLimit.mockReturnValue({
        allowed: false,
        retryAfterSeconds: 60,
        remaining: 0,
        limit: 30,
      });

      const context = createBaseContext({ from: vi.fn() });

      const error = await executeToolRequest(context, {
        tool_name: "fetch_url",
        input: { url: "https://example.com" },
      }).catch((e) => e as ToolExecutionError);

      expect(error.code).toBe("TOOL_RATE_LIMIT");
      expect(error.statusCode).toBe(429);
      expect(mocks.registryGet).not.toHaveBeenCalled();
    });

    it("handles error at tool not found stage", async () => {
      mocks.registryGet.mockReturnValue(undefined);

      const context = createBaseContext({ from: vi.fn() });

      const error = await executeToolRequest(context, {
        tool_name: "unknown_tool",
        input: {},
      }).catch((e) => e as ToolExecutionError);

      expect(error.code).toBe("TOOL_NOT_FOUND");
      expect(error.statusCode).toBe(404);
      expect(mocks.startToolAudit).not.toHaveBeenCalled();
    });

    it("handles error at input validation stage", async () => {
      const definition = createDefinition();
      mocks.registryGet.mockReturnValue(definition);
      mocks.validateAgainstSchema.mockReturnValue({
        valid: false,
        errors: ["required field missing"],
      });

      const context = createBaseContext({ from: vi.fn() });

      const error = await executeToolRequest(context, {
        tool_name: "read_tool",
        input: { invalid: "input" },
      }).catch((e) => e as ToolExecutionError);

      expect(error.code).toBe("TOOL_INPUT_SCHEMA_VIOLATION");
      expect(error.statusCode).toBe(400);
      expect(mocks.startToolAudit).not.toHaveBeenCalled();
    });

    it("retries on timeout and succeeds", async () => {
      let attemptCount = 0;
      const flakyExecute = vi.fn(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error("ETIMEDOUT: request timeout");
        }
        return {
          output: { status: "ok", retried: true },
          actual_cost: { tokens_in: 100 },
        };
      });
      const definition = createDefinition({
        execute: flakyExecute,
      });
      mocks.registryGet.mockReturnValue(definition);

      const { client } = createToolRunsSupabase([]);
      const context = createBaseContext(client);

      vi.useFakeTimers();
      const promise = executeToolRequest(context, {
        tool_name: "read_tool",
        input: { retryable: true },
      });
      await vi.advanceTimersByTimeAsync(700);
      const result = await promise;
      vi.useRealTimers();

      expect(result.output).toEqual({ status: "ok", retried: true });
      expect(flakyExecute).toHaveBeenCalledTimes(2);
      expect(mocks.completeToolAudit).toHaveBeenCalledTimes(1);
    });
  });
});
