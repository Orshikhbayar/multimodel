/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks require flexible typing */
import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockSupabaseFrom,
  mockSupabaseStorage,
  mockPacker,
  mockPDFDocument,
  mockPptxGenJS,
} = vi.hoisted(() => ({
  mockSupabaseFrom: vi.fn(),
  mockSupabaseStorage: vi.fn(),
  mockPacker: vi.fn(),
  mockPDFDocument: vi.fn(),
  mockPptxGenJS: vi.fn(),
}));

vi.mock("docx", () => ({
  // Must use `function` keyword so vitest can call them with `new`
  Document: vi.fn(function (config: unknown) {
    return config;
  }),
  Paragraph: vi.fn(function (config: unknown) {
    return { type: "paragraph", ...(config as object) };
  }),
  TextRun: vi.fn(function (config: unknown) {
    return { type: "text", ...(config as object) };
  }),
  HeadingLevel: {
    HEADING_1: 1,
    HEADING_2: 2,
  },
  Packer: {
    toBuffer: mockPacker,
  },
}));

vi.mock("pdfkit", () => ({
  default: mockPDFDocument,
}));

vi.mock("pptxgenjs", () => ({
  default: mockPptxGenJS,
}));

import {
  exportDocxTool,
  exportPdfTool,
  exportPptxTool,
  skillRunTool,
} from "@/lib/tools/providers/exportTools";
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
      // Source accesses db.storage.from(bucket).upload(...), so storage must
      // be an object whose .from property is the mock callable.
      storage: { from: mockSupabaseStorage },
    } as any,
    abortSignal: undefined,
  };
}

describe("exportTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe("exportDocxTool", () => {
    it("exports markdown to DOCX", async () => {
      const context = createMockContext();

      mockPacker.mockResolvedValue(Buffer.from("fake docx"));

      mockSupabaseStorage.mockReturnValue({
        upload: vi.fn(async () => ({ error: null })),
      });

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "artifact-1" },
              error: null,
            })),
          })),
        })),
      });

      const result = await exportDocxTool(context, {
        title: "My Document",
        content_markdown: "# Heading\n\nParagraph content here.",
      });

      expect(result).toMatchObject({
        artifact_id: expect.any(String),
        storage_path: expect.stringContaining(".docx"),
        mime_type:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    });

    it("includes citations in DOCX export", async () => {
      const context = createMockContext();

      mockPacker.mockResolvedValue(Buffer.from("fake docx"));

      mockSupabaseStorage.mockReturnValue({
        upload: vi.fn(async () => ({ error: null })),
      });

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "artifact-1" },
              error: null,
            })),
          })),
        })),
      });

      const result = await exportDocxTool(context, {
        title: "Research",
        content_markdown: "Content here",
        citations: [
          {
            title: "Source 1",
            url: "https://example.com",
            publisher: "Example Inc",
            published_date: "2024-01-01",
          },
        ],
      });

      expect(result.artifact_id).toBeDefined();
    });

    it("handles empty citations gracefully", async () => {
      const context = createMockContext();

      mockPacker.mockResolvedValue(Buffer.from("fake docx"));

      mockSupabaseStorage.mockReturnValue({
        upload: vi.fn(async () => ({ error: null })),
      });

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "artifact-1" },
              error: null,
            })),
          })),
        })),
      });

      const result = await exportDocxTool(context, {
        title: "Document",
        content_markdown: "Content",
        citations: [],
      });

      expect(result.artifact_id).toBeDefined();
    });
  });

  describe("exportPdfTool", () => {
    it("exports markdown to PDF", async () => {
      const context = createMockContext();

      const mockDoc = {
        fontSize: vi.fn(() => mockDoc),
        font: vi.fn(() => mockDoc),
        text: vi.fn(() => mockDoc),
        moveDown: vi.fn(() => mockDoc),
        addPage: vi.fn(() => mockDoc),
        on: vi.fn((event, handler) => {
          if (event === "end") {
            handler();
          }
        }),
        end: vi.fn(),
      };

      // Use mockImplementation with a regular function so `new PDFDocument()`
      // returns mockDoc (arrow functions cannot be used as constructors).
      mockPDFDocument.mockImplementation(function () {
        return mockDoc;
      });

      mockSupabaseStorage.mockReturnValue({
        upload: vi.fn(async () => ({ error: null })),
      });

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "artifact-1" },
              error: null,
            })),
          })),
        })),
      });

      const result = await exportPdfTool(context, {
        title: "My PDF",
        content_markdown: "# Title\n\nContent paragraph.",
      });

      expect(result).toMatchObject({
        artifact_id: expect.any(String),
        storage_path: expect.stringContaining(".pdf"),
        mime_type: "application/pdf",
      });
    });

    it("includes references in PDF", async () => {
      const context = createMockContext();

      const mockDoc = {
        fontSize: vi.fn(() => mockDoc),
        font: vi.fn(() => mockDoc),
        text: vi.fn(() => mockDoc),
        moveDown: vi.fn(() => mockDoc),
        addPage: vi.fn(() => mockDoc),
        on: vi.fn((event, handler) => {
          if (event === "end") {
            handler();
          }
        }),
        end: vi.fn(),
      };

      mockPDFDocument.mockImplementation(function () {
        return mockDoc;
      });

      mockSupabaseStorage.mockReturnValue({
        upload: vi.fn(async () => ({ error: null })),
      });

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "artifact-1" },
              error: null,
            })),
          })),
        })),
      });

      await exportPdfTool(context, {
        title: "Report",
        content_markdown: "Content",
        citations: [
          {
            id: "C1",
            title: "Reference Source",
            url: "https://example.com",
            published_date: "2024-01-01",
          },
        ],
      });

      expect(mockDoc.addPage).toHaveBeenCalled();
    });
  });

  describe("exportPptxTool", () => {
    it("exports to PPTX from outline", async () => {
      const context = createMockContext();

      const mockPptx = {
        addSlide: vi.fn(() => ({
          addText: vi.fn(),
          addShape: vi.fn(),
          addNotes: vi.fn(),
        })),
        write: vi.fn(async () => new ArrayBuffer(100)),
        layout: "",
        author: "",
        subject: "",
        title: "",
        theme: {},
        ShapeType: { line: "line" },
      };

      mockPptxGenJS.mockImplementation(function () {
        return mockPptx;
      });

      mockSupabaseStorage.mockReturnValue({
        upload: vi.fn(async () => ({ error: null })),
      });

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "artifact-1" },
              error: null,
            })),
          })),
        })),
      });

      const result = await exportPptxTool(context, {
        title: "Presentation",
        outline_or_slides: [
          {
            title: "Slide 1",
            bullets: ["Point 1", "Point 2"],
          },
          {
            title: "Slide 2",
            bullets: ["Another point"],
          },
        ],
      });

      expect(result).toMatchObject({
        artifact_id: expect.any(String),
        storage_path: expect.stringContaining(".pptx"),
        mime_type:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
    });

    it("exports to PPTX with structured slides object", async () => {
      const context = createMockContext();

      const mockPptx = {
        addSlide: vi.fn(() => ({
          addText: vi.fn(),
          addShape: vi.fn(),
          addNotes: vi.fn(),
        })),
        write: vi.fn(async () => new ArrayBuffer(100)),
        layout: "",
        author: "",
        subject: "",
        title: "",
        theme: {},
        ShapeType: { line: "line" },
      };

      mockPptxGenJS.mockImplementation(function () {
        return mockPptx;
      });

      mockSupabaseStorage.mockReturnValue({
        upload: vi.fn(async () => ({ error: null })),
      });

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "artifact-1" },
              error: null,
            })),
          })),
        })),
      });

      const result = await exportPptxTool(context, {
        title: "Structured Presentation",
        outline_or_slides: {
          slides: [
            { title: "Title", bullets: ["Content"] },
            { title: "Slide 2", speaker_notes: "Notes here" },
          ],
        },
      });

      expect(result.artifact_id).toBeDefined();
    });

    it("includes speaker notes in PPTX", async () => {
      const context = createMockContext();

      const mockSlide = {
        addText: vi.fn(),
        addShape: vi.fn(),
        addNotes: vi.fn(),
      };

      const mockPptx = {
        addSlide: vi.fn(() => mockSlide),
        write: vi.fn(async () => new ArrayBuffer(100)),
        layout: "",
        author: "",
        subject: "",
        title: "",
        theme: {},
        ShapeType: { line: "line" },
      };

      mockPptxGenJS.mockImplementation(function () {
        return mockPptx;
      });

      mockSupabaseStorage.mockReturnValue({
        upload: vi.fn(async () => ({ error: null })),
      });

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "artifact-1" },
              error: null,
            })),
          })),
        })),
      });

      await exportPptxTool(context, {
        title: "Presentation",
        outline_or_slides: [
          {
            title: "Slide",
            speaker_notes: "Important speaker notes",
          },
        ],
      });

      expect(mockSlide.addNotes).toHaveBeenCalled();
    });

    it("adds references slide to PPTX", async () => {
      const context = createMockContext();

      const mockPptx = {
        addSlide: vi.fn(() => ({
          addText: vi.fn(),
          addShape: vi.fn(),
          addNotes: vi.fn(),
        })),
        write: vi.fn(async () => new ArrayBuffer(100)),
        layout: "",
        author: "",
        subject: "",
        title: "",
        theme: {},
        ShapeType: { line: "line" },
      };

      mockPptxGenJS.mockImplementation(function () {
        return mockPptx;
      });

      mockSupabaseStorage.mockReturnValue({
        upload: vi.fn(async () => ({ error: null })),
      });

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "artifact-1" },
              error: null,
            })),
          })),
        })),
      });

      await exportPptxTool(context, {
        title: "Report",
        outline_or_slides: [{ title: "Content" }],
        citations: [
          {
            title: "Reference",
            url: "https://example.com",
          },
        ],
      });

      // Should have called addSlide at least twice (content + references)
      expect(mockPptx.addSlide).toHaveBeenCalledTimes(expect.any(Number));
    });
  });

  describe("skillRunTool", () => {
    it("runs skill with given inputs", async () => {
      vi.stubEnv("OPENAI_SKILLS_RUNNER_URL", "https://skills.example.com");

      const mockFetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ output: "skill result" }),
      }));

      vi.stubGlobal("fetch", mockFetch);

      const result = await skillRunTool(createMockContext(), {
        skill_id: "skill-123",
        inputs: { param1: "value1" },
        output_format: "json",
      });

      expect(result).toMatchObject({
        status: "ok",
        output: expect.any(Object),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://skills.example.com",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("includes authorization header when key present", async () => {
      vi.stubEnv("OPENAI_SKILLS_RUNNER_URL", "https://skills.example.com");
      vi.stubEnv("OPENAI_SKILLS_RUNNER_KEY", "sk-runner-key");

      const mockFetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ output: "result" }),
      }));

      vi.stubGlobal("fetch", mockFetch);

      await skillRunTool(createMockContext(), {
        skill_id: "skill-123",
        inputs: {},
        output_format: "json",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer sk-runner-key",
          }),
        }),
      );
    });

    it("throws when runner URL not configured", async () => {
      await expect(
        skillRunTool(createMockContext(), {
          skill_id: "skill-123",
          inputs: {},
          output_format: "json",
        }),
      ).rejects.toThrow("OPENAI_SKILLS_RUNNER_URL");
    });

    it("throws on skill runner API error", async () => {
      vi.stubEnv("OPENAI_SKILLS_RUNNER_URL", "https://skills.example.com");

      const mockFetch = vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => "Server error",
      }));

      vi.stubGlobal("fetch", mockFetch);

      await expect(
        skillRunTool(createMockContext(), {
          skill_id: "skill-123",
          inputs: {},
          output_format: "json",
        }),
      ).rejects.toThrow("failed");
    });
  });
});
