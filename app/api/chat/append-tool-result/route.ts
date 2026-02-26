/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest } from "next/server";
import { nanoid } from "nanoid";

import { createSupabaseServerClient } from "@/lib/supabase/server";

interface AppendToolResultPayload {
  conversation_id?: string;
  message_id?: string | null;
  run_id?: string;
  artifact_id?: string;
}

function truncateForMessage(value: unknown, maxChars = 1400): string {
  const text = (() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  })();

  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 24))}\n... (truncated)`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectArtifactIds(value: unknown): string[] {
  const ids = new Set<string>();

  const walk = (current: unknown) => {
    if (Array.isArray(current)) {
      for (const child of current) {
        walk(child);
      }
      return;
    }

    if (!isRecord(current)) return;

    for (const [key, child] of Object.entries(current)) {
      if (key === "artifact_id" && typeof child === "string" && child.length > 0) {
        ids.add(child);
      }
      walk(child);
    }
  };

  walk(value);
  return Array.from(ids);
}

function extractCitationLinks(value: unknown): Array<{ title?: string; url: string }> {
  if (!isRecord(value) || !Array.isArray(value.citations)) {
    return [];
  }

  const links = value.citations.reduce<Array<{ title?: string; url: string }>>(
    (acc, item) => {
      if (!isRecord(item)) return acc;
      const url = typeof item.url === "string" ? item.url : null;
      if (!url) return acc;
      const title = typeof item.title === "string" ? item.title : undefined;
      acc.push({ title, url });
      return acc;
    },
    [],
  );

  return links.slice(0, 10);
}

function mapRunStatus(status: string): "pending" | "running" | "completed" | "failed" {
  if (status === "running") return "running";
  if (status === "succeeded") return "completed";
  if (status === "cancelled" || status === "failed") return "failed";
  return "pending";
}

async function signArtifactUrls(
  supabase: ReturnType<typeof createSupabaseServerClient> extends Promise<infer T> ? T : never,
  artifacts: Array<{
    id: string;
    artifact_type: string;
    title: string;
    storage_path: string;
  }>,
) {
  return Promise.all(
    artifacts.map(async (artifact) => {
      const { data } = await supabase.storage
        .from("artifacts")
        .createSignedUrl(artifact.storage_path, 60 * 60);

      return {
        ...artifact,
        download_url: data?.signedUrl ?? null,
      };
    }),
  );
}

export async function POST(request: NextRequest) {
  const requestId = nanoid(10);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return new Response(
      JSON.stringify({ error: "Authentication required", requestId }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const payload = (await request.json()) as AppendToolResultPayload;
  const conversationId =
    typeof payload.conversation_id === "string" && payload.conversation_id.length > 0
      ? payload.conversation_id
      : null;

  const runId = typeof payload.run_id === "string" ? payload.run_id : null;
  const artifactId = typeof payload.artifact_id === "string" ? payload.artifact_id : null;

  if (!conversationId) {
    return new Response(
      JSON.stringify({
        error: "conversation_id is required",
        requestId,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (!runId && !artifactId) {
    return new Response(
      JSON.stringify({
        error: "Either run_id or artifact_id is required",
        requestId,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const db = supabase as any;

  const { data: conversation, error: conversationError } = await db
    .from("conversations")
    .select("id,workspace_id,project_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError) {
    return new Response(
      JSON.stringify({ error: conversationError.message, requestId }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (!conversation) {
    return new Response(
      JSON.stringify({ error: "Conversation not found", requestId }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  let content = "";
  let toolCalls: unknown[] | null = null;

  if (runId) {
    const { data: run, error: runError } = await db
      .from("tool_runs")
      .select(
        "id,workspace_id,project_id,tool_name,tool_version,status,output_payload_redacted,actual_cost,error_code,error_message,started_at,completed_at",
      )
      .eq("id", runId)
      .eq("caller_user_id", claims.sub)
      .maybeSingle();

    if (runError) {
      return new Response(
        JSON.stringify({ error: runError.message, requestId }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!run) {
      return new Response(
        JSON.stringify({ error: "Tool run not found", requestId }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (run.workspace_id !== conversation.workspace_id) {
      return new Response(
        JSON.stringify({
          error: "Tool run does not belong to this conversation workspace",
          requestId,
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const runProjectId = run.project_id ?? null;
    const conversationProjectId = conversation.project_id ?? null;

    if (runProjectId !== conversationProjectId) {
      return new Response(
        JSON.stringify({
          error: "Project scope mismatch between tool run and conversation",
          requestId,
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const output = run.output_payload_redacted;
    const citationLinks = extractCitationLinks(output);

    const artifactIds = collectArtifactIds(output);
    const artifacts: Array<{
      id: string;
      artifact_type: string;
      title: string;
      storage_path: string;
      download_url?: string | null;
    }> = [];

    if (artifactIds.length > 0) {
      const { data: artifactRows, error: artifactsError } = await db
        .from("artifacts")
        .select("id,artifact_type,title,storage_path")
        .in("id", artifactIds)
        .eq("workspace_id", run.workspace_id)
        .order("created_at", { ascending: false });

      if (artifactsError) {
        return new Response(
          JSON.stringify({ error: artifactsError.message, requestId }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      for (const row of artifactRows ?? []) {
        if (!row?.id || !row?.storage_path || !row?.artifact_type || !row?.title) continue;
        artifacts.push({
          id: row.id,
          artifact_type: row.artifact_type,
          title: row.title,
          storage_path: row.storage_path,
        });
      }
    }

    const signedArtifacts = await signArtifactUrls(supabase, artifacts);
    const outputPreview = truncateForMessage(output);

    const lines: string[] = [
      `Tool result attached: **${run.tool_name}** (run \`${run.id}\`)`,
      `Status: ${run.status}`,
      "",
      "Output preview:",
      "```json",
      outputPreview,
      "```",
    ];

    if (citationLinks.length > 0) {
      lines.push("", "Sources:");
      for (const source of citationLinks.slice(0, 6)) {
        lines.push(`- [${source.title ?? source.url}](${source.url})`);
      }
    }

    if (signedArtifacts.length > 0) {
      lines.push("", "Artifacts:");
      for (const artifact of signedArtifacts.slice(0, 6)) {
        if (artifact.download_url) {
          lines.push(`- [${artifact.title}](${artifact.download_url})`);
        } else {
          lines.push(`- ${artifact.title}`);
        }
      }
    }

    content = lines.join("\n");

    toolCalls = [
      {
        id: `tool-run-${run.id}`,
        name: run.tool_name,
        status: mapRunStatus(run.status),
        runId: run.id,
        toolVersion: run.tool_version,
        actualCost: isRecord(run.actual_cost)
          ? {
              tokensIn:
                typeof run.actual_cost.tokens_in === "number"
                  ? run.actual_cost.tokens_in
                  : undefined,
              tokensOut:
                typeof run.actual_cost.tokens_out === "number"
                  ? run.actual_cost.tokens_out
                  : undefined,
              totalTokens:
                typeof run.actual_cost.total_tokens === "number"
                  ? run.actual_cost.total_tokens
                  : undefined,
              externalCostUsd:
                typeof run.actual_cost.external_cost_usd === "number"
                  ? run.actual_cost.external_cost_usd
                  : undefined,
            }
          : undefined,
        sources: citationLinks,
        artifacts: signedArtifacts.map((artifact) => ({
          id: artifact.id,
          type: artifact.artifact_type,
          title: artifact.title,
          storagePath: artifact.storage_path,
          downloadUrl: artifact.download_url ?? undefined,
        })),
        result: output,
        error: run.error_message ?? undefined,
        startedAt: new Date(run.started_at).getTime(),
        completedAt: run.completed_at ? new Date(run.completed_at).getTime() : undefined,
      },
    ];
  } else {
    const { data: artifact, error: artifactError } = await db
      .from("artifacts")
      .select("id,workspace_id,project_id,artifact_type,title,mime_type,storage_path,created_at")
      .eq("id", artifactId)
      .maybeSingle();

    if (artifactError) {
      return new Response(
        JSON.stringify({ error: artifactError.message, requestId }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!artifact) {
      return new Response(
        JSON.stringify({ error: "Artifact not found", requestId }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (artifact.workspace_id !== conversation.workspace_id) {
      return new Response(
        JSON.stringify({ error: "Artifact does not belong to this workspace", requestId }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const artifactProjectId = artifact.project_id ?? null;
    const conversationProjectId = conversation.project_id ?? null;

    if (artifactProjectId !== conversationProjectId) {
      return new Response(
        JSON.stringify({
          error: "Project scope mismatch between artifact and conversation",
          requestId,
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const signedArtifacts = await signArtifactUrls(supabase, [artifact]);
    const signed = signedArtifacts[0];

    content = [
      `Artifact attached: **${artifact.title}**`,
      `Type: ${artifact.artifact_type} (${artifact.mime_type})`,
      signed?.download_url ? `[Download artifact](${signed.download_url})` : "Download link unavailable.",
    ].join("\n\n");
  }

  const { data: insertedMessage, error: insertError } = await db
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role: "system",
      content,
      tool_calls: toolCalls,
    })
    .select("id,role,content,created_at,edited_at,tool_calls,attachments")
    .single();

  if (insertError || !insertedMessage) {
    return new Response(
      JSON.stringify({
        error: insertError?.message ?? "Failed to append tool result",
        requestId,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({
      requestId,
      message: {
        id: insertedMessage.id,
        role: insertedMessage.role,
        content: insertedMessage.content,
        createdAt: new Date(insertedMessage.created_at).getTime(),
        editedAt: insertedMessage.edited_at
          ? new Date(insertedMessage.edited_at).getTime()
          : undefined,
        toolCalls: Array.isArray(insertedMessage.tool_calls)
          ? insertedMessage.tool_calls
          : undefined,
        attachments: Array.isArray(insertedMessage.attachments)
          ? insertedMessage.attachments
          : undefined,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
