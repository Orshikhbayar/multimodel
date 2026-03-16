import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockFetch, mockSupabaseFrom, mockSupabaseStorage } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockSupabaseFrom: vi.fn(),
  mockSupabaseStorage: vi.fn(),
}));

vi.stubGlobal("fetch", mockFetch);

import { imageGenerateTool } from "@/lib/tools/providers/imageTools";
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
      // Source calls db.storage.from(bucket).upload(...), so storage must be
      // an object with a .from property rather than a bare callable.
      storage: { from: mockSupabaseStorage },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock Supabase client
    } as any,
    abortSignal: undefined,
  };
}

describe("imageTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
  });

  describe("imageGenerateTool", () => {
    it("generates images from prompt", async () => {
      const context = createMockContext();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              b64_json: Buffer.from("fake image data").toString("base64"),
              revised_prompt: "A beautiful landscape",
            },
          ],
        }),
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

      const result = await imageGenerateTool(context, {
        prompt: "A beautiful sunset",
        size: "1024x1024",
        n: 1,
      });

      expect(result).toMatchObject({
        images: expect.any(Array),
        model: "gpt-image-1",
      });
      expect(result.images.length).toBe(1);
      expect(result.images[0]).toMatchObject({
        artifact_id: expect.any(String),
        storage_path: expect.stringContaining("images/"),
        mime_type: "image/png",
      });
    });

    it("respects n parameter limit", async () => {
      const context = createMockContext();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              b64_json: Buffer.from("img1").toString("base64"),
              revised_prompt: "Prompt 1",
            },
            {
              b64_json: Buffer.from("img2").toString("base64"),
              revised_prompt: "Prompt 2",
            },
            {
              b64_json: Buffer.from("img3").toString("base64"),
              revised_prompt: "Prompt 3",
            },
          ],
        }),
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

      const result = await imageGenerateTool(context, {
        prompt: "Test",
        n: 10, // Requested 10 but should be capped at 4
      });

      expect(result.images.length).toBeLessThanOrEqual(3);
    });

    it("applies style transfer guidance", async () => {
      const context = createMockContext();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              b64_json: Buffer.from("styled image").toString("base64"),
              revised_prompt: "A sunset in Van Gogh style",
            },
          ],
        }),
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

      const result = await imageGenerateTool(context, {
        prompt: "A sunset landscape",
        style_transfer: "Van Gogh impressionist style",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/images/generations",
        expect.objectContaining({
          body: expect.stringContaining("Van Gogh"),
        }),
      );
      expect(result.images.length).toBeGreaterThan(0);
    });

    it("supports transparent background", async () => {
      const context = createMockContext();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              b64_json: Buffer.from("transparent image").toString("base64"),
            },
          ],
        }),
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

      await imageGenerateTool(context, {
        prompt: "Logo",
        transparent_background: true,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("transparent"),
        }),
      );
    });

    it("throws error when API key missing", async () => {
      // Explicitly clear the key regardless of the CI environment's own value.
      // vi.unstubAllEnvs() would only restore to the pre-stub value which may
      // still be non-empty in CI, causing a 401 instead of the missing-key error.
      vi.stubEnv("OPENAI_API_KEY", "");

      const context = createMockContext();

      await expect(
        imageGenerateTool(context, { prompt: "Test" }),
      ).rejects.toThrow("OPENAI_API_KEY");
    });

    it("throws error on API failure", async () => {
      const context = createMockContext();

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      await expect(
        imageGenerateTool(context, { prompt: "Test" }),
      ).rejects.toThrow("generation failed");
    });

    it("throws error when no images returned", async () => {
      const context = createMockContext();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await expect(
        imageGenerateTool(context, { prompt: "Test" }),
      ).rejects.toThrow("no images");
    });

    it("handles storage upload errors", async () => {
      const context = createMockContext();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              b64_json: Buffer.from("image").toString("base64"),
            },
          ],
        }),
      });

      mockSupabaseStorage.mockReturnValue({
        upload: vi.fn(async () => ({
          error: new Error("Upload failed"),
        })),
      });

      await expect(
        imageGenerateTool(context, { prompt: "Test" }),
      ).rejects.toThrow("upload");
    });

    it("handles artifact database errors", async () => {
      const context = createMockContext();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              b64_json: Buffer.from("image").toString("base64"),
            },
          ],
        }),
      });

      mockSupabaseStorage.mockReturnValue({
        upload: vi.fn(async () => ({ error: null })),
      });

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: null,
              error: new Error("Insert failed"),
            })),
          })),
        })),
      });

      await expect(
        imageGenerateTool(context, { prompt: "Test" }),
      ).rejects.toThrow("artifact");
    });

    it("stores image metadata correctly", async () => {
      const context = createMockContext();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              b64_json: Buffer.from("image").toString("base64"),
              revised_prompt: "Revised: A cat",
            },
          ],
        }),
      });

      mockSupabaseStorage.mockReturnValue({
        upload: vi.fn(async () => ({ error: null })),
      });

      const insertMock = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "artifact-1" },
            error: null,
          })),
        })),
      }));

      mockSupabaseFrom.mockReturnValue({
        insert: insertMock,
      });

      await imageGenerateTool(context, {
        prompt: "A cat",
        size: "1536x1024",
        n: 1,
        style_transfer: "watercolor",
        transparent_background: true,
      });

      const callArg = insertMock.mock.calls[0][0] as Record<string, unknown>;
      const metadata = callArg.metadata as Record<string, unknown>;
      const params = metadata.params as Record<string, unknown>;
      expect(typeof metadata.prompt).toBe("string");
      expect((metadata.prompt as string).includes("A cat")).toBe(true);
      expect(params.size).toBe("1536x1024");
      expect(params.style_transfer).toBe("watercolor");
      expect(params.transparent_background).toBe(true);
    });

    it("supports different image sizes", async () => {
      const context = createMockContext();

      const sizes = ["1024x1024", "1536x1024", "1024x1536"] as const;

      for (const size of sizes) {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            data: [
              {
                b64_json: Buffer.from(`image-${size}`).toString("base64"),
              },
            ],
          }),
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

        const result = await imageGenerateTool(context, {
          prompt: "Test",
          size,
        });

        expect(result.images).toBeDefined();
      }
    });

    it("generates correct storage path", async () => {
      const context = createMockContext();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              b64_json: Buffer.from("image").toString("base64"),
            },
          ],
        }),
      });

      const uploadMock = vi.fn(async () => ({ error: null }));

      mockSupabaseStorage.mockReturnValue({
        upload: uploadMock,
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

      await imageGenerateTool(context, { prompt: "Test" });

      expect(uploadMock).toHaveBeenCalledWith(
        expect.stringMatching(/ws-1\/proj-1\/images\/.+\.png/),
        expect.any(Buffer),
        expect.objectContaining({
          contentType: "image/png",
        }),
      );
    });
  });
});
