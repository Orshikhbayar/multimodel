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

async function getTemplateContext(templateId: string) {
  const supabase = await createSupabaseServerClient();
  const db = supabase as any;
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) {
    return {
      supabase,
      db,
      claims: null,
      template: null,
      error: "Authentication required",
    };
  }
  const { data: template, error } = await db
    .from("templates")
    .select("id,workspace_id")
    .eq("id", templateId)
    .maybeSingle();

  if (error) {
    return { supabase, db, claims, template: null, error: error.message };
  }
  if (!template) {
    return {
      supabase,
      db,
      claims,
      template: null,
      error: "Template not found",
    };
  }
  return { supabase, db, claims, template, error: null };
}

export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const requestId = nanoid(10);
  const { templateId } = await params;
  const context = await getTemplateContext(templateId);
  if (!context.claims?.sub) {
    return json({ error: context.error, requestId }, 401);
  }
  if (context.error) {
    return json({ error: context.error, requestId }, 404);
  }

  const { error } = await context.db.from("template_favorites").upsert(
    {
      workspace_id: context.template.workspace_id,
      user_id: context.claims.sub,
      template_id: templateId,
    },
    { onConflict: "workspace_id,user_id,template_id" },
  );

  if (error) {
    return json({ error: error.message, requestId }, 500);
  }

  return json({ requestId, ok: true, isFavorite: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const requestId = nanoid(10);
  const { templateId } = await params;
  const context = await getTemplateContext(templateId);
  if (!context.claims?.sub) {
    return json({ error: context.error, requestId }, 401);
  }
  if (context.error) {
    return json({ error: context.error, requestId }, 404);
  }

  const { error } = await context.db
    .from("template_favorites")
    .delete()
    .eq("workspace_id", context.template.workspace_id)
    .eq("user_id", context.claims.sub)
    .eq("template_id", templateId);

  if (error) {
    return json({ error: error.message, requestId }, 500);
  }

  return json({ requestId, ok: true, isFavorite: false });
}
