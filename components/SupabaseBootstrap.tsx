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
import {
  useConversationStore,
  useSettingsStore,
  useWorkspaceStore,
} from "@/lib/stores";
import { useSessionStore } from "@/lib/state/sessionStore";
import { useUserStore } from "@/lib/state/userStore";
import { getInitialFromName } from "@/lib/state/utils";
import type { Conversation } from "@/lib/types";

function getConversationActivityTimestamp(conversation: Conversation) {
  return (
    conversation.messages[conversation.messages.length - 1]?.createdAt ??
    conversation.createdAt
  );
}

function mergeConversation(
  server: Conversation,
  local?: Conversation,
): Conversation {
  if (!local) {
    return server;
  }

  const serverActivity = getConversationActivityTimestamp(server);
  const localActivity = getConversationActivityTimestamp(local);
  const useLocalMessages =
    local.messages.length > server.messages.length ||
    localActivity > serverActivity;

  return {
    ...server,
    title: local.title?.trim() ? local.title : server.title,
    projectId: local.projectId ?? server.projectId,
    createdAt: Math.min(local.createdAt, server.createdAt),
    messages: useLocalMessages ? local.messages : server.messages,
  };
}

function mergeConversations(
  serverConversations: Conversation[],
  localConversations: Conversation[],
) {
  const localById = new Map(
    localConversations.map((conversation) => [conversation.id, conversation]),
  );
  const serverIds = new Set(
    serverConversations.map((conversation) => conversation.id),
  );

  const merged = serverConversations.map((conversation) =>
    mergeConversation(conversation, localById.get(conversation.id)),
  );

  for (const localConversation of localConversations) {
    if (!serverIds.has(localConversation.id)) {
      merged.push(localConversation);
    }
  }

  return merged.sort(
    (a, b) =>
      getConversationActivityTimestamp(b) - getConversationActivityTimestamp(a),
  );
}

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
      useSettingsStore.getState().dismissOnboarding();
      return () => {
        cancelled = true;
      };
    }

    const supabase = createSupabaseBrowserClient();
    const clearLocalAuthState = (clearConversations: boolean) => {
      useSessionStore.getState().signOut();
      useUserStore.getState().resetUser();
      useWorkspaceStore.getState().setWorkspaceId(null);
      if (clearConversations) {
        useConversationStore.setState({
          conversations: [],
          currentConversationId: null,
        });
      }
    };

    const syncFromSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        const shouldClearConversations =
          useSessionStore.getState().isAuthenticated;
        clearLocalAuthState(shouldClearConversations);
        return;
      }

      const oauthProvider = getOAuthProviderRequiringAvatar(user);
      const avatarUrl = extractOAuthAvatarUrl(user, oauthProvider);

      if (oauthProvider && !avatarUrl) {
        await supabase.auth.signOut();
        clearLocalAuthState(true);

        if (typeof window !== "undefined") {
          const next = `${window.location.pathname}${window.location.search}`;
          const loginUrl = new URL("/auth/login", window.location.origin);
          loginUrl.searchParams.set("error", "oauth_avatar_required");
          loginUrl.searchParams.set("next", next.startsWith("/") ? next : "/");
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

      let serverConversations: Conversation[];
      try {
        serverConversations = await hydrateWorkspaceConversations(
          supabase,
          workspaceId,
        );
      } catch (error) {
        console.error(
          "[SupabaseBootstrap] Failed to hydrate workspace conversations",
          error,
        );
        return;
      }

      if (cancelled) return;

      const localConversations = useConversationStore.getState().conversations;
      const conversations = mergeConversations(
        serverConversations,
        localConversations,
      );
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
