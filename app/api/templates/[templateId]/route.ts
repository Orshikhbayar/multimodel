/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireAuth() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  return { supabase, claims };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const requestId = nanoid(10);
  const { templateId } = await params;
  const { supabase, claims } = await requireAuth();
  const db = supabase as any;

  if (!claims?.sub) {
    return json({ error: "Authentication required", requestId }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body", requestId }, 400);
  }

  const { data: existing, error: existingError } = await db
    .from("templates")
    .select(
      "id,workspace_id,workflow_pack_id,title,description,body_md,input_schema,is_system,system_key,workspace_use_count,last_used_at,created_at,updated_at",
    )
    .eq("id", templateId)
    .maybeSingle();

  if (existingError) {
    return json({ error: existingError.message, requestId }, 500);
  }
  if (!existing) {
    return json({ error: "Template not found", requestId }, 404);
  }

  const title =
    typeof body.title === "string" && body.title.trim().length > 0
      ? body.title.trim()
      : existing.title;
  const description =
    typeof body.description === "string"
      ? body.description.trim()
      : body.description === null
        ? null
        : existing.description;
  const bodyMd =
    typeof body.bodyMd === "string" && body.bodyMd.trim().length > 0
      ? body.bodyMd.trim()
      : existing.body_md;
  const workflowPackId =
    typeof body.workflowPackId === "string" &&
    body.workflowPackId.trim().length > 0
      ? body.workflowPackId.trim()
      : existing.workflow_pack_id;
  const inputSchema = Array.isArray(body.inputSchema)
    ? body.inputSchema
    : existing.input_schema;
  const changeNote =
    typeof body.changeNote === "string" ? body.changeNote.trim() : null;

  const { data: updatedTemplate, error: updateError } = await db
    .from("templates")
    .update({
      title,
      description,
      body_md: bodyMd,
      workflow_pack_id: workflowPackId,
      input_schema: inputSchema,
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId)
    .select(
      "id,workspace_id,workflow_pack_id,title,description,body_md,input_schema,is_system,system_key,workspace_use_count,last_used_at,created_at,updated_at",
    )
    .single();

  if (updateError) {
    return json({ error: updateError.message, requestId }, 500);
  }

  const { data: latestVersion, error: versionReadError } = await db
    .from("template_versions")
    .select("version_number")
    .eq("template_id", templateId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionReadError) {
    return json({ error: versionReadError.message, requestId }, 500);
  }

  const nextVersion = (latestVersion?.version_number ?? 0) + 1;
  const { error: versionInsertError } = await db
    .from("template_versions")
    .insert({
      template_id: templateId,
      workspace_id: updatedTemplate.workspace_id,
      version_number: nextVersion,
      title: updatedTemplate.title,
      description: updatedTemplate.description,
      body_md: updatedTemplate.body_md,
      input_schema: updatedTemplate.input_schema,
      change_note: changeNote,
      created_by: claims.sub,
    });

  if (versionInsertError) {
    return json({ error: versionInsertError.message, requestId }, 500);
  }

  return json({
    requestId,
    template: {
      ...updatedTemplate,
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const requestId = nanoid(10);
  const { templateId } = await params;
  const { supabase, claims } = await requireAuth();
  const db = supabase as any;

  if (!claims?.sub) {
    return json({ error: "Authentication required", requestId }, 401);
  }

  const { error } = await db.from("templates").delete().eq("id", templateId);
  if (error) {
    return json({ error: error.message, requestId }, 500);
  }

  return json({ requestId, ok: true });
}
