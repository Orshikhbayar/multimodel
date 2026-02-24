"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ensureWorkspaceId,
  hydrateWorkspaceConversations,
} from "@/lib/supabase/chatPersistence";
import {
  extractOAuthAvatarUrl,
  getOAuthProviderRequiringAvatar,
} from "@/lib/supabase/oauthProfile";
import { useConversationStore, useWorkspaceStore } from "@/lib/stores";
import { useSessionStore } from "@/lib/state/sessionStore";
import { useUserStore } from "@/lib/state/userStore";
import { getInitialFromName } from "@/lib/state/utils";

export function SupabaseBootstrap() {
  useEffect(() => {
    let cancelled = false;
    const bypass =
      process.env.NEXT_PUBLIC_E2E_BYPASS === "true" ||
      process.env.NEXT_PUBLIC_E2E_BYPASS === "1";

    if (bypass) {
      useSessionStore.getState().signIn("e2e-bypass");
      useUserStore.getState().setUser({
        id: "e2e-user",
        name: "Demo User",
        email: "demo@example.com",
        avatarInitial: "D",
        plan: "free",
        locale: useUserStore.getState().user.locale,
      });
      useWorkspaceStore.getState().setWorkspaceId("e2e-workspace");
      return () => {
        cancelled = true;
      };
    }

    const supabase = createSupabaseBrowserClient();
    const clearLocalAuthState = () => {
      useSessionStore.getState().signOut();
      useUserStore.getState().resetUser();
      useWorkspaceStore.getState().setWorkspaceId(null);
      useConversationStore.setState({
        conversations: [],
        currentConversationId: null,
      });
    };

    const syncFromSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        clearLocalAuthState();
        return;
      }

      const oauthProvider = getOAuthProviderRequiringAvatar(user);
      const avatarUrl = extractOAuthAvatarUrl(user, oauthProvider);

      if (oauthProvider && !avatarUrl) {
        await supabase.auth.signOut();
        clearLocalAuthState();

        if (typeof window !== "undefined") {
          const next = `${window.location.pathname}${window.location.search}`;
          const loginUrl = new URL("/auth/login", window.location.origin);
          loginUrl.searchParams.set("error", "oauth_avatar_required");
          loginUrl.searchParams.set(
            "next",
            next.startsWith("/") ? next : "/",
          );
          window.location.assign(loginUrl.toString());
        }

        return;
      }

      const displayName =
        (user.user_metadata?.full_name as string | undefined) ||
        (user.user_metadata?.name as string | undefined) ||
        user.email?.split("@")[0] ||
        "User";

      useSessionStore.getState().signIn("supabase");
      useUserStore.getState().setUser({
        id: user.id,
        name: displayName,
        email: user.email ?? "",
        avatarInitial: getInitialFromName(displayName || user.email || "U"),
        avatarUrl: avatarUrl ?? undefined,
        plan: "free",
        locale: useUserStore.getState().user.locale,
      });

      const workspaceId = await ensureWorkspaceId(supabase);
      if (cancelled) return;

      useWorkspaceStore.getState().setWorkspaceId(workspaceId);

      const conversations = await hydrateWorkspaceConversations(
        supabase,
        workspaceId,
      );

      if (cancelled) return;

      const currentConversationId =
        useConversationStore.getState().currentConversationId;
      const hasCurrent = conversations.some(
        (conversation) => conversation.id === currentConversationId,
      );

      useConversationStore.setState({
        conversations,
        currentConversationId: hasCurrent
          ? currentConversationId
          : (conversations[0]?.id ?? null),
      });
    };

    void syncFromSession().catch((error) => {
      console.error("[SupabaseBootstrap] Failed to initialize", error);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void syncFromSession().catch((error) => {
        console.error("[SupabaseBootstrap] Failed to sync auth change", error);
      });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
