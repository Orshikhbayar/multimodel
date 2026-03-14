import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolExecutionContext } from "@/lib/tools/types";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: mocks.lookup,
}));

import { webFetchTool } from "@/lib/tools/providers/webTools";

function createWebContext(): ToolExecutionContext {
  const supabase = {
    from: vi.fn((table: string) => {
      if (table !== "web_pages_cache") {
        throw new Error(`Unexpected table ${table}`);
      }

      const query = {
        eq: vi.fn((column: string, value: string) => {
          void column;
          void value;
          return query;
        }),
        gt: vi.fn((column: string, value: string) => {
          void column;
          void value;
          return query;
        }),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      };

      return {
        select: vi.fn(() => query),
        upsert: vi.fn(async () => ({ error: null })),
      };
    }),
  };

  return {
    requestId: "req-web-1",
    userId: "user-1",
    userEmail: "user@example.com",
    workspaceId: "workspace-1",
    projectId: null,
    conversationId: null,
    messageId: null,
    supabase: supabase as unknown as ToolExecutionContext["supabase"],
  };
}

describe("webFetchTool hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_SAFE_BROWSING_API_KEY", "");
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  it("blocks private IP literals and localhost", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const context = createWebContext();
    await expect(
      webFetchTool(context, { url: "http://127.0.0.1/private" }),
    ).rejects.toMatchObject({
      code: "TOOL_SSRF_BLOCKED",
      statusCode: 403,
    });

    mocks.lookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);

    await expect(
      webFetchTool(context, { url: "http://localhost/private" }),
    ).rejects.toMatchObject({
      code: "TOOL_SSRF_BLOCKED",
      statusCode: 403,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks metadata service IP address", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const context = createWebContext();
    await expect(
      webFetchTool(context, { url: "http://169.254.169.254/latest/meta-data" }),
    ).rejects.toMatchObject({
      code: "TOOL_SSRF_BLOCKED",
      statusCode: 403,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks hostnames that resolve to private IPs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.lookup.mockResolvedValueOnce([
      { address: "192.168.1.24", family: 4 },
    ]);

    const context = createWebContext();
    await expect(
      webFetchTool(context, { url: "http://example.com/private-resolution" }),
    ).rejects.toMatchObject({
      code: "TOOL_SSRF_BLOCKED",
      statusCode: 403,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces response size limit and fails large pages", async () => {
    const oneMb = new Uint8Array(1024 * 1024);
    oneMb.fill(97);

    const largeBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oneMb);
        controller.enqueue(oneMb);
        controller.enqueue(oneMb);
        controller.enqueue(new Uint8Array([97]));
        controller.close();
      },
    });

    const fetchMock = vi.fn(
      async () =>
        new Response(largeBody, {
          status: 200,
          headers: {
            "content-type": "text/html",
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const context = createWebContext();
    await expect(
      webFetchTool(context, { url: "https://example.com/very-large-page" }),
    ).rejects.toMatchObject({
      code: "TOOL_FETCH_TOO_LARGE",
      statusCode: 413,
    });
  });
});
