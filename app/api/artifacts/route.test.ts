import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockCreateSupabaseServerClient,
  mockResolveWorkspaceId,
  mockCreateSignedUrl,
} = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockResolveWorkspaceId: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

vi.mock("@/lib/tools/context", () => ({
  resolveWorkspaceId: mockResolveWorkspaceId,
}));

vi.mock("nanoid", () => ({ nanoid: () => "req-12345" }));

import { GET } from "@/app/api/artifacts/route";

function createSupabaseMock(
  claims: Record<string, unknown> | null = { sub: "user-1" },
) {
  const createSignedUrlFn = vi.fn(async () => ({
    data: { signedUrl: "https://storage.example.com/signed-url" },
  }));

  return {
    auth: {
      getClaims: vi.fn(async () => ({ data: { claims } })),
    },
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: createSignedUrlFn,
      })),
    },
    from: vi.fn((table: string) => {
      const selectEq = vi.fn(function selectEq(column: string) {
        const orderFn = vi.fn(() => ({
          limit: vi.fn(async () => ({
            data: [],
            error: null,
          })),
        }));

        const limitFn = vi.fn(async () => ({
          data: [],
          error: null,
        }));

        return {
          order: orderFn,
          limit: limitFn,
        };
      });

      const selectFn = vi.fn(() => ({
        eq: selectEq,
      }));

      return {
        select: selectFn,
      };
    }),
  };
}

function createRequest(query: Record<string, string> = {}) {
  const params = new URLSearchParams(query);
  const url = `http://localhost:3000/api/artifacts?${params.toString()}`;
  return new Request(url, { method: "GET" }) as never;
}

describe("/api/artifacts route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveWorkspaceId.mockResolvedValue("workspace-1");
  });

  it("returns 401 when user is not authenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createSupabaseMock(null));

    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe("Authentication required");
    expect(json.requestId).toBe("req-12345");
  });

  it("returns artifacts with signed URLs", async () => {
    const supabaseMock = createSupabaseMock();
    const selectEqFn = vi.fn(function selectEq() {
      const orderFn = vi.fn(() => ({
        limit: vi.fn(async () => ({
          data: [
            {
              id: "artifact-1",
              artifact_type: "document",
              title: "Report.pdf",
              mime_type: "application/pdf",
              storage_path: "artifacts/report.pdf",
              byte_size: 1024,
              metadata: {},
              citations: [],
              created_at: "2026-02-20T00:00:00.000Z",
              project_id: null,
              conversation_id: "conv-1",
              message_id: "msg-1",
            },
          ],
          error: null,
        })),
      }));

      return {
        order: orderFn,
      };
    });

    const selectFn = vi.fn(() => ({
      eq: selectEqFn,
    }));

    supabaseMock.from = vi.fn(() => ({
      select: selectFn,
    }));

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.requestId).toBe("req-12345");
    expect(json.artifacts).toHaveLength(1);
    expect(json.artifacts[0].id).toBe("artifact-1");
    expect(json.artifacts[0].download_url).toBe(
      "https://storage.example.com/signed-url",
    );
  });

  it("returns 500 when database query fails", async () => {
    const supabaseMock = createSupabaseMock();
    const selectEqFn = vi.fn(function selectEq() {
      const orderFn = vi.fn(() => ({
        limit: vi.fn(async () => ({
          data: null,
          error: { message: "Connection timeout" },
        })),
      }));

      return {
        order: orderFn,
      };
    });

    const selectFn = vi.fn(() => ({
      eq: selectEqFn,
    }));

    supabaseMock.from = vi.fn(() => ({
      select: selectFn,
    }));

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const response = await GET(createRequest());

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe("Connection timeout");
    expect(json.requestId).toBe("req-12345");
  });

  it("filters artifacts by project_id parameter", async () => {
    const supabaseMock = createSupabaseMock();
    let capturedProjectId: string | null = null;

    const selectEqFn = vi.fn(function selectEq(column: string, value: unknown) {
      if (column === "workspace_id") {
        capturedProjectId = null;
        return {
          eq: selectEqFn,
          is: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [], error: null })),
          })),
        };
      }
      if (column === "project_id") {
        capturedProjectId = String(value);
      }
      return {
        order: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: [], error: null })),
        })),
        eq: selectEqFn,
      };
    });

    const selectFn = vi.fn(() => ({
      eq: selectEqFn,
    }));

    supabaseMock.from = vi.fn(() => ({
      select: selectFn,
    }));

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const response = await GET(createRequest({ project_id: "proj-123" }));

    expect(response.status).toBe(200);
  });

  it("respects limit parameter with max of 100", async () => {
    const supabaseMock = createSupabaseMock();
    let capturedLimit = 0;

    const selectEqFn = vi.fn(function selectEq() {
      const orderFn = vi.fn(() => ({
        limit: vi.fn((limit: number) => {
          capturedLimit = limit;
          return Promise.resolve({
            data: [],
            error: null,
          });
        }),
      }));

      return {
        order: orderFn,
      };
    });

    const selectFn = vi.fn(() => ({
      eq: selectEqFn,
    }));

    supabaseMock.from = vi.fn(() => ({
      select: selectFn,
    }));

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    await GET(createRequest({ limit: "200" }));

    expect(capturedLimit).toBe(100);
  });

  it("handles artifacts without storage paths", async () => {
    const supabaseMock = createSupabaseMock();
    const selectEqFn = vi.fn(function selectEq() {
      const orderFn = vi.fn(() => ({
        limit: vi.fn(async () => ({
          data: [
            {
              id: "artifact-2",
              artifact_type: "document",
              title: "NoPath.pdf",
              mime_type: "application/pdf",
              storage_path: null,
              byte_size: 512,
              metadata: {},
              citations: [],
              created_at: "2026-02-20T00:00:00.000Z",
              project_id: null,
              conversation_id: "conv-1",
              message_id: "msg-1",
            },
          ],
          error: null,
        })),
      }));

      return {
        order: orderFn,
      };
    });

    const selectFn = vi.fn(() => ({
      eq: selectEqFn,
    }));

    supabaseMock.from = vi.fn(() => ({
      select: selectFn,
    }));

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.artifacts[0].download_url).toBeNull();
  });
});
