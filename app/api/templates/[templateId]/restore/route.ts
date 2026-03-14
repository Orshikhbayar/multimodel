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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const requestId = nanoid(10);
  const { templateId } = await params;
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
    return json({ error: "Invalid JSON body", requestId }, 400);
  }

  const versionId =
    typeof body.versionId === "string" ? body.versionId.trim() : "";
  const versionNumber =
    typeof body.versionNumber === "number"
      ? Math.trunc(body.versionNumber)
      : null;

  if (!versionId && versionNumber === null) {
    return json(
      { error: "versionId or versionNumber is required", requestId },
      400,
    );
  }

  let versionQuery = db
    .from("template_versions")
    .select(
      "id,template_id,workspace_id,version_number,title,description,body_md,input_schema",
    )
    .eq("template_id", templateId);

  if (versionId) {
    versionQuery = versionQuery.eq("id", versionId);
  } else if (versionNumber !== null) {
    versionQuery = versionQuery.eq("version_number", versionNumber);
  }

  const { data: version, error: versionError } =
    await versionQuery.maybeSingle();
  if (versionError) {
    return json({ error: versionError.message, requestId }, 500);
  }
  if (!version) {
    return json({ error: "Version not found", requestId }, 404);
  }

  const { data: latestVersion, error: latestVersionError } = await db
    .from("template_versions")
    .select("version_number")
    .eq("template_id", templateId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestVersionError) {
    return json({ error: latestVersionError.message, requestId }, 500);
  }

  const { data: updatedTemplate, error: updateError } = await db
    .from("templates")
    .update({
      title: version.title,
      description: version.description,
      body_md: version.body_md,
      input_schema: version.input_schema,
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

  const nextVersion = (latestVersion?.version_number ?? 0) + 1;
  const { error: insertError } = await db.from("template_versions").insert({
    template_id: templateId,
    workspace_id: updatedTemplate.workspace_id,
    version_number: nextVersion,
    title: updatedTemplate.title,
    description: updatedTemplate.description,
    body_md: updatedTemplate.body_md,
    input_schema: updatedTemplate.input_schema,
    change_note: `Restored from version ${version.version_number}`,
    created_by: claims.sub,
  });

  if (insertError) {
    return json({ error: insertError.message, requestId }, 500);
  }

  return json({
    requestId,
    template: updatedTemplate,
    restoredFrom: version.version_number,
    versionNumber: nextVersion,
  });
}
