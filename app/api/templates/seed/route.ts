/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WORKFLOW_PACKS } from "@/lib/workflows/packs";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
    return json({ error: "Invalid JSON body", requestId }, 400);
  }

  const workspaceId =
    typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
  if (!workspaceId) {
    return json({ error: "workspaceId is required", requestId }, 400);
  }

  const now = new Date().toISOString();
  const rows = WORKFLOW_PACKS.flatMap((pack) => [
    {
      workspace_id: workspaceId,
      created_by: claims.sub,
      workflow_pack_id: pack.id,
      title: pack.starterTemplateTitle,
      description: `${pack.title} starter template`,
      body_md: pack.promptTemplate,
      input_schema: pack.inputFields,
      is_system: true,
      system_key: `${pack.id}:starter`,
      updated_at: now,
    },
    {
      workspace_id: workspaceId,
      created_by: claims.sub,
      workflow_pack_id: pack.id,
      title: `${pack.title} Safe Template`,
      description: "Safe fallback template suggested by guardrail checks",
      body_md: `Use this safe structure for ${pack.title} outputs.\n\n1) Facts only\n2) Explicit assumptions\n3) Risks and mitigations\n4) Next actions`,
      input_schema: [],
      is_system: true,
      system_key: `${pack.id}:safe`,
      updated_at: now,
    },
  ]);

  const { data: templates, error: upsertError } = await db
    .from("templates")
    .upsert(rows, { onConflict: "workspace_id,system_key" })
    .select(
      "id,workspace_id,workflow_pack_id,title,description,body_md,input_schema,is_system,system_key,created_at,updated_at",
    );

  if (upsertError) {
    return json({ error: upsertError.message, requestId }, 500);
  }

  const versionRows = (templates ?? []).map((template: any) => ({
    template_id: template.id,
    workspace_id: template.workspace_id,
    version_number: 1,
    title: template.title,
    description: template.description,
    body_md: template.body_md,
    input_schema: template.input_schema ?? [],
    change_note: "Seeded system template",
    created_by: claims.sub,
  }));

  if (versionRows.length > 0) {
    const { error: versionError } = await db
      .from("template_versions")
      .upsert(versionRows, { onConflict: "template_id,version_number" });
    if (versionError) {
      return json({ error: versionError.message, requestId }, 500);
    }
  }

  return json({
    requestId,
    seededCount: templates?.length ?? 0,
    templates: templates ?? [],
  });
}
