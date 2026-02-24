import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseConfig } from "@/lib/supabase/env";

let cachedAdminClient: ReturnType<typeof createClient<Database>> | null = null;

export function createSupabaseAdminClient() {
  if (cachedAdminClient) {
    return cachedAdminClient;
  }

  const { url } = getSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
  }

  cachedAdminClient = createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedAdminClient;
}
