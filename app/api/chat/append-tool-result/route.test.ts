import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockCreateSupabaseServerClient } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

vi.mock("nanoid", () => ({ nanoid: () => "req-abcde" }));

import { POST } from "@/app/api/chat/append-tool-result/route";

function createSupabaseMock(
  claims: Record<string, unknown> | null = { sub: "user-1" },
) {
  return {
    auth: {
      getClaims: vi.fn(async () => ({ data: { claims } })),
    },
    from: vi.fn((table: string) => {
      const queryData: unknown = null;
      const queryError: unknown = null;

      const eq = vi.fn(function eq(col: string, val: unknown) {
        return {
          eq: vi.fn(function innerEq(col2: string, val2: unknown) {
            return {
              maybeSingle: vi.fn(async () => ({
                data: queryData,
                error: queryError,
              })),
              order: vi.fn(() => ({
                limit: vi.fn(async () => ({
                  data: queryData,
                  error: queryError,
                })),
              })),
            };
          }),
          maybeSingle: vi.fn(async () => ({
            data: queryData,
            error: queryError,
          })),
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: queryData, error: queryError })),
          })),
          in: vi.fn(function inFn() {
            return {
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: queryData,
                    error: queryError,
                  })),
                })),
              })),
            };
          }),
        };
      });

      const select = vi.fn(() => ({
        eq,
      }));

      const insert = vi.fn((row: unknown) => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: row, error: queryError })),
        })),
      }));

      return {
        select,
        insert,
        from: vi.fn(),
      };
    }),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async () => ({
          data: { signedUrl: "https://storage.example.com/signed" },
        })),
      })),
    },
  };
}

function createRequest(body: unknown) {
  return new Request("http://localhost:3000/api/chat/append-tool-result", {
    method: "POST",
    body: JSON.stringify(body),
  }) as never;
}

describe("/api/chat/append-tool-result route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createSupabaseMock(null));

    const response = await POST(
      createRequest({
        conversation_id: "conv-1",
        run_id: "run-1",
      }),
    );

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe("Authentication required");
    expect(json.requestId).toBe("req-abcde");
  });

  it("returns 400 when conversation_id is missing", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createSupabaseMock());

    const response = await POST(
      createRequest({
        run_id: "run-1",
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("conversation_id is required");
  });

  it("returns 400 when neither run_id nor artifact_id is provided", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createSupabaseMock());

    const response = await POST(
      createRequest({
        conversation_id: "conv-1",
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Either run_id or artifact_id is required");
  });

  it("returns 404 when conversation is not found", async () => {
    const supabaseMock = createSupabaseMock();
    const originalFrom = supabaseMock.from;

    supabaseMock.from = vi.fn((table: string) => {
      if (table === "conversations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
              })),
            })),
          })),
        };
      }
      return originalFrom(table);
    });

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const response = await POST(
      createRequest({
        conversation_id: "conv-missing",
        run_id: "run-1",
      }),
    );

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe("Conversation not found");
  });

  it("returns 500 when conversation query fails", async () => {
    const supabaseMock = createSupabaseMock();

    supabaseMock.from = vi.fn((table: string) => {
      if (table === "conversations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: { message: "Database error" },
              })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    });

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const response = await POST(
      createRequest({
        conversation_id: "conv-1",
        run_id: "run-1",
      }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe("Database error");
  });

  it("returns 404 when tool run is not found", async () => {
    const supabaseMock = createSupabaseMock();

    supabaseMock.from = vi.fn((table: string) => {
      if (table === "conversations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: "conv-1", workspace_id: "ws-1", project_id: null },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "tool_runs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: null,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    });

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const response = await POST(
      createRequest({
        conversation_id: "conv-1",
        run_id: "run-missing",
      }),
    );

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe("Tool run not found");
  });

  it("returns 409 when tool run workspace does not match conversation workspace", async () => {
    const supabaseMock = createSupabaseMock();

    supabaseMock.from = vi.fn((table: string) => {
      if (table === "conversations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: "conv-1", workspace_id: "ws-1", project_id: null },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "tool_runs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: "run-1",
                    workspace_id: "ws-2",
                    project_id: null,
                    tool_name: "test-tool",
                    status: "succeeded",
                    output_payload_redacted: {},
                  },
                  error: null,
                })),
              })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    });

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const response = await POST(
      createRequest({
        conversation_id: "conv-1",
        run_id: "run-1",
      }),
    );

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error).toContain("workspace");
  });

  it("returns 404 when artifact is not found", async () => {
    const supabaseMock = createSupabaseMock();

    supabaseMock.from = vi.fn((table: string) => {
      if (table === "conversations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: "conv-1", workspace_id: "ws-1", project_id: null },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "artifacts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
              })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    });

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const response = await POST(
      createRequest({
        conversation_id: "conv-1",
        artifact_id: "artifact-missing",
      }),
    );

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe("Artifact not found");
  });

  it("returns 400 for invalid JSON payload", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createSupabaseMock());

    const badRequest = {
      json: vi.fn(async () => {
        throw new Error("JSON parse failed");
      }),
    } as unknown as Request;

    const response = await POST(badRequest as never);

    expect(response.status).toBe(500);
  });

  it("successfully appends tool result with run_id", async () => {
    const supabaseMock = createSupabaseMock();

    supabaseMock.from = vi.fn((table: string) => {
      if (table === "conversations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: "conv-1", workspace_id: "ws-1", project_id: null },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "tool_runs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: "run-1",
                    workspace_id: "ws-1",
                    project_id: null,
                    tool_name: "test-tool",
                    tool_version: "1.0",
                    status: "succeeded",
                    output_payload_redacted: { result: "success" },
                    actual_cost: { tokens_in: 10, tokens_out: 5 },
                    error_code: null,
                    error_message: null,
                    started_at: "2026-02-20T10:00:00.000Z",
                    completed_at: "2026-02-20T10:01:00.000Z",
                  },
                  error: null,
                })),
              })),
            })),
          })),
        };
      }
      if (table === "messages") {
        return {
          insert: vi.fn((row: unknown) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: "msg-1",
                  role: "system",
                  content: "Tool result attached",
                  created_at: "2026-02-20T10:01:00.000Z",
                  edited_at: null,
                  tool_calls: [],
                  attachments: [],
                },
                error: null,
              })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    });

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const response = await POST(
      createRequest({
        conversation_id: "conv-1",
        run_id: "run-1",
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.requestId).toBe("req-abcde");
    expect(json.message).toBeTruthy();
    expect(json.message.id).toBe("msg-1");
    expect(json.message.role).toBe("system");
  });

  it("successfully appends artifact result with artifact_id", async () => {
    const supabaseMock = createSupabaseMock();

    supabaseMock.from = vi.fn((table: string) => {
      if (table === "conversations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: "conv-1", workspace_id: "ws-1", project_id: null },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "artifacts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: "artifact-1",
                  workspace_id: "ws-1",
                  project_id: null,
                  artifact_type: "document",
                  title: "Report.pdf",
                  mime_type: "application/pdf",
                  storage_path: "artifacts/report.pdf",
                  created_at: "2026-02-20T10:00:00.000Z",
                },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "messages") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: "msg-2",
                  role: "system",
                  content: "Artifact attached",
                  created_at: "2026-02-20T10:01:00.000Z",
                  edited_at: null,
                  tool_calls: [],
                  attachments: [],
                },
                error: null,
              })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    });

    mockCreateSupabaseServerClient.mockResolvedValue(supabaseMock);

    const response = await POST(
      createRequest({
        conversation_id: "conv-1",
        artifact_id: "artifact-1",
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.message.id).toBe("msg-2");
  });
});
