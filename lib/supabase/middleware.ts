import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./env";

const PUBLIC_ROUTES = new Set(["/", "/auth/login", "/auth/callback", "/intro"]);
const PROTECTED_ROUTE_PREFIXES = [
  "/",
  "/about",
  "/account",
  "/billing",
  "/chat",
  "/dashboard",
  "/fixtures",
  "/pricing",
  "/privacy",
  "/support",
  "/terms",
  "/usage",
] as const;

function isPublicRoute(pathname: string) {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname.match(/\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$/))
    return true;
  return false;
}

function isKnownProtectedRoute(pathname: string) {
  if (pathname === "/") return true;

  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) =>
      prefix !== "/" &&
      (pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
}

function isE2EAuthBypassed() {
  const bypass = process.env.E2E_AUTH_BYPASS;
  return Boolean(bypass && bypass !== "false" && bypass !== "0");
}

export async function updateSession(request: NextRequest) {
  if (isE2EAuthBypassed()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseConfig();

  const supabase = createServerClient(url, publishableKey, {
    cookieOptions: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: false,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const pathname = request.nextUrl.pathname;
  const isPublic = isPublicRoute(pathname);
  const isApi = pathname.startsWith("/api/");
  const isAuthenticated = Boolean(claims?.sub);

  if (
    !isApi &&
    !isPublic &&
    !isAuthenticated &&
    isKnownProtectedRoute(pathname)
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    const target = `${pathname}${request.nextUrl.search}`;
    redirectUrl.searchParams.set("next", target);
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname === "/auth/login" && isAuthenticated) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
