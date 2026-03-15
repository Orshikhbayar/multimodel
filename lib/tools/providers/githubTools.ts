/* eslint-disable @typescript-eslint/no-explicit-any */

import { Buffer } from "node:buffer";

import { decryptToken, encryptToken } from "@/lib/security/encryption";
import {
  containsLikelySecret,
  detectSecretsInText,
  redactSecretsInText,
} from "@/lib/security/secrets";
import type { ToolExecutionContext } from "@/lib/tools/types";

interface GitHubConnectRepoInput {
  owner: string;
  name: string;
  default_branch?: string;
  installation_id?: string;
  access_token: string;
  enabled_scopes?: string[];
  protected_branches?: string[];
}

interface RepoReferenceInput {
  repo_id: string;
  branch?: string;
}

interface RepoListFilesInput extends RepoReferenceInput {
  path?: string;
  glob?: string;
  force_reindex?: boolean;
}

interface RepoReadFileInput extends RepoReferenceInput {
  path: string;
}

interface RepoSearchInput extends RepoReferenceInput {
  query: string;
  mode?: "keyword" | "semantic";
  top_k?: number;
}

interface ProposePatchInput {
  repo_id: string;
  diff_unified: string;
  rationale: string;
  risk_flags?: string[];
}

interface ApplyPatchInput {
  repo_id: string;
  branch: string;
  diff_unified: string;
  commit_message: string;
  approved: boolean;
  approval_note?: string;
  override_secret_block?: boolean;
}

interface RunChecksInput extends RepoReferenceInput {
  preset?: "quick" | "full";
}

interface CreatePullRequestInput {
  repo_id: string;
  title: string;
  body: string;
  branch: string;
  base_branch?: string;
  approved: boolean;
  approval_note?: string;
  override_secret_block?: boolean;
}

interface RepoRecord {
  id: string;
  owner: string;
  name: string;
  default_branch: string;
  installation_id: string | null;
  integration_id: string;
  protected_branches: string[];
  workspace_id: string;
}

interface IntegrationRecord {
  id: string;
  encrypted_access_token: string;
}

interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

interface FilePatch {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
  isNewFile: boolean;
  isDeletedFile: boolean;
}

function stripGitPrefix(path: string): string {
  return path.replace(/^a\//, "").replace(/^b\//, "");
}

function wildcardMatch(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`,
  );
  return regex.test(value);
}

function parseUnifiedDiff(diff: string): FilePatch[] {
  const lines = diff.split("\n");
  const patches: FilePatch[] = [];

  let current: FilePatch | null = null;
  let currentHunk: DiffHunk | null = null;

  const pushHunk = () => {
    if (current && currentHunk) {
      current.hunks.push(currentHunk);
      currentHunk = null;
    }
  };

  const pushPatch = () => {
    pushHunk();
    if (current) {
      patches.push(current);
      current = null;
    }
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      pushPatch();
      current = {
        oldPath: "",
        newPath: "",
        hunks: [],
        isNewFile: false,
        isDeletedFile: false,
      };
      continue;
    }

    if (!current) continue;

    if (line.startsWith("--- ")) {
      const path = line.slice(4).trim();
      current.oldPath = path === "/dev/null" ? "" : stripGitPrefix(path);
      current.isNewFile = path === "/dev/null";
      continue;
    }

    if (line.startsWith("+++ ")) {
      const path = line.slice(4).trim();
      current.newPath = path === "/dev/null" ? "" : stripGitPrefix(path);
      current.isDeletedFile = path === "/dev/null";
      continue;
    }

    if (line.startsWith("@@ ")) {
      pushHunk();
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!match) {
        throw new Error(`Invalid hunk header: ${line}`);
      }

      currentHunk = {
        oldStart: Number.parseInt(match[1], 10),
        oldLines: Number.parseInt(match[2] ?? "1", 10),
        newStart: Number.parseInt(match[3], 10),
        newLines: Number.parseInt(match[4] ?? "1", 10),
        lines: [],
      };
      continue;
    }

    if (currentHunk) {
      if (
        line.startsWith(" ") ||
        line.startsWith("+") ||
        line.startsWith("-") ||
        line.startsWith("\\")
      ) {
        currentHunk.lines.push(line);
      }
    }
  }

  pushPatch();

  return patches.filter((patch) => patch.newPath || patch.oldPath);
}

function applyPatchToContent(original: string, patch: FilePatch): string {
  const sourceLines = original.split("\n");
  const output: string[] = [];
  let cursor = 0;

  for (const hunk of patch.hunks) {
    const targetStart = Math.max(0, hunk.oldStart - 1);

    output.push(...sourceLines.slice(cursor, targetStart));

    let scan = targetStart;

    for (const line of hunk.lines) {
      const prefix = line[0];
      const content = line.slice(1);

      if (prefix === " ") {
        if (sourceLines[scan] !== content) {
          throw new Error(
            `Patch context mismatch in ${patch.newPath || patch.oldPath} at line ${scan + 1}`,
          );
        }

        output.push(content);
        scan += 1;
        continue;
      }

      if (prefix === "-") {
        if (sourceLines[scan] !== content) {
          throw new Error(
            `Patch deletion mismatch in ${patch.newPath || patch.oldPath} at line ${scan + 1}`,
          );
        }

        scan += 1;
        continue;
      }

      if (prefix === "+") {
        output.push(content);
      }
    }

    cursor = scan;
  }

  output.push(...sourceLines.slice(cursor));
  return output.join("\n");
}

function getDiffStats(diff: string): {
  files: number;
  additions: number;
  deletions: number;
  touchesLockfile: boolean;
} {
  const lines = diff.split("\n");
  let files = 0;
  let additions = 0;
  let deletions = 0;
  let touchesLockfile = false;

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      files += 1;
      if (
        /package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock/.test(line)
      ) {
        touchesLockfile = true;
      }
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }

  return {
    files,
    additions,
    deletions,
    touchesLockfile,
  };
}

function getIntegrationToken(integration: IntegrationRecord): string {
  const decoded = Buffer.from(integration.encrypted_access_token, "base64");
  return decryptToken(decoded);
}

function requireApproval(approved: boolean, note?: string): void {
  if (!approved) {
    throw new Error(
      "Write action requires explicit approved=true confirmation",
    );
  }

  if (!note || note.trim().length < 6) {
    throw new Error("approval_note is required for write actions");
  }
}

async function githubRequest<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "multimodel-ai-tools",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API ${response.status}: ${errorText}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

async function getRepoAndIntegration(
  context: ToolExecutionContext,
  repoId: string,
): Promise<{ repo: RepoRecord; token: string }> {
  const db = context.supabase as any;

  const { data: repo, error: repoError } = await db
    .from("repos")
    .select(
      "id,owner,name,default_branch,installation_id,integration_id,protected_branches,workspace_id",
    )
    .eq("id", repoId)
    .maybeSingle();

  if (repoError || !repo) {
    throw new Error(`Repository not found: ${repoError?.message ?? "unknown"}`);
  }

  const { data: integration, error: integrationError } = await db
    .from("integrations")
    .select("id,encrypted_access_token")
    .eq("id", repo.integration_id)
    .maybeSingle();

  if (integrationError || !integration) {
    throw new Error(
      `Repository integration not found: ${integrationError?.message ?? "unknown"}`,
    );
  }

  return {
    repo: {
      ...repo,
      protected_branches: Array.isArray(repo.protected_branches)
        ? (repo.protected_branches as string[])
        : ["main", "master"],
    },
    token: getIntegrationToken(integration),
  };
}

async function indexRepo(
  context: ToolExecutionContext,
  repo: RepoRecord,
  token: string,
  branch: string,
): Promise<{
  indexed_files: number;
}> {
  const db = context.supabase as any;

  const tree = await githubRequest<{
    tree: Array<{ path: string; type: string; sha: string; size?: number }>;
  }>(
    token,
    `/repos/${repo.owner}/${repo.name}/git/trees/${branch}?recursive=1`,
  );

  const files = tree.tree
    .filter((entry) => entry.type === "blob")
    .filter((entry) => (entry.size ?? 0) <= 300_000)
    .slice(0, 800);

  const { error: clearError } = await db
    .from("repo_files_cache")
    .delete()
    .eq("repo_id", repo.id)
    .eq("branch", branch);

  if (clearError) {
    throw new Error(`Failed to clear repo cache: ${clearError.message}`);
  }

  for (const file of files) {
    const { error } = await db.from("repo_files_cache").insert({
      repo_id: repo.id,
      workspace_id: repo.workspace_id,
      project_id: context.projectId,
      branch,
      path: file.path,
      sha: file.sha,
      size_bytes: file.size ?? null,
      is_binary: false,
      indexed_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to cache repo file metadata: ${error.message}`);
    }
  }

  return {
    indexed_files: files.length,
  };
}

async function loadFileContent(
  token: string,
  owner: string,
  name: string,
  branch: string,
  path: string,
): Promise<{ content: string; sha: string }> {
  const response = await githubRequest<{
    content: string;
    sha: string;
    encoding: string;
  }>(
    token,
    `/repos/${owner}/${name}/contents/${encodeURIComponent(path)}?ref=${branch}`,
  );

  const decoded =
    response.encoding === "base64"
      ? Buffer.from(response.content.replace(/\n/g, ""), "base64").toString(
          "utf8",
        )
      : response.content;

  return {
    content: decoded,
    sha: response.sha,
  };
}

async function upsertCachedFile(
  context: ToolExecutionContext,
  repo: RepoRecord,
  branch: string,
  path: string,
  sha: string,
  content: string,
): Promise<void> {
  const db = context.supabase as any;

  const { error } = await db.from("repo_files_cache").upsert(
    {
      repo_id: repo.id,
      workspace_id: repo.workspace_id,
      project_id: context.projectId,
      branch,
      path,
      sha,
      size_bytes: content.length,
      language: path.split(".").pop() ?? null,
      is_binary: false,
      content,
      content_hash: Buffer.from(content).toString("base64").slice(0, 40),
      indexed_at: new Date().toISOString(),
    },
    { onConflict: "repo_id,branch,path" },
  );

  if (error) {
    throw new Error(`Failed to cache file content: ${error.message}`);
  }
}

export async function githubConnectRepoTool(
  context: ToolExecutionContext,
  input: GitHubConnectRepoInput,
): Promise<{
  repo_id: string;
  integration_id: string;
}> {
  const db = context.supabase as any;

  const encryptedToken = encryptToken(input.access_token);

  const { data: integration, error: integrationError } = await db
    .from("integrations")
    .upsert(
      {
        workspace_id: context.workspaceId,
        project_id: context.projectId,
        created_by: context.userId,
        provider: "github",
        integration_type: "oauth",
        encrypted_access_token: Buffer.from(encryptedToken).toString("base64"),
        encrypted_refresh_token: null,
        token_expires_at: null,
        enabled_scopes: input.enabled_scopes ?? ["repo:read"],
        metadata: {
          note: "Connected via tool framework",
        },
      },
      { onConflict: "workspace_id,provider,integration_type" },
    )
    .select("id")
    .single();

  if (integrationError || !integration?.id) {
    throw new Error(
      `Failed to upsert integration: ${integrationError?.message ?? "unknown"}`,
    );
  }

  const { data: repo, error: repoError } = await db
    .from("repos")
    .upsert(
      {
        workspace_id: context.workspaceId,
        project_id: context.projectId,
        integration_id: integration.id,
        owner: input.owner,
        name: input.name,
        default_branch: input.default_branch ?? "main",
        installation_id: input.installation_id ?? null,
        enabled_scopes: input.enabled_scopes ?? ["repo:read"],
        protected_branches: input.protected_branches ?? ["main", "master"],
        created_by: context.userId,
      },
      {
        onConflict: "workspace_id,owner,name",
      },
    )
    .select("id")
    .single();

  if (repoError || !repo?.id) {
    throw new Error(
      `Failed to upsert repo: ${repoError?.message ?? "unknown"}`,
    );
  }

  return {
    repo_id: repo.id,
    integration_id: integration.id,
  };
}

export async function repoIndexTool(
  context: ToolExecutionContext,
  input: RepoReferenceInput,
): Promise<{
  indexed_files: number;
  branch: string;
}> {
  const { repo, token } = await getRepoAndIntegration(context, input.repo_id);
  const branch = input.branch ?? repo.default_branch;

  const result = await indexRepo(context, repo, token, branch);

  return {
    indexed_files: result.indexed_files,
    branch,
  };
}

export async function repoListFilesTool(
  context: ToolExecutionContext,
  input: RepoListFilesInput,
): Promise<{
  files: Array<{ path: string; size_bytes: number | null; sha: string }>;
  branch: string;
}> {
  const { repo, token } = await getRepoAndIntegration(context, input.repo_id);
  const branch = input.branch ?? repo.default_branch;

  if (input.force_reindex) {
    await indexRepo(context, repo, token, branch);
  }

  const db = context.supabase as any;

  const { data: rows, error } = await db
    .from("repo_files_cache")
    .select("path,size_bytes,sha")
    .eq("repo_id", repo.id)
    .eq("branch", branch);

  if (error) {
    throw new Error(`Failed to list repo files: ${error.message}`);
  }

  const files = (rows ?? [])
    .filter((row: any) => {
      if (input.path && !String(row.path).startsWith(input.path)) return false;
      if (input.glob && !wildcardMatch(input.glob, String(row.path)))
        return false;
      return true;
    })
    .map((row: any) => ({
      path: row.path,
      size_bytes: row.size_bytes ?? null,
      sha: row.sha,
    }))
    .sort((left: any, right: any) => left.path.localeCompare(right.path));

  return {
    files,
    branch,
  };
}

export async function repoReadFileTool(
  context: ToolExecutionContext,
  input: RepoReadFileInput,
): Promise<{
  path: string;
  branch: string;
  content: string;
  sha: string;
}> {
  const { repo, token } = await getRepoAndIntegration(context, input.repo_id);
  const branch = input.branch ?? repo.default_branch;

  const file = await loadFileContent(
    token,
    repo.owner,
    repo.name,
    branch,
    input.path,
  );

  const safeContent = redactSecretsInText(file.content);

  await upsertCachedFile(
    context,
    repo,
    branch,
    input.path,
    file.sha,
    safeContent,
  );

  return {
    path: input.path,
    branch,
    content: safeContent,
    sha: file.sha,
  };
}

export async function repoSearchTool(
  context: ToolExecutionContext,
  input: RepoSearchInput,
): Promise<{
  matches: Array<{
    path: string;
    branch: string;
    score: number;
    snippet: string;
  }>;
}> {
  const { repo } = await getRepoAndIntegration(context, input.repo_id);
  const branch = input.branch ?? repo.default_branch;
  const topK = Math.min(50, Math.max(1, input.top_k ?? 10));

  const db = context.supabase as any;

  const { data: cached, error } = await db
    .from("repo_files_cache")
    .select("path,content")
    .eq("repo_id", repo.id)
    .eq("branch", branch);

  if (error) {
    throw new Error(`Failed to query repo cache: ${error.message}`);
  }

  const queryTerms = input.query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((entry) => entry.length >= 2);

  const matches = (cached ?? [])
    .map((file: any) => {
      const content = String(file.content ?? "");
      if (!content) return null;

      const lowered = content.toLowerCase();
      let hitCount = 0;

      for (const term of queryTerms) {
        if (lowered.includes(term)) {
          hitCount += 1;
        }
      }

      if (hitCount === 0) return null;

      const score = hitCount / queryTerms.length;
      const snippetIndex = lowered.indexOf(queryTerms[0] ?? "");
      const snippet =
        snippetIndex >= 0
          ? content.slice(Math.max(0, snippetIndex - 80), snippetIndex + 220)
          : content.slice(0, 240);

      return {
        path: file.path,
        branch,
        score,
        snippet: redactSecretsInText(snippet.trim()),
      };
    })
    .filter((entry: any): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left: any, right: any) => right.score - left.score)
    .slice(0, topK);

  return {
    matches,
  };
}

export async function proposePatchTool(
  _context: ToolExecutionContext,
  input: ProposePatchInput,
): Promise<{
  accepted: boolean;
  warnings: string[];
  stats: {
    files: number;
    additions: number;
    deletions: number;
  };
  normalized_diff: string;
}> {
  const warnings: string[] = [];

  const stats = getDiffStats(input.diff_unified);
  const patches = parseUnifiedDiff(input.diff_unified);

  if (patches.length === 0) {
    throw new Error("No file changes detected in unified diff");
  }

  if (stats.files > 20 || stats.additions + stats.deletions > 1000) {
    warnings.push(
      "Large diff detected; review in smaller batches before apply.",
    );
  }

  if (stats.touchesLockfile) {
    warnings.push(
      "Diff touches lockfiles; verify dependency integrity and provenance.",
    );
  }

  const secretMatches = detectSecretsInText(input.diff_unified);
  if (secretMatches.length > 0) {
    warnings.push(
      `Potential secrets detected (${secretMatches
        .slice(0, 3)
        .map((entry) => entry.type)
        .join(", ")}). Apply is blocked until sanitized.`,
    );
  }

  return {
    accepted: true,
    warnings,
    stats: {
      files: stats.files,
      additions: stats.additions,
      deletions: stats.deletions,
    },
    normalized_diff: input.diff_unified,
  };
}

export async function applyPatchTool(
  context: ToolExecutionContext,
  input: ApplyPatchInput,
): Promise<{
  branch: string;
  commits: Array<{ path: string; sha: string }>;
  warnings: string[];
}> {
  requireApproval(input.approved, input.approval_note);

  const { repo, token } = await getRepoAndIntegration(context, input.repo_id);
  const protectedBranches = repo.protected_branches ?? ["main", "master"];

  if (protectedBranches.includes(input.branch)) {
    throw new Error(
      `Cannot apply patch directly to protected branch '${input.branch}'`,
    );
  }

  const diffSecrets = detectSecretsInText(input.diff_unified);
  if (diffSecrets.length > 0 && !input.override_secret_block) {
    throw new Error(
      "Patch contains potential secrets; provide override_secret_block=true only after explicit user confirmation.",
    );
  }

  const patches = parseUnifiedDiff(input.diff_unified);
  if (patches.length === 0) {
    throw new Error("No file patches parsed from diff");
  }

  const commits: Array<{ path: string; sha: string }> = [];
  const warnings: string[] = [];

  for (const patch of patches) {
    const targetPath = patch.isDeletedFile ? patch.oldPath : patch.newPath;

    if (!targetPath) {
      throw new Error("Patch target path is missing");
    }

    if (patch.isDeletedFile) {
      const existing = await loadFileContent(
        token,
        repo.owner,
        repo.name,
        input.branch,
        patch.oldPath,
      );

      await githubRequest(
        token,
        `/repos/${repo.owner}/${repo.name}/contents/${encodeURIComponent(patch.oldPath)}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: input.commit_message,
            sha: existing.sha,
            branch: input.branch,
          }),
        },
      );

      commits.push({
        path: patch.oldPath,
        sha: existing.sha,
      });
      continue;
    }

    const original = patch.isNewFile
      ? { content: "", sha: undefined as string | undefined }
      : await loadFileContent(
          token,
          repo.owner,
          repo.name,
          input.branch,
          patch.oldPath,
        );

    const nextContent = patch.isNewFile
      ? applyPatchToContent("", patch)
      : applyPatchToContent(original.content, patch);

    if (containsLikelySecret(nextContent) && !input.override_secret_block) {
      throw new Error(
        `Secret-like pattern detected in resulting content for ${targetPath}. Patch blocked.`,
      );
    }

    const encoded = Buffer.from(nextContent, "utf8").toString("base64");

    const response = await githubRequest<{
      content: { sha: string };
      commit: { sha: string };
    }>(
      token,
      `/repos/${repo.owner}/${repo.name}/contents/${encodeURIComponent(targetPath)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: input.commit_message,
          content: encoded,
          sha: original.sha,
          branch: input.branch,
        }),
      },
    );

    commits.push({
      path: targetPath,
      sha: response.commit.sha,
    });

    await upsertCachedFile(
      context,
      repo,
      input.branch,
      targetPath,
      response.content.sha,
      nextContent,
    );
  }

  if (commits.length > 10) {
    warnings.push("Patch applied as multiple commits via GitHub contents API.");
  }

  return {
    branch: input.branch,
    commits,
    warnings,
  };
}

export async function runChecksTool(
  context: ToolExecutionContext,
  input: RunChecksInput,
): Promise<{
  branch: string;
  total: number;
  successful: number;
  failed: number;
  pending: number;
  checks: Array<{
    name: string;
    status: string;
    conclusion: string | null;
    details_url: string | null;
  }>;
}> {
  const { repo, token } = await getRepoAndIntegration(context, input.repo_id);
  const branch = input.branch ?? repo.default_branch;

  const checkRuns = await githubRequest<{
    total_count: number;
    check_runs: Array<{
      name: string;
      status: string;
      conclusion: string | null;
      details_url: string | null;
    }>;
  }>(
    token,
    `/repos/${repo.owner}/${repo.name}/commits/${encodeURIComponent(branch)}/check-runs`,
  );

  let successful = 0;
  let failed = 0;
  let pending = 0;

  for (const run of checkRuns.check_runs) {
    if (run.status !== "completed") {
      pending += 1;
    } else if (run.conclusion === "success" || run.conclusion === "neutral") {
      successful += 1;
    } else {
      failed += 1;
    }
  }

  return {
    branch,
    total: checkRuns.total_count,
    successful,
    failed,
    pending,
    checks: checkRuns.check_runs,
  };
}

export async function createPullRequestTool(
  context: ToolExecutionContext,
  input: CreatePullRequestInput,
): Promise<{
  number: number;
  url: string;
  title: string;
  head: string;
  base: string;
}> {
  requireApproval(input.approved, input.approval_note);

  const { repo, token } = await getRepoAndIntegration(context, input.repo_id);
  const baseBranch = input.base_branch ?? repo.default_branch;

  const compare = await githubRequest<{
    files: Array<{ filename: string; patch?: string }>;
  }>(
    token,
    `/repos/${repo.owner}/${repo.name}/compare/${encodeURIComponent(baseBranch)}...${encodeURIComponent(input.branch)}`,
  );

  const potentialSecrets = compare.files
    .flatMap((file) => detectSecretsInText(file.patch ?? ""))
    .slice(0, 5);

  if (potentialSecrets.length > 0 && !input.override_secret_block) {
    throw new Error(
      "Secret scan detected potential leaks in compare patch; set override_secret_block=true only after explicit confirmation.",
    );
  }

  const pr = await githubRequest<{
    number: number;
    html_url: string;
    title: string;
    head: { ref: string };
    base: { ref: string };
  }>(token, `/repos/${repo.owner}/${repo.name}/pulls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.branch,
      base: baseBranch,
    }),
  });

  return {
    number: pr.number,
    url: pr.html_url,
    title: pr.title,
    head: pr.head.ref,
    base: pr.base.ref,
  };
}
