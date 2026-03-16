import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseConfig } from "@/lib/supabase/env";

function getBypassIdentity() {
  const bypass = process.env.E2E_AUTH_BYPASS;
  if (!bypass || bypass === "false") return null;

  const id = bypass === "true" ? "e2e-user" : bypass;
  return {
    id,
    email: process.env.E2E_AUTH_EMAIL || "e2e@example.com",
  };
}

export async function createSupabaseServerClient(): Promise<
  SupabaseClient<Database>
> {
  const bypassIdentity = getBypassIdentity();
  if (bypassIdentity) {
    return {
      auth: {
        getClaims: async () => ({
          data: {
            claims: {
              sub: bypassIdentity.id,
              email: bypassIdentity.email,
              role: "authenticated",
            },
          },
          error: null,
        }),
        getUser: async () => ({
          data: {
            user: {
              id: bypassIdentity.id,
              email: bypassIdentity.email,
            },
          },
          error: null,
        }),
        signOut: async () => ({ error: null }),
        exchangeCodeForSession: async () => ({ data: {}, error: null }),
      },
      from: (_table: string) => {
        const handler: ProxyHandler<object> = {
          get(_target, prop: string | symbol) {
            if (prop === "then") return undefined; // not a thenable itself
            if (prop === "single" || prop === "maybeSingle") {
              return async () => ({ data: null, error: null });
            }
            // Any other method returns a function that returns another Proxy
            return (..._args: unknown[]) => new Proxy({}, handler);
          },
        };
        return new Proxy({}, handler);
      },
      rpc: async () => ({ data: null, error: null }),
    } as unknown as SupabaseClient<Database>;
  }

  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseConfig();

  return createServerClient<Database>(url, publishableKey, {
    cookieOptions: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: false,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // No-op in server components where cookie writes may be blocked.
        }
      },
    },
  });
}

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const bypassIdentity = getBypassIdentity();
  if (bypassIdentity) {
    return bypassIdentity;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return null;
  }

  const email =
    typeof claims.email === "string"
      ? claims.email
      : typeof claims["email"] === "string"
        ? claims["email"]
        : null;

  return {
    id: claims.sub,
    email,
  };
}
