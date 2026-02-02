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

import { useConversationStore, useModelStore, useSettingsStore, MODE_OPTIONS } from "@/lib/stores";
import { useChatActions } from "@/lib/hooks/useChatActions";

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
    const { sendMessage, stopAllStreams } = useChatActions();

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
        createConversation: conversationStore.createConversation,
        setCurrentConversation: conversationStore.setCurrentConversation,
        updateConversationTitle: conversationStore.updateConversationTitle,
        removeConversation: conversationStore.removeConversation,
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
        registerStream: () => { }, // Now handled internally
        clearStreams: stopAllStreams,
    };
}
