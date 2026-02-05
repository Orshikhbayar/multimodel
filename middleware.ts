import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple middleware that checks for session cookie
// Full auth validation happens in API routes and server components
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check for session cookie (works in Edge runtime)
  const sessionCookie = request.cookies.get("authjs.session-token") 
    || request.cookies.get("__Secure-authjs.session-token");
  const isLoggedIn = !!sessionCookie;

  const isAuthPage = pathname.startsWith("/auth");
  const isApiAuthRoute = pathname.startsWith("/api/auth");
  const isApiRoute = pathname.startsWith("/api/");
  const isPublicRoute = pathname.startsWith("/intro");

  // Allow API auth routes and public routes
  if (isApiAuthRoute || isPublicRoute) {
    return NextResponse.next();
  }

  // For API routes (non-auth), let the route handler validate auth
  if (isApiRoute) {
    return NextResponse.next();
  }

  // Redirect logged-in users away from auth pages
  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Redirect non-logged-in users to login
  if (!isAuthPage && !isLoggedIn) {
    const callbackUrl = encodeURIComponent(pathname);
    return NextResponse.redirect(
      new URL(`/auth/login?callbackUrl=${callbackUrl}`, request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files and images
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
