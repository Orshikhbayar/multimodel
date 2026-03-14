import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockFetch, mockDnsLookup, mockSupabaseQuery, mockSupabaseUpsert } =
  vi.hoisted(() => ({
    mockFetch: vi.fn(),
    mockDnsLookup: vi.fn(),
    mockSupabaseQuery: vi.fn(),
    mockSupabaseUpsert: vi.fn(),
  }));

vi.stubGlobal("fetch", mockFetch);
vi.mock("node:dns/promises", () => ({
  lookup: mockDnsLookup,
}));

import { webSearchTool, webFetchTool } from "@/lib/tools/providers/webTools";
import type { ToolExecutionContext } from "@/lib/tools/types";

function createMockContext(): ToolExecutionContext {
  return {
    requestId: "req-123",
    userId: "user-1",
    userEmail: "user@example.com",
    workspaceId: "ws-1",
    projectId: "proj-1",
    conversationId: "conv-1",
    messageId: "msg-1",
    supabase: {
      from: () => ({
        select: () => ({
          eq: vi.fn(() => ({
            eq: mockSupabaseQuery,
            maybeSingle: mockSupabaseQuery,
          })),
          gt: vi.fn(() => ({
            maybeSingle: mockSupabaseQuery,
          })),
        }),
        upsert: mockSupabaseUpsert,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock Supabase client
    } as any,
    abortSignal: undefined,
  };
}

describe("webTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe("webSearchTool", () => {
    it("returns cached results if available", async () => {
      const context = createMockContext();
      const cachedResults = [
        {
          title: "Test Result",
          url: "https://example.com",
          snippet: "Test snippet",
          source: "example.com",
          ranking_score: 0.95,
          canonical_url: "https://example.com",
        },
      ];

      mockSupabaseQuery.mockResolvedValue({
        data: { results: cachedResults },
        error: null,
      });

      const result = await webSearchTool(context, {
        query: "test query",
        top_k: 8,
      });

      expect(result).toEqual(cachedResults.slice(0, 8));
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("searches DuckDuckGo when cache miss", async () => {
      const context = createMockContext();

      mockSupabaseQuery.mockResolvedValue({
        data: null,
        error: null,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () =>
          `<div class="result">
            <a class="result__title result__a" href="https://duckduckgo.com/?uddg=https%3A%2F%2Fexample.com%2Fpage">Test Title</a>
            <div class="result__snippet">Test snippet content</div>
          </div>`,
      });

      mockSupabaseUpsert.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await webSearchTool(context, {
        query: "test query",
        top_k: 5,
      });

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThanOrEqual(0);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("duckduckgo.com"),
        expect.any(Object),
      );
    });

    it("respects top_k limit", async () => {
      const context = createMockContext();

      mockSupabaseQuery.mockResolvedValue({
        data: null,
        error: null,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "",
      });

      mockSupabaseUpsert.mockResolvedValue({
        data: null,
        error: null,
      });

      await webSearchTool(context, { query: "test", top_k: 3 });

      expect(mockSupabaseUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ top_k: 3 }),
        }),
        expect.any(Object),
      );
    });

    it("applies domain allow filters", async () => {
      const context = createMockContext();

      mockSupabaseQuery.mockResolvedValue({
        data: null,
        error: null,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () =>
          `<div class="result">
            <a class="result__title result__a" href="https://duckduckgo.com/?uddg=https%3A%2F%2Fallowed.com%2F">Allowed</a>
            <div class="result__snippet">Test</div>
          </div>
          <div class="result">
            <a class="result__title result__a" href="https://duckduckgo.com/?uddg=https%3A%2F%2Fblocked.com%2F">Blocked</a>
            <div class="result__snippet">Test</div>
          </div>`,
      });

      mockDnsLookup.mockResolvedValue([{ address: "8.8.8.8" }]);

      mockSupabaseUpsert.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await webSearchTool(context, {
        query: "test",
        domains_allow: ["allowed.com"],
      });

      expect(result.every((r) => r.source.includes("allowed"))).toBe(true);
    });

    it("throws error on network failure", async () => {
      const context = createMockContext();

      mockSupabaseQuery.mockResolvedValue({
        data: null,
        error: null,
      });

      mockFetch.mockRejectedValue(new Error("Network error"));

      await expect(webSearchTool(context, { query: "test" })).rejects.toThrow();
    });

    it("handles malformed cache", async () => {
      const context = createMockContext();

      mockSupabaseQuery.mockResolvedValue({
        data: { results: null },
        error: null,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "<div></div>",
      });

      mockSupabaseUpsert.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await webSearchTool(context, { query: "test" });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("webFetchTool", () => {
    it("returns cached page if available", async () => {
      const context = createMockContext();
      const cached = {
        clean_text: "Cached content",
        headings: ["Heading 1"],
        metadata: { title: "Cached" },
        content_hash: "abc123",
        word_count: 10,
      };

      mockSupabaseQuery.mockResolvedValue({
        data: cached,
        error: null,
      });

      const result = await webFetchTool(context, {
        url: "https://example.com",
      });

      expect(result).toEqual(cached);
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining("example.com"),
        expect.any(Object),
      );
    });

    it("fetches and caches new page", async () => {
      const context = createMockContext();

      mockSupabaseQuery.mockResolvedValue({
        data: null,
        error: null,
      });

      mockDnsLookup.mockResolvedValue([{ address: "93.184.216.34" }]);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([["content-type", "text/html"]]),
        text: async () =>
          "<html><head><title>Example</title></head><body><p>This is example content with sufficient length to pass validation checks. It needs to be longer than 40 characters.</p></body></html>",
      });

      mockSupabaseUpsert.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await webFetchTool(context, {
        url: "https://example.com",
      });

      expect(result).toBeDefined();
      expect(result.clean_text).toBeDefined();
      expect(result.word_count).toBeGreaterThan(0);
      expect(mockSupabaseUpsert).toHaveBeenCalled();
    });

    it("rejects invalid URLs", async () => {
      const context = createMockContext();

      await expect(
        webFetchTool(context, { url: "not a valid url" }),
      ).rejects.toThrow();
    });

    it("rejects URLs with credentials", async () => {
      const context = createMockContext();

      await expect(
        webFetchTool(context, { url: "https://user:pass@example.com" }),
      ).rejects.toThrow();
    });

    it("blocks private IP addresses", async () => {
      const context = createMockContext();

      mockDnsLookup.mockResolvedValue([{ address: "192.168.1.1" }]);

      await expect(
        webFetchTool(context, { url: "https://internal.local" }),
      ).rejects.toThrow("private");
    });

    it("blocks localhost addresses", async () => {
      const context = createMockContext();

      mockDnsLookup.mockResolvedValue([{ address: "127.0.0.1" }]);

      await expect(
        webFetchTool(context, { url: "https://localhost:8000" }),
      ).rejects.toThrow("private");
    });

    it("rejects unsupported content types", async () => {
      const context = createMockContext();

      mockSupabaseQuery.mockResolvedValue({
        data: null,
        error: null,
      });

      mockDnsLookup.mockResolvedValue([{ address: "93.184.216.34" }]);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([["content-type", "application/pdf"]]),
      });

      await expect(
        webFetchTool(context, { url: "https://example.com/file.pdf" }),
      ).rejects.toThrow("content type");
    });

    it("enforces max HTML size limit", async () => {
      const context = createMockContext();

      mockSupabaseQuery.mockResolvedValue({
        data: null,
        error: null,
      });

      mockDnsLookup.mockResolvedValue([{ address: "93.184.216.34" }]);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([
          ["content-type", "text/html"],
          ["content-length", String(4 * 1024 * 1024)],
        ]),
      });

      await expect(
        webFetchTool(context, { url: "https://example.com" }),
      ).rejects.toThrow("size limit");
    });

    it("extracts metadata from HTML", async () => {
      const context = createMockContext();

      mockSupabaseQuery.mockResolvedValue({
        data: null,
        error: null,
      });

      mockDnsLookup.mockResolvedValue([{ address: "93.184.216.34" }]);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([["content-type", "text/html"]]),
        text: async () =>
          `<html>
            <head>
              <title>Example Page</title>
              <meta name="description" content="Example description">
              <link rel="canonical" href="https://example.com/canonical">
            </head>
            <body><p>This is example content with sufficient length to pass validation.</p></body>
          </html>`,
      });

      mockSupabaseUpsert.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await webFetchTool(context, {
        url: "https://example.com",
      });

      expect(result.metadata.title).toBe("Example Page");
      expect(result.metadata.description).toBe("Example description");
      expect(result.metadata.canonical_url).toBeDefined();
    });

    it("handles redirects up to max", async () => {
      const context = createMockContext();

      mockSupabaseQuery.mockResolvedValue({
        data: null,
        error: null,
      });

      mockDnsLookup.mockResolvedValue([{ address: "93.184.216.34" }]);

      const redirectResponse = {
        ok: false,
        status: 301,
        headers: new Map([["location", "https://example.com/final"]]),
      };

      const finalResponse = {
        ok: true,
        status: 200,
        headers: new Map([["content-type", "text/html"]]),
        text: async () =>
          "<html><body><p>This is final content with sufficient length for validation.</p></body></html>",
      };

      mockFetch
        .mockResolvedValueOnce(redirectResponse)
        .mockResolvedValueOnce(finalResponse);

      mockSupabaseUpsert.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await webFetchTool(context, {
        url: "https://example.com",
      });

      expect(result).toBeDefined();
      expect(result.clean_text).toBeDefined();
    });

    it("rejects too many redirects", async () => {
      const context = createMockContext();

      mockSupabaseQuery.mockResolvedValue({
        data: null,
        error: null,
      });

      mockDnsLookup.mockResolvedValue([{ address: "93.184.216.34" }]);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 301,
        headers: new Map([["location", "https://example.com/redirect"]]),
      });

      await expect(
        webFetchTool(context, { url: "https://example.com" }),
      ).rejects.toThrow("redirect");
    });

    it("applies domain deny filters", async () => {
      const context = createMockContext();

      await expect(
        webFetchTool(context, {
          url: "https://blocked.com",
          domains_deny: ["blocked.com"],
        }),
      ).rejects.toThrow("deny");
    });

    it("handles cache read errors", async () => {
      const context = createMockContext();

      mockSupabaseQuery.mockResolvedValue({
        data: null,
        error: new Error("Cache read failed"),
      });

      await expect(
        webFetchTool(context, { url: "https://example.com" }),
      ).rejects.toThrow("cache");
    });

    it("rejects pages with insufficient content", async () => {
      const context = createMockContext();

      mockSupabaseQuery.mockResolvedValue({
        data: null,
        error: null,
      });

      mockDnsLookup.mockResolvedValue([{ address: "93.184.216.34" }]);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([["content-type", "text/html"]]),
        text: async () => "<html><body><p>Short</p></body></html>",
      });

      await expect(
        webFetchTool(context, { url: "https://example.com" }),
      ).rejects.toThrow("content");
    });
  });
});
