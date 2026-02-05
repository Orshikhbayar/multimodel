import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Use Node.js runtime because auth() uses Prisma/bcrypt which need crypto
export const runtime = "nodejs";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith("/auth");
  const isApiAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");
  const isApiRoute = req.nextUrl.pathname.startsWith("/api/");
  const isPublicRoute = req.nextUrl.pathname.startsWith("/intro");

  // Allow API auth routes and public routes
  if (isApiAuthRoute || isPublicRoute) {
    return NextResponse.next();
  }

  // For API routes (non-auth), let the route handler return 401
  // Don't redirect API requests to login page
  if (isApiRoute) {
    return NextResponse.next();
  }

  // Redirect logged-in users away from auth pages
  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Redirect non-logged-in users to login
  if (!isAuthPage && !isLoggedIn) {
    const callbackUrl = encodeURIComponent(req.nextUrl.pathname);
    return NextResponse.redirect(
      new URL(`/auth/login?callbackUrl=${callbackUrl}`, req.url),
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match all routes except static files and images
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
