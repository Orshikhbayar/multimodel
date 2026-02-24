import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useWorkspaceStore } from "@/lib/stores/workspaceStore";

describe("workspaceStore", () => {
  it("sets and resets workspace ID", () => {
    act(() => {
      useWorkspaceStore.getState().setWorkspaceId("workspace-1");
    });

    expect(useWorkspaceStore.getState().workspaceId).toBe("workspace-1");

    act(() => {
      useWorkspaceStore.getState().resetWorkspace();
    });

    expect(useWorkspaceStore.getState().workspaceId).toBeNull();
  });
});
