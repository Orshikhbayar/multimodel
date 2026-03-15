/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function badRequest(message: string, requestId: string) {
  return new Response(JSON.stringify({ error: message, requestId }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(request: NextRequest) {
  const requestId = nanoid(10);
  const supabase = await createSupabaseServerClient();
  const db = supabase as any;
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return json({ error: "Authentication required", requestId }, 401);
  }

  const params = request.nextUrl.searchParams;
  const workspaceId = params.get("workspace_id");
  const query = params.get("q")?.trim();
  const workflowPackId = params.get("workflow_pack_id")?.trim();
  const favoritesOnly = params.get("favorites_only") === "true";
  const limit = Math.min(
    200,
    Math.max(1, Number.parseInt(params.get("limit") ?? "50", 10)),
  );

  if (!workspaceId) {
    return badRequest("workspace_id is required", requestId);
  }

  let templateQuery = db
    .from("templates")
    .select(
      "id,workspace_id,created_by,workflow_pack_id,title,description,body_md,input_schema,is_system,system_key,workspace_use_count,last_used_at,created_at,updated_at",
    )
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (workflowPackId) {
    templateQuery = templateQuery.eq("workflow_pack_id", workflowPackId);
  }

  if (query && query.length > 0) {
    const escaped = query.replace(/[%_]/g, "");
    templateQuery = templateQuery.or(
      `title.ilike.%${escaped}%,description.ilike.%${escaped}%,body_md.ilike.%${escaped}%`,
    );
  }

  const { data: templates, error: templateError } = await templateQuery;
  if (templateError) {
    return json({ error: templateError.message, requestId }, 500);
  }

  const templateIds = (templates ?? []).map((row: any) => row.id);
  let favoriteIds = new Set<string>();

  if (templateIds.length > 0) {
    const { data: favorites, error: favoriteError } = await db
      .from("template_favorites")
      .select("template_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", claims.sub)
      .in("template_id", templateIds);

    if (favoriteError) {
      return json({ error: favoriteError.message, requestId }, 500);
    }

    favoriteIds = new Set(
      (favorites ?? []).map((favorite: any) => favorite.template_id as string),
    );
  }

  const list = (templates ?? [])
    .map((row: any) => ({
      ...row,
      is_favorite: favoriteIds.has(row.id),
    }))
    .filter((row: any) => (favoritesOnly ? row.is_favorite : true));

  return json({ requestId, templates: list });
}

export async function POST(request: NextRequest) {
  const requestId = nanoid(10);
  const supabase = await createSupabaseServerClient();
  const db = supabase as any;
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return json({ error: "Authentication required", requestId }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON body", requestId);
  }

  const workspaceId =
    typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
  const workflowPackId =
    typeof body.workflowPackId === "string" ? body.workflowPackId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : null;
  const bodyMd = typeof body.bodyMd === "string" ? body.bodyMd.trim() : "";
  const inputSchema = Array.isArray(body.inputSchema) ? body.inputSchema : [];
  const isSystem = body.isSystem === true;
  const systemKey =
    typeof body.systemKey === "string" && body.systemKey.trim().length > 0
      ? body.systemKey.trim()
      : null;
  const changeNote =
    typeof body.changeNote === "string" ? body.changeNote.trim() : null;

  if (!workspaceId) {
    return badRequest("workspaceId is required", requestId);
  }
  if (!workflowPackId) {
    return badRequest("workflowPackId is required", requestId);
  }
  if (!title) {
    return badRequest("title is required", requestId);
  }
  if (!bodyMd) {
    return badRequest("bodyMd is required", requestId);
  }

  const templateInsert = {
    workspace_id: workspaceId,
    created_by: claims.sub,
    workflow_pack_id: workflowPackId,
    title,
    description,
    body_md: bodyMd,
    input_schema: inputSchema,
    is_system: isSystem,
    system_key: systemKey,
  };

  const { data: createdTemplate, error: createError } = await db
    .from("templates")
    .insert(templateInsert)
    .select(
      "id,workspace_id,created_by,workflow_pack_id,title,description,body_md,input_schema,is_system,system_key,workspace_use_count,last_used_at,created_at,updated_at",
    )
    .single();

  if (createError) {
    return json({ error: createError.message, requestId }, 500);
  }

  const { error: versionError } = await db.from("template_versions").insert({
    template_id: createdTemplate.id,
    workspace_id: createdTemplate.workspace_id,
    version_number: 1,
    title: createdTemplate.title,
    description: createdTemplate.description,
    body_md: createdTemplate.body_md,
    input_schema: createdTemplate.input_schema,
    change_note: changeNote,
    created_by: claims.sub,
  });

  if (versionError) {
    return json({ error: versionError.message, requestId }, 500);
  }

  return json(
    {
      requestId,
      template: {
        ...createdTemplate,
        is_favorite: false,
      },
    },
    201,
  );
}
