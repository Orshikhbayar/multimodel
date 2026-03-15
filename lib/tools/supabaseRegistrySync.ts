import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getToolRegistry } from "@/lib/tools/registry";

const REGISTRY_SYNC_TTL_MS = 10 * 60_000;
let lastSyncedAt = 0;
let syncInFlight: Promise<void> | null = null;

export async function syncToolRegistryToDb(): Promise<void> {
  const now = Date.now();
  if (now - lastSyncedAt < REGISTRY_SYNC_TTL_MS) {
    return;
  }

  if (syncInFlight) {
    await syncInFlight;
    return;
  }

  syncInFlight = (async () => {
    const registry = getToolRegistry();
    const tools = registry.list();

    if (tools.length === 0) {
      lastSyncedAt = Date.now();
      return;
    }

    let adminClient: ReturnType<typeof createSupabaseAdminClient>;
    try {
      adminClient = createSupabaseAdminClient();
    } catch {
      // Allow tool execution in environments without service role key.
      lastSyncedAt = Date.now();
      return;
    }

    const db = adminClient as unknown as {
      from: (table: string) => {
        upsert: (
          value: Record<string, unknown>[],
          options: { onConflict: string },
        ) => Promise<{ error: { message: string } | null }>;
      };
    };

    const rows = tools.map((tool) => ({
      tool_name: tool.tool_name,
      tool_version: tool.tool_version,
      description: tool.description,
      input_schema: tool.input_schema,
      output_schema: tool.output_schema,
      permissions: tool.permissions,
      estimated_cost: tool.estimated_cost,
      changelog: tool.changelog,
      deprecated_at: tool.deprecated_at ?? null,
    }));

    const { error } = await db.from("tool_registry").upsert(rows, {
      onConflict: "tool_name,tool_version",
    });

    if (error) {
      throw new Error(`Failed to sync tool registry: ${error.message}`);
    }

    lastSyncedAt = Date.now();
  })();

  try {
    await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}
