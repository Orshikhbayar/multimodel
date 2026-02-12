import { create } from "zustand";

interface WorkspaceStoreState {
  workspaceId: string | null;
  setWorkspaceId: (workspaceId: string | null) => void;
  resetWorkspace: () => void;
}

export type WorkspaceStore = WorkspaceStoreState;

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaceId: null,
  setWorkspaceId: (workspaceId) => set({ workspaceId }),
  resetWorkspace: () => set({ workspaceId: null }),
}));
