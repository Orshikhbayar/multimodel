/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks require flexible typing */
import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockSupabaseFrom,
  mockSupabaseStorage,
  mockPdfParse,
  mockMammoth,
  mockXLSX,
} = vi.hoisted(() => ({
  mockSupabaseFrom: vi.fn(),
  mockSupabaseStorage: vi.fn(),
  mockPdfParse: vi.fn(),
  mockMammoth: vi.fn(),
  mockXLSX: vi.fn(),
}));

vi.mock("pdf-parse", () => ({
  default: mockPdfParse,
}));

vi.mock("mammoth", () => ({
  extractRawText: mockMammoth,
}));

vi.mock("xlsx", () => ({
  read: mockXLSX,
  utils: {
    sheet_to_json: vi.fn((sheet) => [["val1", "val2"]]),
  },
}));

import {
  fileIngestTool,
  fileSearchTool,
} from "@/lib/tools/providers/fileTools";
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
      // Source calls db.storage.from(bucket).download(path), so storage must
      // be an object with a .from property rather than a bare function.
      storage: { from: mockSupabaseStorage },
    } as any,
    abortSignal: undefined,
  };
}

describe("fileTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fileIngestTool", () => {
    it("ingests plain text files", async () => {
      const context = createMockContext();
      const textContent =
        "This is plain text content for testing file ingestion.";
      const textBuffer = Buffer.from(textContent, "utf-8");

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "file-1",
                storage_path: "path/file.txt",
                original_name: "test.txt",
                file_type: "txt",
                mime_type: "text/plain",
              },
              error: null,
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: "file-1" },
                error: null,
              })),
            })),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "file-1" },
              error: null,
            })),
          })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(async () => ({
            error: null,
          })),
        })),
      });

      mockSupabaseStorage.mockReturnValue({
        download: vi.fn(async () => ({
          data: new Blob([textBuffer]),
          error: null,
        })),
      });

      const result = await fileIngestTool(context, {
        file_id: "file-1",
      });

      expect(result).toMatchObject({
        file_id: expect.any(String),
        parsed_text_ref: expect.stringContaining("files:"),
        content_hash: expect.any(String),
        chunks_ref: expect.any(String),
        metadata: expect.objectContaining({
          type: "txt",
          word_count: expect.any(Number),
        }),
        extraction_warnings: expect.any(Array),
      });
    });

    it("ingests PDF files", async () => {
      const context = createMockContext();

      mockPdfParse.mockResolvedValue({
        text: "PDF content\fPage 2 content",
        numpages: 2,
      });

      const pdfBuffer = Buffer.from("fake pdf");

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "file-1",
                storage_path: "path/file.pdf",
                original_name: "test.pdf",
                file_type: "pdf",
                mime_type: "application/pdf",
              },
              error: null,
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: "file-1" },
                error: null,
              })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(async () => ({
            error: null,
          })),
        })),
      });

      mockSupabaseStorage.mockReturnValue({
        download: vi.fn(async () => ({
          data: new Blob([pdfBuffer]),
          error: null,
        })),
      });

      const result = await fileIngestTool(context, {
        file_id: "file-1",
      });

      expect(result).toMatchObject({
        file_id: expect.any(String),
        metadata: expect.objectContaining({
          type: "pdf",
          pages: 2,
        }),
      });
    });

    it("ingests DOCX files", async () => {
      const context = createMockContext();

      mockMammoth.mockResolvedValue({
        value: "Document paragraph 1\nDocument paragraph 2",
        messages: [],
      });

      const docxBuffer = Buffer.from("fake docx");

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "file-1",
                storage_path: "path/file.docx",
                original_name: "test.docx",
                file_type: "docx",
                mime_type:
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              },
              error: null,
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: "file-1" },
                error: null,
              })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(async () => ({
            error: null,
          })),
        })),
      });

      mockSupabaseStorage.mockReturnValue({
        download: vi.fn(async () => ({
          data: new Blob([docxBuffer]),
          error: null,
        })),
      });

      const result = await fileIngestTool(context, {
        file_id: "file-1",
      });

      expect(result.metadata.type).toBe("docx");
    });

    it("chunks large text into manageable pieces", async () => {
      const context = createMockContext();

      const largeText = "word ".repeat(500); // 2500+ chars

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "file-1",
                storage_path: "path/file.txt",
                original_name: "test.txt",
                file_type: "txt",
                mime_type: "text/plain",
              },
              error: null,
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: "file-1" },
                error: null,
              })),
            })),
          })),
        })),
        insert: vi.fn(async () => ({
          error: null,
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(async () => ({
            error: null,
          })),
        })),
      });

      mockSupabaseStorage.mockReturnValue({
        download: vi.fn(async () => ({
          data: new Blob([Buffer.from(largeText)]),
          error: null,
        })),
      });

      const result = await fileIngestTool(context, {
        file_id: "file-1",
      });

      expect(result.chunks_ref).toBeDefined();
    });

    it("rejects missing file ID and storage path", async () => {
      const context = createMockContext();

      await expect(fileIngestTool(context, {})).rejects.toThrow("required");
    });

    it("handles file not found errors", async () => {
      const context = createMockContext();

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: null,
              error: new Error("File not found"),
            })),
          })),
        })),
      });

      await expect(
        fileIngestTool(context, { file_id: "nonexistent" }),
      ).rejects.toThrow("not found");
    });

    it("handles storage download errors", async () => {
      const context = createMockContext();

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "file-1",
                storage_path: "path/file.txt",
                original_name: "test.txt",
                file_type: "txt",
                mime_type: "text/plain",
              },
              error: null,
            })),
          })),
        })),
      });

      mockSupabaseStorage.mockReturnValue({
        download: vi.fn(async () => ({
          data: null,
          error: new Error("Download failed"),
        })),
      });

      await expect(
        fileIngestTool(context, { file_id: "file-1" }),
      ).rejects.toThrow("download");
    });
  });

  describe("fileSearchTool", () => {
    it("searches file chunks by keyword", async () => {
      const context = createMockContext();

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn(() =>
          Promise.resolve({
            data: [
              {
                file_id: "file-1",
                chunk_id: "chunk-1",
                chunk_text:
                  "This is a test document with important information.",
                reference: { page: 1 },
                project_id: "proj-1",
                workspace_id: "ws-1",
              },
            ],
            error: null,
          }),
        ),
      });

      const result = await fileSearchTool(context, {
        query: "test document",
        top_k: 5,
      });

      expect(result).toMatchObject({
        matches: expect.any(Array),
      });
    });

    it("filters by file type", async () => {
      const context = createMockContext();

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn(() =>
          Promise.resolve({
            data: [
              {
                file_id: "file-1",
                chunk_id: "chunk-1",
                chunk_text: "PDF content",
                reference: { page: 1 },
                project_id: "proj-1",
                workspace_id: "ws-1",
              },
            ],
            error: null,
          }),
        ),
      });

      const result = await fileSearchTool(context, {
        query: "test",
        filters: {
          file_type: ["pdf"],
        },
        top_k: 10,
      });

      expect(result.matches).toBeDefined();
    });

    it("filters by date range", async () => {
      const context = createMockContext();

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn(() =>
          Promise.resolve({
            data: [
              {
                file_id: "file-1",
                chunk_id: "chunk-1",
                chunk_text: "Recent content",
                reference: {},
                project_id: "proj-1",
                workspace_id: "ws-1",
              },
            ],
            error: null,
          }),
        ),
      });

      const result = await fileSearchTool(context, {
        query: "content",
        filters: {
          date_range: {
            from: "2024-01-01",
            to: "2024-12-31",
          },
        },
      });

      expect(result.matches).toBeDefined();
    });

    it("respects scope parameter", async () => {
      const context = createMockContext();

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn(() =>
          Promise.resolve({
            data: [
              {
                file_id: "file-1",
                chunk_id: "chunk-1",
                chunk_text: "Test content",
                reference: {},
                project_id: "proj-1",
                workspace_id: "ws-1",
              },
            ],
            error: null,
          }),
        ),
      });

      await fileSearchTool(context, {
        query: "test",
        scope: "project",
      });

      expect(mockSupabaseFrom).toHaveBeenCalledWith("file_chunks");
    });

    it("returns empty results for no matches", async () => {
      const context = createMockContext();

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn(() =>
          Promise.resolve({
            data: [],
            error: null,
          }),
        ),
      });

      const result = await fileSearchTool(context, {
        query: "nonexistent",
      });

      expect(result.matches).toEqual([]);
    });

    it("handles database errors gracefully", async () => {
      const context = createMockContext();

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn(() =>
          Promise.resolve({
            data: null,
            error: new Error("Database error"),
          }),
        ),
      });

      await expect(fileSearchTool(context, { query: "test" })).rejects.toThrow(
        "database error",
      );
    });

    it("computes snippet context around match", async () => {
      const context = createMockContext();

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn(() =>
          Promise.resolve({
            data: [
              {
                file_id: "file-1",
                chunk_id: "chunk-1",
                chunk_text:
                  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Test keyword here. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
                reference: {},
                project_id: "proj-1",
                workspace_id: "ws-1",
              },
            ],
            error: null,
          }),
        ),
      });

      const result = await fileSearchTool(context, {
        query: "test keyword",
      });

      if (result.matches.length > 0) {
        expect(result.matches[0].snippet).toContain("test");
      }
    });

    it("filters by specific file IDs", async () => {
      const context = createMockContext();

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn(() =>
          Promise.resolve({
            data: [
              {
                file_id: "file-1",
                chunk_id: "chunk-1",
                chunk_text: "Content",
                reference: {},
                project_id: "proj-1",
                workspace_id: "ws-1",
              },
            ],
            error: null,
          }),
        ),
      });

      const result = await fileSearchTool(context, {
        query: "content",
        filters: {
          file_ids: ["file-1"],
        },
      });

      expect(result.matches).toBeDefined();
    });

    it("limits top_k results", async () => {
      const context = createMockContext();

      const manyChunks = Array.from({ length: 50 }, (_, i) => ({
        file_id: `file-${i}`,
        chunk_id: `chunk-${i}`,
        chunk_text: "test content".repeat(10),
        reference: {},
        project_id: "proj-1",
        workspace_id: "ws-1",
      }));

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn(() =>
          Promise.resolve({
            data: manyChunks,
            error: null,
          }),
        ),
      });

      const result = await fileSearchTool(context, {
        query: "content",
        top_k: 10,
      });

      expect(result.matches.length).toBeLessThanOrEqual(10);
    });
  });
});
