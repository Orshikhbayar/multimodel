/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest } from "next/server";
import { nanoid } from "nanoid";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ reportId: string }>;
  },
) {
  const requestId = nanoid(10);
  const supabase = await createSupabaseServerClient();
  const { data: claimData } = await supabase.auth.getClaims();

  if (!claimData?.claims?.sub) {
    return new Response(
      JSON.stringify({
        error: "Authentication required",
        requestId,
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  const { reportId } = await context.params;

  const db = supabase as any;

  const { data: report, error: reportError } = await db
    .from("research_reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();

  if (reportError) {
    return new Response(
      JSON.stringify({
        error: reportError.message,
        requestId,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  if (!report) {
    return new Response(
      JSON.stringify({
        error: "Research report not found",
        requestId,
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  const { data: sources, error: sourcesError } = await db
    .from("research_sources")
    .select("*")
    .eq("report_id", reportId);

  if (sourcesError) {
    return new Response(
      JSON.stringify({
        error: sourcesError.message,
        requestId,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  const { data: trace, error: traceError } = await db
    .from("research_traces")
    .select("*")
    .eq("report_id", reportId)
    .maybeSingle();

  if (traceError) {
    return new Response(
      JSON.stringify({
        error: traceError.message,
        requestId,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  return new Response(
    JSON.stringify({
      requestId,
      report,
      sources: sources ?? [],
      trace,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}
