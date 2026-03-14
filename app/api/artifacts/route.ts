/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest } from "next/server";
import { nanoid } from "nanoid";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceId } from "@/lib/tools/context";

export async function GET(request: NextRequest) {
  const requestId = nanoid(10);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return new Response(
      JSON.stringify({
        error: "Authentication required",
        requestId,
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const params = request.nextUrl.searchParams;
  const hasProjectParam = params.has("project_id");
  const projectIdRaw = params.get("project_id");
  const conversationId = params.get("conversation_id");
  const limit = Math.min(100, Math.max(1, Number.parseInt(params.get("limit") ?? "30", 10)));

  const projectId =
    projectIdRaw === "null" ? null : (projectIdRaw && projectIdRaw.length > 0 ? projectIdRaw : null);

  const workspaceId = await resolveWorkspaceId(supabase, claims.sub, projectId);

  const db = supabase as any;

  let query = db
    .from("artifacts")
    .select(
      "id,artifact_type,title,mime_type,storage_path,byte_size,metadata,citations,created_at,project_id,conversation_id,message_id",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (hasProjectParam) {
    if (projectId === null) {
      query = query.is("project_id", null);
    } else {
      query = query.eq("project_id", projectId);
    }
  }

  if (conversationId) {
    query = query.eq("conversation_id", conversationId);
  }

  const { data: artifacts, error } = await query;

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message, requestId }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const records = Array.isArray(artifacts) ? artifacts : [];
  const signed = await Promise.all(
    records.map(async (artifact) => {
      const storagePath = typeof artifact.storage_path === "string" ? artifact.storage_path : "";
      if (!storagePath) {
        return {
          ...artifact,
          download_url: null,
        };
      }

      const { data: signedData } = await supabase.storage
        .from("artifacts")
        .createSignedUrl(storagePath, 60 * 60);

      return {
        ...artifact,
        download_url: signedData?.signedUrl ?? null,
      };
    }),
  );

  return new Response(
    JSON.stringify({ requestId, artifacts: signed }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
