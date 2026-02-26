/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest } from "next/server";
import { nanoid } from "nanoid";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
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

  const params = request.nextUrl.searchParams;
  const projectId = params.get("project_id");
  const limit = Math.min(100, Math.max(1, Number.parseInt(params.get("limit") ?? "30", 10)));

  const db = supabase as any;
  let query = db
    .from("tool_runs")
    .select(
      "id,tool_name,tool_version,status,input_hash,output_hash,actual_cost,error_code,error_message,duration_ms,started_at,completed_at,project_id,conversation_id,message_id",
    )
    .eq("caller_user_id", claims.sub)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data: runs, error } = await query;

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message, requestId }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({ requestId, runs: runs ?? [] }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
