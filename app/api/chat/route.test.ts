import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockCheckStreamPermission,
  mockReleaseConcurrencySlot,
  mockGetRateLimitHeaders,
  mockStreamOpenAICompletion,
  mockWithStreamTimeouts,
  mockGetStreamStatusFromError,
  mockCreateSupabaseServerClient,
  mockUpsert,
  mockUpdateEq,
  mockEstimateTokenCostUsd,
  mockStartUsageRunMetering,
  mockFinalizeUsageRunMetering,
  mockSentrySetUser,
  mockSentrySetTag,
  mockSentryCaptureException,
  MockSupabaseBillingLockedError,
  MockStreamTimeoutError,
} = vi.hoisted(() => ({
  mockCheckStreamPermission: vi.fn(),
  mockReleaseConcurrencySlot: vi.fn(),
  mockGetRateLimitHeaders: vi.fn(() => ({ "X-RateLimit-Limit": "20" })),
  mockStreamOpenAICompletion: vi.fn(),
  mockWithStreamTimeouts: vi.fn((generator) => generator),
  mockGetStreamStatusFromError: vi.fn(() => ({
    status: "error",
    message: "boom",
  })),
  mockCreateSupabaseServerClient: vi.fn(),
  mockUpsert: vi.fn(async () => ({ data: null, error: null })),
  mockUpdateEq: vi.fn(async () => ({ data: null, error: null })),
  mockEstimateTokenCostUsd: vi.fn(() => 0.001),
  mockStartUsageRunMetering: vi.fn(async () => null),
  mockFinalizeUsageRunMetering: vi.fn(async () => ({ ok: true })),
  mockSentrySetUser: vi.fn(),
  mockSentrySetTag: vi.fn(),
  mockSentryCaptureException: vi.fn(),
  MockSupabaseBillingLockedError: class MockSupabaseBillingLockedError extends Error {
    code = "BILLING_LOCKED" as const;
    lockReason?: string;

    constructor(lockReason?: string) {
      super("billing locked");
      this.lockReason = lockReason;
    }
  },
  MockStreamTimeoutError: class MockStreamTimeoutError extends Error {
    type: "connect" | "inactivity" | "max_duration";

    constructor(
      type: "connect" | "inactivity" | "max_duration",
      elapsedMs: number,
    ) {
      super(`timeout-${type}-${elapsedMs}`);
      this.type = type;
    }
  },
}));

vi.mock("nanoid", () => ({ nanoid: () => "req-123" }));
vi.mock("@sentry/nextjs", () => ({
  setUser: mockSentrySetUser,
  setTag: mockSentrySetTag,
  captureException: mockSentryCaptureException,
}));
vi.mock("@/lib/api/openai", () => ({
  streamOpenAICompletion: mockStreamOpenAICompletion,
  getOpenAIModelName: (modelId: string) => modelId,
}));
vi.mock("@/lib/api/streamWithTimeout", () => ({
  withStreamTimeouts: mockWithStreamTimeouts,
  StreamTimeoutError: MockStreamTimeoutError,
  STREAM_TIMEOUT_CONFIG: {
    connectTimeoutMs: 1,
    inactivityTimeoutMs: 1,
    maxDurationMs: 1,
  },
  getStreamStatusFromError: mockGetStreamStatusFromError,
}));
vi.mock("@/lib/rateLimit", () => ({
  checkStreamPermission: mockCheckStreamPermission,
  checkStreamPermissionAsync: mockCheckStreamPermission,
  releaseConcurrencySlot: mockReleaseConcurrencySlot,
  getRateLimitHeaders: mockGetRateLimitHeaders,
}));
vi.mock("@/lib/logger", () => ({
  createRequestLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/metrics", () => ({
  default: {
    apiRequestCount: vi.fn(),
    apiRequestDuration: vi.fn(),
    streamDuration: vi.fn(),
    streamTokens: vi.fn(),
    apiError: vi.fn(),
    rateLimitHit: vi.fn(),
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));
vi.mock("@/lib/supabase/chatPersistence", () => ({
  getProviderFromModelId: () => "openai",
}));
vi.mock("@/lib/billing/estimator", () => ({
  estimateTokenCostUsd: mockEstimateTokenCostUsd,
}));
vi.mock("@/lib/billing/supabaseService", () => ({
  startUsageRunMetering: mockStartUsageRunMetering,
  finalizeUsageRunMetering: mockFinalizeUsageRunMetering,
  SupabaseBillingInsufficientCreditsError: class SupabaseBillingInsufficientCreditsError extends Error {
    code = "INSUFFICIENT_CREDITS" as const;
    availableCreditsInt = 0;
    neededCreditsInt = 0;
    suggestedAction = "topup" as const;
  },
  SupabaseBillingLockedError: MockSupabaseBillingLockedError,
  SupabaseBillingQuotaExceededError: class SupabaseBillingQuotaExceededError extends Error {
    code = "QUOTA_EXCEEDED" as const;
    reason = "daily" as const;
    resetAt = new Date();
  },
  SupabaseBillingUnavailableError: class SupabaseBillingUnavailableError extends Error {
    code = "BILLING_UNAVAILABLE" as const;
  },
  SupabaseBillingUpgradeRequiredError: class SupabaseBillingUpgradeRequiredError extends Error {
    code = "PLAN_UPGRADE_REQUIRED" as const;
    requiredPlanId = "plus";
  },
}));

import { POST } from "@/app/api/chat/route";

async function readStreamText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }

  return text;
}

function createSupabaseMock(
  claims: Record<string, unknown> | null = { sub: "user-1" },
  conversationProjectId: string | null = null,
) {
  const maybeSingle = vi.fn(async () => ({
    data: { id: "conv-1", project_id: conversationProjectId },
    error: null,
  }));
  const selectEq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: selectEq }));

  return {
    auth: {
      getClaims: vi.fn(async () => ({ data: { claims } })),
    },
    from: vi.fn(() => ({
      select,
      upsert: mockUpsert,
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: mockUpdateEq,
        })),
      })),
    })),
  };
}

function createRequest(body: unknown) {
  return new Request("http://localhost:3000/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
  }) as never;
}

describe("/api/chat route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSupabaseServerClient.mockResolvedValue(createSupabaseMock());
    mockCheckStreamPermission.mockReturnValue({
      allowed: true,
      rateLimit: { allowed: true, remaining: 19, resetIn: 60, limit: 20 },
      concurrency: { allowed: true, active: 1, limit: 2, streamId: "stream-1" },
    });
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
  });

  it("returns 401 when user is not authenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createSupabaseMock(null));

    const response = await POST(
      createRequest({ messages: [{ role: "user", content: "hi" }] }),
    );

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe("Authentication required");
  });

  it("returns 429 for rate limiting", async () => {
    mockCheckStreamPermission.mockReturnValue({
      allowed: false,
      reason: "rate_limit",
      rateLimit: { allowed: false, remaining: 0, resetIn: 20, limit: 20 },
      concurrency: { allowed: false, active: 0, limit: 2 },
    });

    const response = await POST(
      createRequest({ messages: [{ role: "user", content: "hi" }] }),
    );

    expect(response.status).toBe(429);
    const json = await response.json();
    expect(json.error).toBe("Rate limit exceeded");
  });

  it("returns 429 for concurrency limiting", async () => {
    mockCheckStreamPermission.mockReturnValue({
      allowed: false,
      reason: "concurrency_limit",
      rateLimit: { allowed: true, remaining: 18, resetIn: 30, limit: 20 },
      concurrency: { allowed: false, active: 2, limit: 2 },
    });

    const response = await POST(
      createRequest({ messages: [{ role: "user", content: "hi" }] }),
    );
    expect(response.status).toBe(429);
    const json = await response.json();
    expect(json.error).toBe("Too many concurrent requests");
    expect(json.activeStreams).toBe(2);
  });

  it("returns 400 for invalid messages payload", async () => {
    const response = await POST(createRequest({ messages: [] }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("messages array is required");
  });

  it("returns 500 when OPENAI_API_KEY is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const response = await POST(
      createRequest({ messages: [{ role: "user", content: "hi" }] }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toContain("OpenAI API key not configured");
  });

  it("returns 409 when request scope mismatches conversation scope", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(
      createSupabaseMock({ sub: "user-1" }, "proj-123"),
    );

    const response = await POST(
      createRequest({
        messages: [{ role: "user", content: "hi" }],
        modelId: "openai/gpt-4o-mini",
        conversationId: "conv-1",
        runId: "run-1",
        projectId: null,
      }),
    );

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error).toBe("Conversation scope mismatch");
  });

  it("returns 423 when billing is locked", async () => {
    mockStartUsageRunMetering.mockRejectedValueOnce(
      new MockSupabaseBillingLockedError("stripe_dispute"),
    );

    const response = await POST(
      createRequest({
        messages: [{ role: "user", content: "hi" }],
        modelId: "openai/gpt-4o-mini",
      }),
    );

    expect(response.status).toBe(423);
    const json = await response.json();
    expect(json.code).toBe("BILLING_LOCKED");
    expect(json.reason).toBe("stripe_dispute");
  });

  it("streams success responses with done payload", async () => {
    async function* generator() {
      yield { type: "token", content: "hello" } as const;
      yield {
        type: "usage",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as const;
    }

    mockStreamOpenAICompletion.mockReturnValue(generator());

    const response = await POST(
      createRequest({
        messages: [{ role: "user", content: "hi" }],
        modelId: "openai/gpt-4o-mini",
        conversationId: "conv-1",
        runId: "run-1",
        messageId: "msg-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");

    const text = await readStreamText(response);
    expect(text).toContain("hello");
    expect(text).toContain("done");
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockUpdateEq).toHaveBeenCalled();
    expect(mockReleaseConcurrencySlot).toHaveBeenCalledWith(
      "user-1",
      "stream-1",
    );
  });

  it("falls back to estimated tokens when usage event is absent", async () => {
    async function* generator() {
      yield { type: "token", content: "abc" } as const;
    }
    mockStreamOpenAICompletion.mockReturnValue(generator());

    const response = await POST(
      createRequest({
        messages: [{ role: "user", content: "hello world" }],
        conversationId: "conv-fallback",
        runId: "run-fallback",
      }),
    );

    const text = await readStreamText(response);
    expect(text).toContain("done");
    expect(mockEstimateTokenCostUsd).toHaveBeenCalled();
  });

  it("streams timeout error payload and captures exception", async () => {
    mockGetStreamStatusFromError.mockReturnValue({
      status: "timeout",
      message: "timed out",
    });
    async function* generator() {
      throw new MockStreamTimeoutError("inactivity", 77);
    }
    mockStreamOpenAICompletion.mockReturnValue(generator());

    const response = await POST(
      createRequest({
        messages: [{ role: "user", content: "hi" }],
        conversationId: "conv-timeout",
        runId: "run-timeout",
      }),
    );

    const text = await readStreamText(response);
    expect(text).toContain('"status":"timeout"');
    expect(text).toContain('"timeoutType":"inactivity"');
    expect(mockSentryCaptureException).toHaveBeenCalledTimes(1);
    expect(mockUpdateEq).toHaveBeenCalled();
  });

  it("does not capture exception for cancelled streams", async () => {
    mockGetStreamStatusFromError.mockReturnValue({
      status: "cancelled",
      message: "cancelled",
    });
    async function* generator() {
      throw new Error("request abort");
    }
    mockStreamOpenAICompletion.mockReturnValue(generator());

    const response = await POST(
      createRequest({
        messages: [{ role: "user", content: "hi" }],
        conversationId: "conv-cancelled",
        runId: "run-cancelled",
      }),
    );

    const text = await readStreamText(response);
    expect(text).toContain('"status":"cancelled"');
    expect(mockSentryCaptureException).not.toHaveBeenCalled();
  });

  it("handles client disconnect via stream cancel callback", async () => {
    async function* generator() {
      yield { type: "token", content: "first" } as const;
      await new Promise(() => {});
    }
    mockStreamOpenAICompletion.mockReturnValue(generator());

    const response = await POST(
      createRequest({
        messages: [{ role: "user", content: "hi" }],
        conversationId: "conv-disconnect",
        runId: "run-disconnect",
      }),
    );

    const reader = response.body?.getReader();
    expect(reader).toBeTruthy();
    await reader?.read();
    await reader?.cancel();

    expect(mockReleaseConcurrencySlot).toHaveBeenCalledWith(
      "user-1",
      "stream-1",
    );
    expect(mockUpdateEq).toHaveBeenCalled();
  });

  it("returns 500 when request body parsing throws", async () => {
    const badRequest = {
      json: vi.fn(async () => {
        throw new Error("bad-json");
      }),
      signal: new AbortController().signal,
    } as unknown as Request;

    const response = await POST(badRequest as never);
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error).toBe("bad-json");
    expect(mockSentryCaptureException).toHaveBeenCalled();
  });
});
