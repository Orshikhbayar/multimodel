import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  extractOAuthAvatarUrl,
  getOAuthProviderRequiringAvatar,
} from "@/lib/supabase/oauthProfile";

function getSafeNext(rawNext: string | null) {
  if (!rawNext) return "/";
  if (!rawNext.startsWith("/")) return "/";
  if (rawNext.startsWith("//")) return "/";
  return rawNext;
}

function redirectToLoginWithError(requestUrl: URL, next: string, errorCode: string) {
  const loginUrl = new URL("/auth/login", requestUrl.origin);
  loginUrl.searchParams.set("error", errorCode);
  loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeNext(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      return redirectToLoginWithError(requestUrl, next, "oauth_callback_failed");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const oauthProvider = getOAuthProviderRequiringAvatar(user);
      const avatarUrl = extractOAuthAvatarUrl(user, oauthProvider);

      if (oauthProvider && !avatarUrl) {
        await supabase.auth.signOut();
        return redirectToLoginWithError(requestUrl, next, "oauth_avatar_required");
      }
    }
  }

  const redirectUrl = new URL(next, requestUrl.origin);
  return NextResponse.redirect(redirectUrl);
}
