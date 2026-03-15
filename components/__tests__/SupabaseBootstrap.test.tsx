import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SupabaseBootstrap } from "@/components/SupabaseBootstrap";
import { useConversationStore, useWorkspaceStore } from "@/lib/stores";
import { useSessionStore } from "@/lib/state/sessionStore";
import { useUserStore } from "@/lib/state/userStore";

describe("SupabaseBootstrap", () => {
  it("applies deterministic bypass session in e2e mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_E2E_BYPASS", "true");

    useSessionStore.getState().signOut();
    useUserStore.getState().resetUser();
    useWorkspaceStore.getState().resetWorkspace();
    useConversationStore.getState().resetConversations();

    render(<SupabaseBootstrap />);

    await waitFor(() => {
      expect(useSessionStore.getState().isAuthenticated).toBe(true);
    });

    expect(useUserStore.getState().user.email).toBe("demo@example.com");
    expect(useWorkspaceStore.getState().workspaceId).toBe("e2e-workspace");
  });
});
