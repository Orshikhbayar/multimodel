import { deepResearchTool } from "@/lib/tools/providers/deepResearch";
import {
  exportDocxTool,
  exportPdfTool,
  exportPptxTool,
  skillRunTool,
} from "@/lib/tools/providers/exportTools";
import {
  fileIngestTool,
  fileSearchTool,
} from "@/lib/tools/providers/fileTools";
import {
  applyPatchTool,
  createPullRequestTool,
  githubConnectRepoTool,
  proposePatchTool,
  repoIndexTool,
  repoListFilesTool,
  repoReadFileTool,
  repoSearchTool,
  runChecksTool,
} from "@/lib/tools/providers/githubTools";
import { imageGenerateTool } from "@/lib/tools/providers/imageTools";
import { webFetchTool, webSearchTool } from "@/lib/tools/providers/webTools";
import { getToolRegistry } from "@/lib/tools/registry";
import type { ToolDefinition } from "@/lib/tools/types";

const strictObject = {
  type: "object",
  additionalProperties: false,
} as const;

const webSearchDefinition: ToolDefinition = {
  tool_name: "web_search",
  tool_version: "1.0.0",
  description:
    "Searches the web for ranked results with optional recency and domain constraints.",
  input_schema: {
    ...strictObject,
    required: ["query"],
    properties: {
      query: { type: "string", minLength: 2 },
      recency_days: { type: "integer", minimum: 1, maximum: 3650 },
      domains_allow: {
        type: "array",
        items: { type: "string", minLength: 3 },
      },
      domains_deny: {
        type: "array",
        items: { type: "string", minLength: 3 },
      },
      top_k: { type: "integer", minimum: 1, maximum: 20 },
    },
  },
  output_schema: {
    type: "array",
    items: {
      ...strictObject,
      required: [
        "title",
        "url",
        "snippet",
        "source",
        "ranking_score",
        "canonical_url",
      ],
      properties: {
        title: { type: "string" },
        url: { type: "string" },
        snippet: { type: "string" },
        source: { type: "string" },
        published_date: { type: "string" },
        ranking_score: { type: "number" },
        canonical_url: { type: "string" },
      },
    },
  },
  permissions: ["web:read"],
  estimated_cost: {
    estimated_tokens_in: 100,
    estimated_tokens_out: 250,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await webSearchTool(
      context,
      input as Parameters<typeof webSearchTool>[1],
    ),
  }),
};

const webFetchDefinition: ToolDefinition = {
  tool_name: "web_fetch",
  tool_version: "1.0.0",
  description:
    "Fetches a web page, extracts clean main content, metadata, and structural headings.",
  input_schema: {
    ...strictObject,
    required: ["url"],
    properties: {
      url: { type: "string", minLength: 8 },
      domains_allow: {
        type: "array",
        items: { type: "string", minLength: 3 },
      },
      domains_deny: {
        type: "array",
        items: { type: "string", minLength: 3 },
      },
    },
  },
  output_schema: {
    ...strictObject,
    required: [
      "clean_text",
      "headings",
      "metadata",
      "content_hash",
      "word_count",
    ],
    properties: {
      clean_text: { type: "string" },
      headings: {
        type: "array",
        items: { type: "string" },
      },
      metadata: {
        type: "object",
        additionalProperties: true,
      },
      detected_date: { type: "string" },
      content_hash: { type: "string" },
      word_count: { type: "integer" },
    },
  },
  permissions: ["web:read"],
  estimated_cost: {
    estimated_tokens_in: 120,
    estimated_tokens_out: 500,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await webFetchTool(
      context,
      input as Parameters<typeof webFetchTool>[1],
    ),
  }),
};

const deepResearchDefinition: ToolDefinition = {
  tool_name: "deep_research",
  tool_version: "1.0.0",
  description:
    "Runs multi-step web research with planning, scoring, citation generation, and reproducible traces.",
  input_schema: {
    ...strictObject,
    required: ["topic"],
    properties: {
      topic: { type: "string", minLength: 3 },
      goals: { type: "array", items: { type: "string" } },
      constraints: { type: "array", items: { type: "string" } },
      audience: { type: "string" },
      recency_days: { type: "integer", minimum: 1, maximum: 3650 },
      max_sources: { type: "integer", minimum: 4, maximum: 20 },
      depth_level: {
        type: "string",
        enum: ["light", "standard", "deep"],
      },
    },
  },
  output_schema: {
    ...strictObject,
    required: [
      "report_markdown",
      "citations",
      "source_bundle",
      "research_trace",
      "report_id",
    ],
    properties: {
      report_markdown: { type: "string" },
      citations: {
        type: "array",
        items: {
          ...strictObject,
          required: ["id", "url", "title", "accessed_at"],
          properties: {
            id: { type: "string" },
            url: { type: "string" },
            title: { type: "string" },
            publisher: { type: "string" },
            published_date: { type: "string" },
            accessed_at: { type: "string" },
          },
        },
      },
      source_bundle: {
        type: "array",
        items: {
          ...strictObject,
          required: ["url", "content_hash", "extracted_text_ref", "metadata"],
          properties: {
            url: { type: "string" },
            content_hash: { type: "string" },
            extracted_text_ref: { type: "string" },
            metadata: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
      },
      research_trace: {
        type: "object",
        additionalProperties: true,
      },
      report_id: { type: "string" },
      what_changed_recently: { type: "string" },
    },
  },
  permissions: ["web:read", "research:write"],
  estimated_cost: {
    estimated_tokens_in: 1800,
    estimated_tokens_out: 4200,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await deepResearchTool(
      context,
      input as Parameters<typeof deepResearchTool>[1],
    ),
  }),
};

const imageGenerateDefinition: ToolDefinition = {
  tool_name: "image_generate",
  tool_version: "1.0.0",
  description:
    "Generates images from text prompts and stores resulting artifacts in project scope.",
  input_schema: {
    ...strictObject,
    required: ["prompt"],
    properties: {
      prompt: { type: "string", minLength: 3 },
      size: {
        type: "string",
        enum: ["1024x1024", "1536x1024", "1024x1536", "auto"],
      },
      n: { type: "integer", minimum: 1, maximum: 4 },
      transparent_background: { type: "boolean" },
      style_transfer: { type: "string" },
    },
  },
  output_schema: {
    ...strictObject,
    required: ["images", "model"],
    properties: {
      images: {
        type: "array",
        items: {
          ...strictObject,
          required: ["artifact_id", "storage_path", "mime_type"],
          properties: {
            artifact_id: { type: "string" },
            storage_path: { type: "string" },
            mime_type: { type: "string" },
          },
        },
      },
      model: { type: "string" },
    },
  },
  permissions: ["images:generate"],
  estimated_cost: {
    estimated_tokens_in: 200,
    estimated_tokens_out: 100,
    estimated_external_cost_usd: 0.08,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await imageGenerateTool(
      context,
      input as Parameters<typeof imageGenerateTool>[1],
    ),
  }),
};

const fileIngestDefinition: ToolDefinition = {
  tool_name: "file_ingest",
  tool_version: "1.0.0",
  description:
    "Parses uploaded files into normalized text/chunks with stable references for retrieval.",
  input_schema: {
    ...strictObject,
    properties: {
      file_id: { type: "string" },
      storage_path: { type: "string" },
      options: {
        type: "object",
        additionalProperties: false,
        properties: {
          bucket: { type: "string" },
          file_name: { type: "string" },
          file_type: { type: "string" },
          enable_ocr: { type: "boolean" },
          enable_vision_captioning: { type: "boolean" },
        },
      },
    },
    anyOf: [{ required: ["file_id"] }, { required: ["storage_path"] }],
  },
  output_schema: {
    ...strictObject,
    required: [
      "file_id",
      "parsed_text_ref",
      "metadata",
      "content_hash",
      "chunks_ref",
      "extraction_warnings",
    ],
    properties: {
      file_id: { type: "string" },
      parsed_text_ref: { type: "string" },
      metadata: {
        type: "object",
        additionalProperties: true,
      },
      content_hash: { type: "string" },
      chunks_ref: { type: "string" },
      extraction_warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
  permissions: ["files:read", "files:write"],
  estimated_cost: {
    estimated_tokens_in: 400,
    estimated_tokens_out: 300,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await fileIngestTool(
      context,
      input as Parameters<typeof fileIngestTool>[1],
    ),
  }),
};

const fileSearchDefinition: ToolDefinition = {
  tool_name: "file_search",
  tool_version: "1.0.0",
  description:
    "Searches indexed file chunks with scoped filters and reference-aware matches.",
  input_schema: {
    ...strictObject,
    required: ["query"],
    properties: {
      query: { type: "string", minLength: 2 },
      scope: {
        type: "string",
        enum: ["project", "conversation", "collection"],
      },
      top_k: { type: "integer", minimum: 1, maximum: 50 },
      filters: {
        type: "object",
        additionalProperties: false,
        properties: {
          file_type: {
            type: "array",
            items: { type: "string" },
          },
          date_range: {
            type: "object",
            additionalProperties: false,
            properties: {
              from: { type: "string" },
              to: { type: "string" },
            },
          },
          file_ids: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
  },
  output_schema: {
    ...strictObject,
    required: ["matches"],
    properties: {
      matches: {
        type: "array",
        items: {
          ...strictObject,
          required: ["file_id", "chunk_id", "snippet", "score", "reference"],
          properties: {
            file_id: { type: "string" },
            chunk_id: { type: "string" },
            snippet: { type: "string" },
            score: { type: "number" },
            page_or_slide: { type: "integer" },
            section_heading: { type: "string" },
            reference: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
      },
    },
  },
  permissions: ["files:read"],
  estimated_cost: {
    estimated_tokens_in: 200,
    estimated_tokens_out: 300,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await fileSearchTool(
      context,
      input as Parameters<typeof fileSearchTool>[1],
    ),
  }),
};

const exportDocxDefinition: ToolDefinition = {
  tool_name: "export_docx",
  tool_version: "1.0.0",
  description:
    "Creates a DOCX artifact from markdown content and optional citations.",
  input_schema: {
    ...strictObject,
    required: ["title", "content_markdown"],
    properties: {
      title: { type: "string", minLength: 1 },
      content_markdown: { type: "string", minLength: 1 },
      citations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
        },
      },
      style_preset: { type: "string" },
    },
  },
  output_schema: {
    ...strictObject,
    required: ["artifact_id", "storage_path", "mime_type"],
    properties: {
      artifact_id: { type: "string" },
      storage_path: { type: "string" },
      mime_type: { type: "string" },
    },
  },
  permissions: ["export:docx"],
  estimated_cost: {
    estimated_tokens_in: 300,
    estimated_tokens_out: 200,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await exportDocxTool(
      context,
      input as Parameters<typeof exportDocxTool>[1],
    ),
  }),
};

const exportPdfDefinition: ToolDefinition = {
  tool_name: "export_pdf",
  tool_version: "1.0.0",
  description:
    "Creates a PDF artifact from markdown content and optional citations.",
  input_schema: exportDocxDefinition.input_schema,
  output_schema: exportDocxDefinition.output_schema,
  permissions: ["export:pdf"],
  estimated_cost: {
    estimated_tokens_in: 300,
    estimated_tokens_out: 200,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await exportPdfTool(
      context,
      input as Parameters<typeof exportPdfTool>[1],
    ),
  }),
};

const exportPptxDefinition: ToolDefinition = {
  tool_name: "export_pptx",
  tool_version: "1.0.0",
  description:
    "Creates a PPTX artifact from outline/slides with deterministic formatting and citations.",
  input_schema: {
    ...strictObject,
    required: ["title", "outline_or_slides"],
    properties: {
      title: { type: "string", minLength: 1 },
      outline_or_slides: {
        anyOf: [
          {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["slides"],
            properties: {
              slides: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
        ],
      },
      theme: { type: "string" },
      images: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
        },
      },
      citations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
  output_schema: exportDocxDefinition.output_schema,
  permissions: ["export:pptx"],
  estimated_cost: {
    estimated_tokens_in: 350,
    estimated_tokens_out: 250,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await exportPptxTool(
      context,
      input as Parameters<typeof exportPptxTool>[1],
    ),
  }),
};

const skillRunDefinition: ToolDefinition = {
  tool_name: "skill_run",
  tool_version: "1.0.0",
  description:
    "Executes an external skill runner with explicit skill id and output format.",
  input_schema: {
    ...strictObject,
    required: ["skill_id", "inputs", "output_format"],
    properties: {
      skill_id: { type: "string", minLength: 1 },
      inputs: {
        type: "object",
        additionalProperties: true,
      },
      output_format: { type: "string", minLength: 1 },
    },
  },
  output_schema: {
    ...strictObject,
    required: ["status", "output"],
    properties: {
      status: { type: "string" },
      output: {
        type: "object",
        additionalProperties: true,
      },
    },
  },
  permissions: ["skills:run"],
  estimated_cost: {
    estimated_tokens_in: 120,
    estimated_tokens_out: 120,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await skillRunTool(
      context,
      input as Parameters<typeof skillRunTool>[1],
    ),
  }),
};

const githubConnectDefinition: ToolDefinition = {
  tool_name: "github_connect_repo",
  tool_version: "1.0.0",
  requires_confirmation: true,
  description:
    "Connects a GitHub repository with encrypted token storage and project scoping.",
  input_schema: {
    ...strictObject,
    required: ["owner", "name", "access_token"],
    properties: {
      owner: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      default_branch: { type: "string" },
      installation_id: { type: "string" },
      access_token: { type: "string", minLength: 10 },
      enabled_scopes: {
        type: "array",
        items: { type: "string" },
      },
      protected_branches: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
  output_schema: {
    ...strictObject,
    required: ["repo_id", "integration_id"],
    properties: {
      repo_id: { type: "string" },
      integration_id: { type: "string" },
    },
  },
  permissions: ["github:read", "github:write"],
  estimated_cost: {
    estimated_tokens_in: 100,
    estimated_tokens_out: 80,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await githubConnectRepoTool(
      context,
      input as Parameters<typeof githubConnectRepoTool>[1],
    ),
  }),
};

const repoIndexDefinition: ToolDefinition = {
  tool_name: "repo_index",
  tool_version: "1.0.0",
  description:
    "Indexes repository file tree metadata for search and file operations.",
  input_schema: {
    ...strictObject,
    required: ["repo_id"],
    properties: {
      repo_id: { type: "string" },
      branch: { type: "string" },
    },
  },
  output_schema: {
    ...strictObject,
    required: ["indexed_files", "branch"],
    properties: {
      indexed_files: { type: "integer" },
      branch: { type: "string" },
    },
  },
  permissions: ["github:read"],
  estimated_cost: {
    estimated_tokens_in: 150,
    estimated_tokens_out: 120,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await repoIndexTool(
      context,
      input as Parameters<typeof repoIndexTool>[1],
    ),
  }),
};

const repoListFilesDefinition: ToolDefinition = {
  tool_name: "repo_list_files",
  tool_version: "1.0.0",
  description:
    "Lists indexed repository files, with optional path/glob filtering.",
  input_schema: {
    ...strictObject,
    required: ["repo_id"],
    properties: {
      repo_id: { type: "string" },
      branch: { type: "string" },
      path: { type: "string" },
      glob: { type: "string" },
      force_reindex: { type: "boolean" },
    },
  },
  output_schema: {
    ...strictObject,
    required: ["files", "branch"],
    properties: {
      files: {
        type: "array",
        items: {
          ...strictObject,
          required: ["path", "sha"],
          properties: {
            path: { type: "string" },
            size_bytes: { type: ["integer", "null"] },
            sha: { type: "string" },
          },
        },
      },
      branch: { type: "string" },
    },
  },
  permissions: ["github:read"],
  estimated_cost: {
    estimated_tokens_in: 80,
    estimated_tokens_out: 120,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await repoListFilesTool(
      context,
      input as Parameters<typeof repoListFilesTool>[1],
    ),
  }),
};

const repoReadFileDefinition: ToolDefinition = {
  tool_name: "repo_read_file",
  tool_version: "1.0.0",
  description: "Reads repository file contents from branch scope.",
  input_schema: {
    ...strictObject,
    required: ["repo_id", "path"],
    properties: {
      repo_id: { type: "string" },
      branch: { type: "string" },
      path: { type: "string", minLength: 1 },
    },
  },
  output_schema: {
    ...strictObject,
    required: ["path", "branch", "content", "sha"],
    properties: {
      path: { type: "string" },
      branch: { type: "string" },
      content: { type: "string" },
      sha: { type: "string" },
    },
  },
  permissions: ["github:read"],
  estimated_cost: {
    estimated_tokens_in: 120,
    estimated_tokens_out: 220,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await repoReadFileTool(
      context,
      input as Parameters<typeof repoReadFileTool>[1],
    ),
  }),
};

const repoSearchDefinition: ToolDefinition = {
  tool_name: "repo_search",
  tool_version: "1.0.0",
  description:
    "Searches repository indexed content by keyword (semantic optional later).",
  input_schema: {
    ...strictObject,
    required: ["repo_id", "query"],
    properties: {
      repo_id: { type: "string" },
      branch: { type: "string" },
      query: { type: "string", minLength: 2 },
      mode: { type: "string", enum: ["keyword", "semantic"] },
      top_k: { type: "integer", minimum: 1, maximum: 50 },
    },
  },
  output_schema: {
    ...strictObject,
    required: ["matches"],
    properties: {
      matches: {
        type: "array",
        items: {
          ...strictObject,
          required: ["path", "branch", "score", "snippet"],
          properties: {
            path: { type: "string" },
            branch: { type: "string" },
            score: { type: "number" },
            snippet: { type: "string" },
          },
        },
      },
    },
  },
  permissions: ["github:read"],
  estimated_cost: {
    estimated_tokens_in: 120,
    estimated_tokens_out: 200,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await repoSearchTool(
      context,
      input as Parameters<typeof repoSearchTool>[1],
    ),
  }),
};

const proposePatchDefinition: ToolDefinition = {
  tool_name: "propose_patch",
  tool_version: "1.0.0",
  description:
    "Validates and risk-scores unified diffs before application, including secret and size checks.",
  input_schema: {
    ...strictObject,
    required: ["repo_id", "diff_unified", "rationale"],
    properties: {
      repo_id: { type: "string" },
      diff_unified: { type: "string", minLength: 6 },
      rationale: { type: "string", minLength: 3 },
      risk_flags: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
  output_schema: {
    ...strictObject,
    required: ["accepted", "warnings", "stats", "normalized_diff"],
    properties: {
      accepted: { type: "boolean" },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
      stats: {
        ...strictObject,
        required: ["files", "additions", "deletions"],
        properties: {
          files: { type: "integer" },
          additions: { type: "integer" },
          deletions: { type: "integer" },
        },
      },
      normalized_diff: { type: "string" },
    },
  },
  permissions: ["github:write"],
  estimated_cost: {
    estimated_tokens_in: 250,
    estimated_tokens_out: 200,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await proposePatchTool(
      context,
      input as Parameters<typeof proposePatchTool>[1],
    ),
  }),
};

const applyPatchDefinition: ToolDefinition = {
  tool_name: "apply_patch",
  tool_version: "1.0.0",
  requires_confirmation: true,
  description:
    "Applies approved unified diffs to non-protected branches with secret scanning and guardrails.",
  input_schema: {
    ...strictObject,
    required: [
      "repo_id",
      "branch",
      "diff_unified",
      "commit_message",
      "approved",
      "approval_note",
    ],
    properties: {
      repo_id: { type: "string" },
      branch: { type: "string", minLength: 1 },
      diff_unified: { type: "string", minLength: 6 },
      commit_message: { type: "string", minLength: 3 },
      approved: { type: "boolean" },
      approval_note: { type: "string", minLength: 6 },
      override_secret_block: { type: "boolean" },
    },
  },
  output_schema: {
    ...strictObject,
    required: ["branch", "commits", "warnings"],
    properties: {
      branch: { type: "string" },
      commits: {
        type: "array",
        items: {
          ...strictObject,
          required: ["path", "sha"],
          properties: {
            path: { type: "string" },
            sha: { type: "string" },
          },
        },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
  permissions: ["github:write"],
  estimated_cost: {
    estimated_tokens_in: 350,
    estimated_tokens_out: 250,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await applyPatchTool(
      context,
      input as Parameters<typeof applyPatchTool>[1],
    ),
  }),
};

const runChecksDefinition: ToolDefinition = {
  tool_name: "run_checks",
  tool_version: "1.0.0",
  description: "Reads branch check-run status for CI quality gates.",
  input_schema: {
    ...strictObject,
    required: ["repo_id"],
    properties: {
      repo_id: { type: "string" },
      branch: { type: "string" },
      preset: { type: "string", enum: ["quick", "full"] },
    },
  },
  output_schema: {
    ...strictObject,
    required: ["branch", "total", "successful", "failed", "pending", "checks"],
    properties: {
      branch: { type: "string" },
      total: { type: "integer" },
      successful: { type: "integer" },
      failed: { type: "integer" },
      pending: { type: "integer" },
      checks: {
        type: "array",
        items: {
          ...strictObject,
          required: ["name", "status", "conclusion", "details_url"],
          properties: {
            name: { type: "string" },
            status: { type: "string" },
            conclusion: { type: ["string", "null"] },
            details_url: { type: ["string", "null"] },
          },
        },
      },
    },
  },
  permissions: ["github:read"],
  estimated_cost: {
    estimated_tokens_in: 80,
    estimated_tokens_out: 120,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await runChecksTool(
      context,
      input as Parameters<typeof runChecksTool>[1],
    ),
  }),
};

const createPullRequestDefinition: ToolDefinition = {
  tool_name: "create_pull_request",
  tool_version: "1.0.0",
  requires_confirmation: true,
  description:
    "Creates GitHub pull requests after explicit approval and pre-PR secret scanning.",
  input_schema: {
    ...strictObject,
    required: [
      "repo_id",
      "title",
      "body",
      "branch",
      "approved",
      "approval_note",
    ],
    properties: {
      repo_id: { type: "string" },
      title: { type: "string", minLength: 3 },
      body: { type: "string", minLength: 3 },
      branch: { type: "string", minLength: 1 },
      base_branch: { type: "string" },
      approved: { type: "boolean" },
      approval_note: { type: "string", minLength: 6 },
      override_secret_block: { type: "boolean" },
    },
  },
  output_schema: {
    ...strictObject,
    required: ["number", "url", "title", "head", "base"],
    properties: {
      number: { type: "integer" },
      url: { type: "string" },
      title: { type: "string" },
      head: { type: "string" },
      base: { type: "string" },
    },
  },
  permissions: ["github:write"],
  estimated_cost: {
    estimated_tokens_in: 120,
    estimated_tokens_out: 120,
    estimated_external_cost_usd: 0,
  },
  changelog: "Initial release.",
  execute: async (context, input) => ({
    output: await createPullRequestTool(
      context,
      input as Parameters<typeof createPullRequestTool>[1],
    ),
  }),
};

const toolDefinitions: ToolDefinition[] = [
  webSearchDefinition,
  webFetchDefinition,
  deepResearchDefinition,
  imageGenerateDefinition,
  fileIngestDefinition,
  fileSearchDefinition,
  exportDocxDefinition,
  exportPdfDefinition,
  exportPptxDefinition,
  skillRunDefinition,
  githubConnectDefinition,
  repoIndexDefinition,
  repoListFilesDefinition,
  repoReadFileDefinition,
  repoSearchDefinition,
  proposePatchDefinition,
  applyPatchDefinition,
  runChecksDefinition,
  createPullRequestDefinition,
];

let initialized = false;

export function initializeToolDefinitions(): void {
  if (initialized) return;

  const registry = getToolRegistry();
  for (const tool of toolDefinitions) {
    registry.register(tool);
  }

  initialized = true;
}

export function getRegisteredToolDefinitions(): ToolDefinition[] {
  initializeToolDefinitions();
  return getToolRegistry().list();
}
