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

  const { data: template, error: templateError } = await db
    .from("templates")
    .select("id,workspace_use_count")
    .eq("id", templateId)
    .maybeSingle();

  if (templateError) {
    return json({ error: templateError.message, requestId }, 500);
  }
  if (!template) {
    return json({ error: "Template not found", requestId }, 404);
  }

  const nextUseCount = Number(template.workspace_use_count ?? 0) + 1;
  const { data: updatedTemplate, error: updateError } = await db
    .from("templates")
    .update({
      workspace_use_count: nextUseCount,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId)
    .select("id,workspace_use_count,last_used_at")
    .single();

  if (updateError) {
    return json({ error: updateError.message, requestId }, 500);
  }

  return json({ requestId, template: updatedTemplate });
}
