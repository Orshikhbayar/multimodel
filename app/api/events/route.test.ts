import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockCreateSupabaseServerClient } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

import { POST } from "@/app/api/events/route";

function createSupabaseMock(
  claims: Record<string, unknown> | null = { sub: "user-1" },
) {
  return {
    auth: {
      getClaims: vi.fn(async () => ({ data: { claims } })),
    },
    from: vi.fn((table: string) => {
      if (table === "product_events") {
        return {
          insert: vi.fn(async () => ({
            error: null,
          })),
        };
      }
      return {
        insert: vi.fn(async () => ({
          error: null,
        })),
      };
    }),
  };
}

function createRequest(body: unknown) {
  return new Request("http://localhost:3000/api/events", {
    method: "POST",
    body: JSON.stringify(body),
  }) as never;
}

describe("/api/events route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 202 when user is not authenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createSupabaseMock(null));

    const response = await POST(createRequest({ event: "test_event" }));

    expect(response.status).toBe(202);
    expect(response.body).toBeNull();
  });

  it("stores valid event with workspace_id in properties", async () => {
    const supabaseMock = createSupabaseMock();
    let capturedRow: Record<string, unknown> | null = null;

    const insertFn = vi.fn(async (row: Record<string, unknown>) => {
      capturedRow = row;
      return { error: null };
    });

    supabaseMock.from = vi.fn((table: string) => {
      if (table === "product_events") {
        return {
          insert: insertFn,
        };
      }
      return { insert: insertFn };
    });

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const response = await POST(
      createRequest({
        event: "user_signup",
        properties: {
          workspace_id: "ws-123",
          session_id: "sess-456",
          event_version: 1,
          timestamp: 1677000000000,
        },
      }),
    );

    expect(response.status).toBe(202);
    expect(capturedRow).toBeTruthy();
    expect(capturedRow?.event_name).toBe("user_signup");
    expect(capturedRow?.workspace_id).toBe("ws-123");
    expect(capturedRow?.user_id).toBe("user-1");
  });

  it("returns 400 when event is missing", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createSupabaseMock());

    const response = await POST(createRequest({ properties: {} }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("event is required");
  });

  it("returns 400 when event is empty string", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createSupabaseMock());

    const response = await POST(createRequest({ event: "   " }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("event is required");
  });

  it("returns 400 for invalid JSON", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createSupabaseMock());

    const badRequest = {
      json: vi.fn(async () => {
        throw new Error("JSON.parse error");
      }),
    } as unknown as Request;

    const response = await POST(badRequest as never);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Invalid JSON");
  });

  it("returns 500 when database insert fails", async () => {
    const supabaseMock = createSupabaseMock();
    supabaseMock.from = vi.fn(() => ({
      insert: vi.fn(async () => ({
        error: { message: "Database connection failed" },
      })),
    }));

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const response = await POST(
      createRequest({
        event: "test_event",
        properties: { timestamp: new Date().toISOString() },
      }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe("Failed to store event");
    expect(json.detail).toBe("Database connection failed");
  });

  it("handles timestamp as ISO string", async () => {
    const supabaseMock = createSupabaseMock();
    let capturedRow: Record<string, unknown> | null = null;

    supabaseMock.from = vi.fn(() => ({
      insert: vi.fn(async (row: Record<string, unknown>) => {
        capturedRow = row;
        return { error: null };
      }),
    }));

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const isoString = "2026-02-20T10:30:00.000Z";
    const response = await POST(
      createRequest({
        event: "test_event",
        properties: { timestamp: isoString },
      }),
    );

    expect(response.status).toBe(202);
    expect(capturedRow?.occurred_at).toBe(isoString);
  });

  it("defaults to current timestamp when timestamp is invalid", async () => {
    const supabaseMock = createSupabaseMock();
    let capturedRow: Record<string, unknown> | null = null;

    supabaseMock.from = vi.fn(() => ({
      insert: vi.fn(async (row: Record<string, unknown>) => {
        capturedRow = row;
        return { error: null };
      }),
    }));

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const beforeTime = new Date().toISOString();
    const response = await POST(
      createRequest({
        event: "test_event",
        properties: { timestamp: "invalid-date" },
      }),
    );
    const afterTime = new Date().toISOString();

    expect(response.status).toBe(202);
    const occurredAt = capturedRow?.occurred_at as string;
    expect(occurredAt).toBeTruthy();
    expect(new Date(occurredAt).getTime()).toBeGreaterThanOrEqual(
      new Date(beforeTime).getTime(),
    );
    expect(new Date(occurredAt).getTime()).toBeLessThanOrEqual(
      new Date(afterTime).getTime(),
    );
  });

  it("validates event_version as positive integer", async () => {
    const supabaseMock = createSupabaseMock();
    let capturedRow: Record<string, unknown> | null = null;

    supabaseMock.from = vi.fn(() => ({
      insert: vi.fn(async (row: Record<string, unknown>) => {
        capturedRow = row;
        return { error: null };
      }),
    }));

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const response = await POST(
      createRequest({
        event: "test_event",
        properties: { event_version: 0 },
      }),
    );

    expect(response.status).toBe(202);
    expect(capturedRow?.event_version).toBe(1);
  });

  it("stores properties with arbitrary structure", async () => {
    const supabaseMock = createSupabaseMock();
    let capturedRow: Record<string, unknown> | null = null;

    supabaseMock.from = vi.fn(() => ({
      insert: vi.fn(async (row: Record<string, unknown>) => {
        capturedRow = row;
        return { error: null };
      }),
    }));

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const customProperties = {
      workspace_id: "ws-1",
      nested: { key: "value", count: 42 },
      array: [1, 2, 3],
      flag: true,
    };

    const response = await POST(
      createRequest({
        event: "custom_event",
        properties: customProperties,
      }),
    );

    expect(response.status).toBe(202);
    expect(capturedRow?.properties).toEqual(customProperties);
  });
});
