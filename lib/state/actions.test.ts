import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { billingState } = vi.hoisted(() => {
  const state: {
    ui: { topUpModalOpen: boolean };
    openTopUpModal: ReturnType<typeof vi.fn>;
    resetBilling: ReturnType<typeof vi.fn>;
  } = {
    ui: { topUpModalOpen: false },
    openTopUpModal: vi.fn(),
    resetBilling: vi.fn(),
  };

  state.openTopUpModal.mockImplementation(() => {
    state.ui.topUpModalOpen = true;
  });

  state.resetBilling.mockImplementation(() => {
    state.ui.topUpModalOpen = false;
  });

  return { billingState: state };
});

vi.mock("@/lib/billing/store", () => ({
  useBillingStore: {
    getState: () => billingState,
  },
}));

import { useBillingStore } from "@/lib/billing/store";
import { useConversationStore } from "@/lib/stores/conversationStore";
import { useModelStore } from "@/lib/stores/modelStore";
import { useSettingsStore } from "@/lib/stores/settingsStore";
import { logoutLocal, signInLocal, updateLocale } from "@/lib/state/actions";
import { useSessionStore } from "@/lib/state/sessionStore";
import { useUserStore } from "@/lib/state/userStore";

describe("state actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    act(() => {
      useSessionStore.getState().signOut();
      useUserStore.getState().resetUser();
      useConversationStore.getState().resetConversations();
      useModelStore.getState().resetSlots();
      useSettingsStore.getState().resetSettings();
      useBillingStore.getState().resetBilling();
    });
  });

  it("signs in a local user", () => {
    act(() => {
      signInLocal({
        name: "Test User",
        email: "test@example.com",
        plan: "plus",
      });
    });

    expect(useSessionStore.getState().isAuthenticated).toBe(true);
    expect(useUserStore.getState().user.email).toBe("test@example.com");
    expect(useUserStore.getState().user.plan).toBe("plus");
  });

  it("updates locale in both settings and user store", () => {
    act(() => {
      updateLocale("mn-MN");
    });

    expect(useUserStore.getState().user.locale).toBe("mn");
  });

  it("logs out and resets related stores", () => {
    act(() => {
      useConversationStore.getState().createConversation("Temp");
      useModelStore
        .getState()
        .setActiveSlot(useModelStore.getState().slots[0].slotId);
      useSettingsStore.getState().setMode("debate");
      useBillingStore.getState().openTopUpModal();
      logoutLocal();
    });

    expect(useSessionStore.getState().isAuthenticated).toBe(false);
    expect(useConversationStore.getState().conversations).toHaveLength(0);
    expect(useBillingStore.getState().ui.topUpModalOpen).toBe(false);
  });
});
