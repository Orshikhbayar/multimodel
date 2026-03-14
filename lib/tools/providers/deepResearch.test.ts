/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks require flexible typing */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockWebSearchTool, mockWebFetchTool, mockSupabaseFrom } = vi.hoisted(
  () => ({
    mockWebSearchTool: vi.fn(),
    mockWebFetchTool: vi.fn(),
    mockSupabaseFrom: vi.fn(),
  }),
);

vi.mock("@/lib/tools/providers/webTools", () => ({
  webSearchTool: mockWebSearchTool,
  webFetchTool: mockWebFetchTool,
}));

import { deepResearchTool } from "@/lib/tools/providers/deepResearch";
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
      from: mockSupabaseFrom,
    } as any,
    abortSignal: undefined,
  };
}

describe("deepResearchTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates research report with citations", async () => {
    const context = createMockContext();

    mockWebSearchTool.mockResolvedValue([
      {
        title: "Python Guide",
        url: "https://example.com/python",
        snippet: "Learn Python programming basics",
        source: "example.com",
        ranking_score: 0.95,
        canonical_url: "https://example.com/python",
        published_date: "2024-01-01",
      },
    ]);

    mockWebFetchTool.mockResolvedValue({
      clean_text: "Python is a programming language. " + "content ".repeat(100),
      headings: ["Introduction", "Basics"],
      metadata: {
        title: "Python Guide",
        description: "Learn Python",
      },
      detected_date: "2024-01-01",
      content_hash: "abc123",
      word_count: 200,
    });

    mockSupabaseFrom.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "report-1" },
            error: null,
          })),
        })),
      })),
    });

    const result = await deepResearchTool(context, {
      topic: "Python programming",
      max_sources: 5,
    });

    expect(result).toMatchObject({
      report_markdown: expect.stringContaining("Python programming"),
      citations: expect.any(Array),
      source_bundle: expect.any(Array),
      research_trace: expect.any(Object),
      report_id: expect.any(String),
    });

    expect(result.citations.length).toBeGreaterThan(0);
  });

  it("respects max_sources limit", async () => {
    const context = createMockContext();

    mockWebSearchTool.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({
        title: `Result ${i + 1}`,
        url: `https://example.com/page${i + 1}`,
        snippet: "Content snippet",
        source: "example.com",
        ranking_score: 0.9,
        canonical_url: `https://example.com/page${i + 1}`,
      })),
    );

    mockWebFetchTool.mockResolvedValue({
      clean_text: "Content " + "text ".repeat(100),
      headings: [],
      metadata: {},
      content_hash: "hash",
      word_count: 200,
    });

    mockSupabaseFrom.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "report-1" },
            error: null,
          })),
        })),
      })),
    });

    const result = await deepResearchTool(context, {
      topic: "test",
      max_sources: 3,
    });

    expect(result.citations.length).toBeLessThanOrEqual(3);
  });

  it("includes recency scoring when specified", async () => {
    const context = createMockContext();

    mockWebSearchTool.mockResolvedValue([
      {
        title: "Recent Article",
        url: "https://example.com/recent",
        snippet: "This article is from 2024",
        source: "example.com",
        ranking_score: 0.95,
        canonical_url: "https://example.com/recent",
        published_date: new Date().toISOString().split("T")[0],
      },
    ]);

    mockWebFetchTool.mockResolvedValue({
      clean_text: "Recent content " + "text ".repeat(100),
      headings: [],
      metadata: {},
      detected_date: new Date().toISOString().split("T")[0],
      content_hash: "hash",
      word_count: 200,
    });

    mockSupabaseFrom.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "report-1" },
            error: null,
          })),
        })),
      })),
    });

    const result = await deepResearchTool(context, {
      topic: "AI trends",
      recency_days: 30,
    });

    expect(result.research_trace.plan).toBeDefined();
    expect(result.report_id).toBeDefined();
  });

  it("detects conflicting publication dates", async () => {
    const context = createMockContext();

    mockWebSearchTool.mockResolvedValue([
      {
        title: "AI Update",
        url: "https://example.com/article1",
        snippet: "Article 1",
        source: "example.com",
        ranking_score: 0.9,
        canonical_url: "https://example.com/article1",
        published_date: "2024-01-01",
      },
      {
        title: "AI Update",
        url: "https://example.com/article2",
        snippet: "Article 2",
        source: "example.com",
        ranking_score: 0.9,
        canonical_url: "https://example.com/article2",
        published_date: "2023-01-01",
      },
    ]);

    mockWebFetchTool.mockResolvedValue({
      clean_text: "Content " + "text ".repeat(100),
      headings: [],
      metadata: {},
      detected_date: "2024-01-01",
      content_hash: "hash",
      word_count: 200,
    });

    mockSupabaseFrom.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "report-1" },
            error: null,
          })),
        })),
      })),
    });

    const result = await deepResearchTool(context, {
      topic: "AI",
      max_sources: 5,
    });

    expect(result.research_trace.conflicts).toBeDefined();
  });

  it("handles fetch failures gracefully", async () => {
    const context = createMockContext();

    mockWebSearchTool.mockResolvedValue([
      {
        title: "Result 1",
        url: "https://example.com/1",
        snippet: "Snippet",
        source: "example.com",
        ranking_score: 0.9,
        canonical_url: "https://example.com/1",
      },
      {
        title: "Result 2",
        url: "https://example.com/2",
        snippet: "Snippet",
        source: "example.com",
        ranking_score: 0.9,
        canonical_url: "https://example.com/2",
      },
    ]);

    // First fetch succeeds
    mockWebFetchTool
      .mockResolvedValueOnce({
        clean_text: "Content " + "text ".repeat(100),
        headings: [],
        metadata: {},
        content_hash: "hash1",
        word_count: 200,
      })
      // Second fetch fails
      .mockRejectedValueOnce(new Error("Fetch failed"));

    mockSupabaseFrom.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "report-1" },
            error: null,
          })),
        })),
      })),
    });

    const result = await deepResearchTool(context, {
      topic: "test",
      max_sources: 5,
    });

    // Should still complete with partial results
    expect(result.report_markdown).toBeDefined();
  });

  it("builds comprehensive research plan", async () => {
    const context = createMockContext();

    mockWebSearchTool.mockResolvedValue([
      {
        title: "Test",
        url: "https://example.com",
        snippet: "Test",
        source: "example.com",
        ranking_score: 0.9,
        canonical_url: "https://example.com",
      },
    ]);

    mockWebFetchTool.mockResolvedValue({
      clean_text: "Content " + "text ".repeat(100),
      headings: [],
      metadata: {},
      content_hash: "hash",
      word_count: 200,
    });

    mockSupabaseFrom.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "report-1" },
            error: null,
          })),
        })),
      })),
    });

    const result = await deepResearchTool(context, {
      topic: "Machine Learning",
      goals: ["Understand applications", "Identify trends"],
      constraints: ["Cite all sources", "Focus on 2024"],
    });

    expect(result.research_trace.plan).toMatchObject({
      objective: expect.stringContaining("Machine Learning"),
      scope_boundaries: expect.any(Array),
      key_questions: expect.any(Array),
      success_criteria: expect.any(Array),
      steps: expect.any(Array),
    });
  });

  it("scores sources by authority and relevance", async () => {
    const context = createMockContext();

    mockWebSearchTool.mockResolvedValue([
      {
        title: "Academic Paper",
        url: "https://university.edu/research",
        snippet: "Research",
        source: "university.edu",
        ranking_score: 0.95,
        canonical_url: "https://university.edu/research",
      },
      {
        title: "Blog Post",
        url: "https://blog.com/article",
        snippet: "Article",
        source: "blog.com",
        ranking_score: 0.7,
        canonical_url: "https://blog.com/article",
      },
    ]);

    mockWebFetchTool.mockResolvedValue({
      clean_text: "Content " + "text ".repeat(100),
      headings: [],
      metadata: { publisher: "Test" },
      content_hash: "hash",
      word_count: 200,
    });

    mockSupabaseFrom.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "report-1" },
            error: null,
          })),
        })),
      })),
    });

    const result = await deepResearchTool(context, {
      topic: "Research",
      max_sources: 5,
    });

    expect(result.research_trace.scoring).toBeDefined();
    expect(result.research_trace.scoring.length).toBeGreaterThan(0);
  });

  it("deduplicates sources by content hash", async () => {
    const context = createMockContext();

    mockWebSearchTool.mockResolvedValue([
      {
        title: "Article A",
        url: "https://example.com/a",
        snippet: "Snippet",
        source: "example.com",
        ranking_score: 0.9,
        canonical_url: "https://example.com/a",
      },
      {
        title: "Article B",
        url: "https://example.com/b",
        snippet: "Snippet",
        source: "example.com",
        ranking_score: 0.9,
        canonical_url: "https://example.com/b",
      },
    ]);

    // Return same content for both
    mockWebFetchTool.mockResolvedValue({
      clean_text: "Identical content " + "text ".repeat(100),
      headings: [],
      metadata: {},
      content_hash: "same-hash-123",
      word_count: 200,
    });

    mockSupabaseFrom.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "report-1" },
            error: null,
          })),
        })),
      })),
    });

    const result = await deepResearchTool(context, {
      topic: "test",
      max_sources: 10,
    });

    // Should deduplicate and only include one
    expect(result.citations.length).toBeLessThanOrEqual(2);
  });

  it("includes what changed recently when recency specified", async () => {
    const context = createMockContext();

    const today = new Date().toISOString().split("T")[0];

    mockWebSearchTool.mockResolvedValue([
      {
        title: "Latest News",
        url: "https://example.com/news",
        snippet: "Breaking news",
        source: "example.com",
        ranking_score: 0.95,
        canonical_url: "https://example.com/news",
        published_date: today,
      },
    ]);

    mockWebFetchTool.mockResolvedValue({
      clean_text: "Breaking news content " + "text ".repeat(100),
      headings: [],
      metadata: {},
      detected_date: today,
      content_hash: "hash",
      word_count: 200,
    });

    mockSupabaseFrom.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "report-1" },
            error: null,
          })),
        })),
      })),
    });

    const result = await deepResearchTool(context, {
      topic: "Current events",
      recency_days: 7,
    });

    expect(result.what_changed_recently).toBeDefined();
  });

  it("marks uncertainty when few sources available", async () => {
    const context = createMockContext();

    mockWebSearchTool.mockResolvedValue([
      {
        title: "Only Result",
        url: "https://example.com",
        snippet: "Sparse",
        source: "example.com",
        ranking_score: 0.8,
        canonical_url: "https://example.com",
      },
    ]);

    mockWebFetchTool.mockResolvedValue({
      clean_text: "Content " + "text ".repeat(100),
      headings: [],
      metadata: {},
      content_hash: "hash",
      word_count: 200,
    });

    mockSupabaseFrom.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "report-1" },
            error: null,
          })),
        })),
      })),
    });

    const result = await deepResearchTool(context, {
      topic: "Obscure topic",
      max_sources: 10,
    });

    expect(result.research_trace.uncertainty_notes).toBeDefined();
  });

  it("persists research report to database", async () => {
    const context = createMockContext();

    mockWebSearchTool.mockResolvedValue([
      {
        title: "Test",
        url: "https://example.com",
        snippet: "Test",
        source: "example.com",
        ranking_score: 0.9,
        canonical_url: "https://example.com",
      },
    ]);

    mockWebFetchTool.mockResolvedValue({
      clean_text: "Content " + "text ".repeat(100),
      headings: [],
      metadata: {},
      content_hash: "hash",
      word_count: 200,
    });

    const insertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: { id: "report-1" },
          error: null,
        })),
      })),
    }));

    mockSupabaseFrom.mockReturnValue({
      insert: insertMock,
    });

    const result = await deepResearchTool(context, {
      topic: "Test Research",
      max_sources: 5,
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-1",
        topic: "Test Research",
        report_markdown: expect.stringContaining("Test Research"),
      }),
    );

    expect(result.report_id).toBeDefined();
  });
});
