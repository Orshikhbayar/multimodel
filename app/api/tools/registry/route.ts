import { nanoid } from "nanoid";

import { getRegisteredToolDefinitions } from "@/lib/tools/definitions";
import { syncToolRegistryToDb } from "@/lib/tools/supabaseRegistrySync";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const requestId = nanoid(10);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims?.sub) {
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

  await syncToolRegistryToDb();

  const tools = getRegisteredToolDefinitions().map((tool) => ({
    tool_name: tool.tool_name,
    tool_version: tool.tool_version,
    description: tool.description,
    input_schema: tool.input_schema,
    output_schema: tool.output_schema,
    permissions: tool.permissions,
    estimated_cost: tool.estimated_cost,
    requires_confirmation: tool.requires_confirmation ?? false,
    changelog: tool.changelog,
    deprecated_at: tool.deprecated_at ?? null,
  }));

  return new Response(
    JSON.stringify({
      requestId,
      tools,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}
