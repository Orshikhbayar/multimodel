"use client";

import { useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useConversationStore } from "@/lib/stores";
import {
  getConversations,
  createConversation as dbCreateConversation,
  deleteConversation as dbDeleteConversation,
  updateConversationTitle as dbUpdateConversationTitle,
  addMessage as dbAddMessage,
} from "@/lib/actions";
import type { Conversation, Message } from "@/lib/types";

/**
 * Hook to sync local conversation store with the database
 * - Loads conversations from DB on mount
 * - Provides wrapped actions that sync to both local and DB
 */
export function useDbSync() {
  const { data: session, status } = useSession();
  const store = useConversationStore();
  const initialLoadDone = useRef(false);

  // Load conversations from DB on mount when authenticated
  useEffect(() => {
    async function loadFromDb() {
      if (status !== "authenticated" || initialLoadDone.current) {
        return;
      }

      try {
        const dbConversations = await getConversations();
        if (dbConversations.length > 0) {
          // Merge DB conversations with local (DB takes precedence)
          const localIds = new Set(store.conversations.map((c) => c.id));
          const merged: Conversation[] = [...dbConversations];

          // Add any local-only conversations (created while offline)
          for (const local of store.conversations) {
            if (!dbConversations.find((db) => db.id === local.id)) {
              merged.push(local);
            }
          }

          // Sort by createdAt descending
          merged.sort((a, b) => b.createdAt - a.createdAt);

          // Update store with merged data
          // Note: This replaces the store state
          useConversationStore.setState({
            conversations: merged,
            currentConversationId:
              store.currentConversationId ?? merged[0]?.id ?? null,
          });
        }

        initialLoadDone.current = true;
      } catch (error) {
        console.error("[useDbSync] Failed to load conversations:", error);
        // Continue with local data if DB fails
        initialLoadDone.current = true;
      }
    }

    loadFromDb();
  }, [status, store.conversations, store.currentConversationId]);

  // Wrapped action: Create conversation (syncs to DB)
  const createConversation = useCallback(
    async (title: string = "New chat", projectId?: string): Promise<string> => {
      // Create locally first for immediate UI update
      const localId = store.createConversation(title, projectId);

      // Sync to DB in background
      if (status === "authenticated") {
        try {
          const dbId = await dbCreateConversation(title, projectId);
          if (dbId && dbId !== localId) {
            // Update local ID to match DB ID
            useConversationStore.setState((state) => ({
              conversations: state.conversations.map((c) =>
                c.id === localId ? { ...c, id: dbId } : c,
              ),
              currentConversationId:
                state.currentConversationId === localId
                  ? dbId
                  : state.currentConversationId,
            }));
            return dbId;
          }
        } catch (error) {
          console.error("[useDbSync] Failed to create conversation in DB:", error);
          // Keep local version
        }
      }

      return localId;
    },
    [store, status],
  );

  // Wrapped action: Delete conversation (syncs to DB)
  const removeConversation = useCallback(
    async (id: string): Promise<void> => {
      // Remove locally first
      store.removeConversation(id);

      // Sync to DB in background
      if (status === "authenticated") {
        try {
          await dbDeleteConversation(id);
        } catch (error) {
          console.error("[useDbSync] Failed to delete conversation in DB:", error);
        }
      }
    },
    [store, status],
  );

  // Wrapped action: Update title (syncs to DB)
  const updateConversationTitle = useCallback(
    async (id: string, title: string): Promise<void> => {
      // Update locally first
      store.updateConversationTitle(id, title);

      // Sync to DB in background
      if (status === "authenticated") {
        try {
          await dbUpdateConversationTitle(id, title);
        } catch (error) {
          console.error("[useDbSync] Failed to update title in DB:", error);
        }
      }
    },
    [store, status],
  );

  // Wrapped action: Add message (syncs to DB)
  const addMessage = useCallback(
    async (
      conversationId: string,
      message: Omit<Message, "id" | "createdAt">,
    ): Promise<string | null> => {
      // Add locally first - we need to generate an ID
      const localMessage: Message = {
        ...message,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      };

      store.addMessages(conversationId, [localMessage]);

      // Sync to DB in background
      if (status === "authenticated") {
        try {
          const dbId = await dbAddMessage(conversationId, message);
          if (dbId && dbId !== localMessage.id) {
            // Update local ID to match DB ID
            useConversationStore.setState((state) => ({
              conversations: state.conversations.map((c) => {
                if (c.id !== conversationId) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === localMessage.id ? { ...m, id: dbId } : m,
                  ),
                };
              }),
            }));
            return dbId;
          }
          return dbId;
        } catch (error) {
          console.error("[useDbSync] Failed to add message in DB:", error);
        }
      }

      return localMessage.id;
    },
    [store, status],
  );

  return {
    isLoading: status === "loading" || !initialLoadDone.current,
    isAuthenticated: status === "authenticated",
    // Original store access
    store,
    // Wrapped actions that sync to DB
    createConversation,
    removeConversation,
    updateConversationTitle,
    addMessage,
  };
}
