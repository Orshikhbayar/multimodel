"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseConfig } from "@/lib/supabase/env";

let browserClient: SupabaseClient<Database> | undefined;

export function createSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const { url, publishableKey } = getSupabaseConfig();
  browserClient = createBrowserClient<Database>(url, publishableKey, {
    cookieOptions: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: false,
    },
  });

  return browserClient;
}
