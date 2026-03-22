"use client";

/**
 * Backwards-compatible store that wraps the new split stores
 *
 * This allows gradual migration from the old monolithic useChatStore
 * to the new split stores. Components can continue using useChatStore
 * while we migrate them one by one.
 *
 * MIGRATION GUIDE:
 * 1. For model operations: useModelStore()
 * 2. For settings: useSettingsStore()
 * 3. For conversations: useConversationStore()
 * 4. For streaming: useStreamStore()
 * 5. For chat actions: useChatActions()
 */

import {
  useConversationStore,
  useModelStore,
  useSettingsStore,
  useWorkspaceStore,
  MODE_OPTIONS,
} from "@/lib/stores";
import { useChatActions } from "@/lib/hooks/useChatActions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  deleteConversation as deleteConversationRecord,
  ensureWorkspaceId,
  updateConversationTitle as updateConversationTitleRecord,
  upsertConversation,
} from "@/lib/supabase/chatPersistence";
import { useAppSettingsStore } from "@/lib/state/settingsStore";

// Re-export MODE_OPTIONS for backwards compatibility
export { MODE_OPTIONS };

/**
 * Combined hook that provides the old useChatStore interface
 * backed by the new split stores
 */
export function useChatStore() {
  const conversationStore = useConversationStore();
  const modelStore = useModelStore();
  const settingsStore = useSettingsStore();
  const locale = useAppSettingsStore((state) => state.locale);
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const { sendMessage, stopAllStreams } = useChatActions();
  const isE2eBypass =
    process.env.NEXT_PUBLIC_E2E_BYPASS === "true" ||
    process.env.NEXT_PUBLIC_E2E_BYPASS === "1";

  const createConversation = (title?: string, projectId?: string) => {
    const id = conversationStore.createConversation(title, projectId);
    const createdConversation = useConversationStore
      .getState()
      .conversations.find((conversation) => conversation.id === id);

    if (isE2eBypass) {
      return id;
    }

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const resolvedWorkspaceId =
          workspaceId ?? (await ensureWorkspaceId(supabase));
        if (!workspaceId) {
          useWorkspaceStore.getState().setWorkspaceId(resolvedWorkspaceId);
        }
        await upsertConversation(supabase, {
          id,
          workspaceId: resolvedWorkspaceId,
          title:
            createdConversation?.title ??
            (locale === "mn" ? "Нэргүй чат" : "Untitled chat"),
          projectId: createdConversation?.projectId,
        });
      } catch (error) {
        console.error(
          "[useChatStore] Failed to persist conversation create",
          error,
        );
      }
    })();

    return id;
  };

  const updateConversationTitle = (id: string, title: string) => {
    conversationStore.updateConversationTitle(id, title);

    if (isE2eBypass) {
      return;
    }

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        await updateConversationTitleRecord(supabase, { id, title });
      } catch (error) {
        console.error(
          "[useChatStore] Failed to persist conversation title",
          error,
        );
      }
    })();
  };

  const removeConversation = (id: string) => {
    conversationStore.removeConversation(id);

    if (isE2eBypass) {
      return;
    }

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        await deleteConversationRecord(supabase, id);
      } catch (error) {
        console.error(
          "[useChatStore] Failed to persist conversation delete",
          error,
        );
      }
    })();
  };

  return {
    // Conversation state
    conversations: conversationStore.conversations,
    projects: conversationStore.projects,
    currentConversationId: conversationStore.currentConversationId,

    // Model state
    slots: modelStore.slots,
    activeSlotId: modelStore.activeSlotId,

    // Settings state
    mode: settingsStore.mode,
    instructions: settingsStore.instructions,

    // Stream handles (now managed internally)
    streamHandles: {} as Record<string, () => void>,

    // Conversation actions
    createConversation,
    setCurrentConversation: conversationStore.setCurrentConversation,
    updateConversationTitle,
    removeConversation,
    addProject: conversationStore.addProject,

    // Model actions
    setActiveSlot: modelStore.setActiveSlot,
    setSlotModel: modelStore.setSlotModel,
    toggleSlot: modelStore.toggleSlot,

    // Settings actions
    setMode: settingsStore.setMode,
    setInstructions: settingsStore.setInstructions,
    resetSettings: () => {
      settingsStore.resetSettings();
      modelStore.resetSlots();
    },

    // Chat actions
    sendMessage,

    // Message operations (delegated to conversation store)
    appendRunChunk: conversationStore.appendRunChunk,
    completeRun: conversationStore.completeRun,
    markRunError: conversationStore.markRunError,

    // Stream management
    registerStream: () => {}, // Now handled internally
    clearStreams: stopAllStreams,
  };
}
