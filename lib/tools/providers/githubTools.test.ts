/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks require flexible typing */
import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockFetch,
  mockEncryptToken,
  mockDecryptToken,
  mockDetectSecrets,
  mockContainsSecret,
  mockRedactSecrets,
} = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockEncryptToken: vi.fn((token) => Buffer.from(token)),
  mockDecryptToken: vi.fn((buffer) => buffer.toString()),
  mockDetectSecrets: vi.fn(() => []),
  mockContainsSecret: vi.fn(() => false),
  mockRedactSecrets: vi.fn((text) => text),
}));

vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/security/encryption", () => ({
  encryptToken: mockEncryptToken,
  decryptToken: mockDecryptToken,
}));

vi.mock("@/lib/security/secrets", () => ({
  detectSecretsInText: mockDetectSecrets,
  containsLikelySecret: mockContainsSecret,
  redactSecretsInText: mockRedactSecrets,
}));

import {
  githubConnectRepoTool,
  repoIndexTool,
  repoListFilesTool,
  repoReadFileTool,
  repoSearchTool,
  proposePatchTool,
  applyPatchTool,
  createPullRequestTool,
} from "@/lib/tools/providers/githubTools";
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
      from: vi.fn(),
    } as any,
    abortSignal: undefined,
  };
}

describe("githubTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("githubConnectRepoTool", () => {
    it("connects a GitHub repository", async () => {
      const context = createMockContext();
      const mockFrom = vi.fn();

      (context.supabase.from as any) = mockFrom;

      mockFrom.mockReturnValue({
        upsert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "int-123" },
              error: null,
            })),
          })),
        })),
      });

      mockFrom.mockReturnValueOnce({
        upsert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "int-123" },
              error: null,
            })),
          })),
        })),
      });

      const result = await githubConnectRepoTool(context, {
        owner: "testuser",
        name: "testrepo",
        access_token: "ghp_test_token",
        default_branch: "main",
      });

      expect(result).toMatchObject({
        repo_id: expect.any(String),
        integration_id: expect.any(String),
      });
    });

    it("fails on integration upsert error", async () => {
      const context = createMockContext();
      const mockFrom = vi.fn();

      (context.supabase.from as any) = mockFrom;

      mockFrom.mockReturnValue({
        upsert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: null,
              error: new Error("Integration error"),
            })),
          })),
        })),
      });

      await expect(
        githubConnectRepoTool(context, {
          owner: "testuser",
          name: "testrepo",
          access_token: "ghp_test_token",
        }),
      ).rejects.toThrow("integration");
    });
  });

  describe("repoIndexTool", () => {
    it("indexes repository files", async () => {
      const context = createMockContext();
      const mockFrom = vi.fn();

      (context.supabase.from as any) = mockFrom;

      mockFrom.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "repo-1",
                owner: "testuser",
                name: "testrepo",
                default_branch: "main",
                workspace_id: "ws-1",
                protected_branches: ["main"],
              },
              error: null,
            })),
          })),
        })),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            tree: [
              { path: "README.md", type: "blob", sha: "abc123", size: 1024 },
              { path: "src/index.ts", type: "blob", sha: "def456", size: 2048 },
            ],
          }),
      });

      mockFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "repo-1",
                owner: "testuser",
                name: "testrepo",
                default_branch: "main",
                workspace_id: "ws-1",
                protected_branches: ["main"],
              },
              error: null,
            })),
          })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        })),
        insert: vi.fn(async () => ({ error: null })),
      });

      const result = await repoIndexTool(context, { repo_id: "repo-1" });

      expect(result).toMatchObject({
        indexed_files: expect.any(Number),
        branch: "main",
      });
    });
  });

  describe("repoListFilesTool", () => {
    it("lists repository files", async () => {
      const context = createMockContext();
      const mockFrom = vi.fn();

      (context.supabase.from as any) = mockFrom;

      mockFrom.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "repo-1",
                owner: "testuser",
                name: "testrepo",
                default_branch: "main",
                workspace_id: "ws-1",
                protected_branches: ["main"],
              },
              error: null,
            })),
          })),
        })),
      });

      mockFrom.mockReturnValueOnce({
        select: vi.fn(async () => ({
          data: [
            { path: "README.md", size_bytes: 1024, sha: "abc123" },
            { path: "package.json", size_bytes: 512, sha: "def456" },
          ],
          error: null,
        })),
      });

      const result = await repoListFilesTool(context, { repo_id: "repo-1" });

      expect(result).toMatchObject({
        files: expect.any(Array),
        branch: "main",
      });
      expect(result.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "README.md" }),
        ]),
      );
    });

    it("filters files by path prefix", async () => {
      const context = createMockContext();
      const mockFrom = vi.fn();

      (context.supabase.from as any) = mockFrom;

      mockFrom.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "repo-1",
                owner: "testuser",
                name: "testrepo",
                default_branch: "main",
                workspace_id: "ws-1",
              },
              error: null,
            })),
          })),
        })),
      });

      mockFrom.mockReturnValueOnce({
        select: vi.fn(async () => ({
          data: [
            { path: "src/index.ts", size_bytes: 2048, sha: "abc123" },
            { path: "src/utils.ts", size_bytes: 1024, sha: "def456" },
            { path: "README.md", size_bytes: 512, sha: "ghi789" },
          ],
          error: null,
        })),
      });

      const result = await repoListFilesTool(context, {
        repo_id: "repo-1",
        path: "src/",
      });

      expect(result.files.every((f) => f.path.startsWith("src/"))).toBe(true);
    });
  });

  describe("repoReadFileTool", () => {
    it("reads file content from repository", async () => {
      const context = createMockContext();
      const mockFrom = vi.fn();

      (context.supabase.from as any) = mockFrom;

      mockFrom.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "repo-1",
                owner: "testuser",
                name: "testrepo",
                default_branch: "main",
              },
              error: null,
            })),
          })),
        })),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            content: Buffer.from("console.log('test');").toString("base64"),
            sha: "abc123",
            encoding: "base64",
          }),
      });

      mockFrom.mockReturnValueOnce({
        upsert: vi.fn(async () => ({ error: null })),
      });

      const result = await repoReadFileTool(context, {
        repo_id: "repo-1",
        path: "index.js",
      });

      expect(result).toMatchObject({
        path: "index.js",
        content: expect.any(String),
        sha: "abc123",
      });
    });
  });

  describe("repoSearchTool", () => {
    it("searches file content in repository", async () => {
      const context = createMockContext();
      const mockFrom = vi.fn();

      (context.supabase.from as any) = mockFrom;

      mockFrom.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "repo-1",
                owner: "testuser",
                name: "testrepo",
                default_branch: "main",
              },
              error: null,
            })),
          })),
        })),
      });

      mockFrom.mockReturnValueOnce({
        select: vi.fn(async () => ({
          data: [
            {
              path: "src/index.ts",
              content: "function test() { return 42; }",
            },
            {
              path: "src/utils.ts",
              content: "export function helper() { return 'test'; }",
            },
          ],
          error: null,
        })),
      });

      const result = await repoSearchTool(context, {
        repo_id: "repo-1",
        query: "test",
      });

      expect(result).toMatchObject({
        matches: expect.any(Array),
      });
      expect(result.matches.length).toBeGreaterThan(0);
    });
  });

  describe("proposePatchTool", () => {
    it("validates unified diff format", async () => {
      const validDiff = `diff --git a/file.txt b/file.txt
index abc123..def456 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 line 1
-old line 2
+new line 2
 line 3`;

      const result = await proposePatchTool(createMockContext(), {
        repo_id: "repo-1",
        diff_unified: validDiff,
        rationale: "Fix bug in file",
      });

      expect(result).toMatchObject({
        accepted: true,
        warnings: expect.any(Array),
        stats: expect.objectContaining({
          files: expect.any(Number),
          additions: expect.any(Number),
          deletions: expect.any(Number),
        }),
      });
    });

    it("warns on large diffs", async () => {
      const largeDiff = `diff --git a/file.txt b/file.txt
index abc123..def456 100644
--- a/file.txt
+++ b/file.txt
@@ -1,100 +1,150 @@
${Array.from({ length: 100 }, (_, i) => `+added line ${i}`).join("\n")}`;

      const result = await proposePatchTool(createMockContext(), {
        repo_id: "repo-1",
        diff_unified: largeDiff,
        rationale: "Large change",
      });

      expect(result.warnings.some((w) => w.includes("Large"))).toBe(false);
    });

    it("flags potential secrets in diff", async () => {
      mockDetectSecrets.mockReturnValue([
        { type: "AWS_KEY", match: "AKIA..." },
      ]);

      const diffWithSecret = `diff --git a/config.txt b/config.txt
--- a/config.txt
+++ b/config.txt
@@ -1,1 +1,2 @@
+AWS_KEY=AKIAIOSFODNN7EXAMPLE`;

      const result = await proposePatchTool(createMockContext(), {
        repo_id: "repo-1",
        diff_unified: diffWithSecret,
        rationale: "Add config",
      });

      expect(result.warnings.some((w) => w.includes("secret"))).toBe(true);
    });

    it("rejects empty diffs", async () => {
      await expect(
        proposePatchTool(createMockContext(), {
          repo_id: "repo-1",
          diff_unified: "no diff content",
          rationale: "Invalid",
        }),
      ).rejects.toThrow("No file changes");
    });
  });

  describe("applyPatchTool", () => {
    it("requires explicit approval", async () => {
      const validDiff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,1 +1,1 @@
-old
+new`;

      await expect(
        applyPatchTool(createMockContext(), {
          repo_id: "repo-1",
          branch: "feature-branch",
          diff_unified: validDiff,
          commit_message: "Fix bug",
          approved: false,
        }),
      ).rejects.toThrow("approved");
    });

    it("requires approval note", async () => {
      const validDiff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,1 +1,1 @@
-old
+new`;

      await expect(
        applyPatchTool(createMockContext(), {
          repo_id: "repo-1",
          branch: "feature-branch",
          diff_unified: validDiff,
          commit_message: "Fix bug",
          approved: true,
          approval_note: "short",
        }),
      ).rejects.toThrow("approval_note");
    });

    it("blocks protected branches", async () => {
      const context = createMockContext();
      const mockFrom = vi.fn();

      (context.supabase.from as any) = mockFrom;

      mockFrom.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "repo-1",
                owner: "testuser",
                name: "testrepo",
                default_branch: "main",
                protected_branches: ["main", "master"],
              },
              error: null,
            })),
          })),
        })),
      });

      const validDiff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,1 +1,1 @@
-old
+new`;

      await expect(
        applyPatchTool(context, {
          repo_id: "repo-1",
          branch: "main",
          diff_unified: validDiff,
          commit_message: "Fix",
          approved: true,
          approval_note: "Long enough approval note here",
        }),
      ).rejects.toThrow("protected");
    });
  });

  describe("createPullRequestTool", () => {
    it("requires explicit approval", async () => {
      await expect(
        createPullRequestTool(createMockContext(), {
          repo_id: "repo-1",
          title: "New Feature",
          body: "Description",
          branch: "feature-branch",
          approved: false,
        }),
      ).rejects.toThrow("approved");
    });

    it("creates pull request with valid inputs", async () => {
      const context = createMockContext();
      const mockFrom = vi.fn();

      (context.supabase.from as any) = mockFrom;

      mockFrom.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: "repo-1",
                owner: "testuser",
                name: "testrepo",
                default_branch: "main",
              },
              error: null,
            })),
          })),
        })),
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: async () =>
            JSON.stringify({
              files: [{ filename: "file.txt", patch: "+new" }],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () =>
            JSON.stringify({
              number: 42,
              html_url: "https://github.com/user/repo/pull/42",
              title: "New Feature",
              head: { ref: "feature-branch" },
              base: { ref: "main" },
            }),
        });

      const result = await createPullRequestTool(context, {
        repo_id: "repo-1",
        title: "New Feature",
        body: "Feature description",
        branch: "feature-branch",
        approved: true,
        approval_note: "Reviewed and approved",
      });

      expect(result).toMatchObject({
        number: 42,
        url: expect.stringContaining("github.com"),
        title: "New Feature",
        head: "feature-branch",
        base: "main",
      });
    });
  });
});
