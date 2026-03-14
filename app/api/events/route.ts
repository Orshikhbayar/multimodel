import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface IncomingEventPayload {
  event?: string;
  properties?: Record<string, unknown>;
}

type ProductEventsInsertClient = {
  from: (table: "product_events") => {
    insert: (
      values: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
  };
};

function resolveOccurredAt(value: unknown) {
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return new Date().toISOString();
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return new Response(null, { status: 202 });
  }

  let body: IncomingEventPayload;
  try {
    body = (await request.json()) as IncomingEventPayload;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const eventName = typeof body.event === "string" ? body.event.trim() : "";
  if (!eventName) {
    return new Response(JSON.stringify({ error: "event is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const properties = body.properties ?? {};
  const workspaceId =
    typeof properties.workspace_id === "string"
      ? properties.workspace_id
      : null;
  const sessionId =
    typeof properties.session_id === "string" ? properties.session_id : null;
  const eventVersion =
    typeof properties.event_version === "number" &&
    Number.isFinite(properties.event_version)
      ? Math.max(1, Math.trunc(properties.event_version))
      : 1;

  const row = {
    workspace_id: workspaceId,
    user_id: claims.sub,
    session_id: sessionId,
    event_name: eventName,
    event_version: eventVersion,
    properties,
    occurred_at: resolveOccurredAt(properties.timestamp),
  };

  const productEventsClient = supabase as unknown as ProductEventsInsertClient;
  const { error } = await productEventsClient
    .from("product_events")
    .insert(row);
  if (error) {
    return new Response(
      JSON.stringify({ error: "Failed to store event", detail: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(null, { status: 202 });
}
