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

export async function GET(
  _request: NextRequest,
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

  const { data: versions, error } = await db
    .from("template_versions")
    .select(
      "id,template_id,workspace_id,version_number,title,description,body_md,input_schema,change_note,created_by,created_at",
    )
    .eq("template_id", templateId)
    .order("version_number", { ascending: false });

  if (error) {
    return json({ error: error.message, requestId }, 500);
  }

  return json({ requestId, versions: versions ?? [] });
}
