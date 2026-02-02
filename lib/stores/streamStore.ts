import { create } from "zustand";

interface StreamStoreState {
    /** Map of runId -> abort controller */
    activeStreams: Map<string, AbortController>;
}

interface StreamStoreActions {
    /** Register a new stream with its abort controller */
    registerStream: (runId: string, controller: AbortController) => void;

    /** Abort a specific stream */
    abortStream: (runId: string) => void;

    /** Abort all active streams */
    abortAllStreams: () => void;

    /** Check if a stream is active */
    isStreamActive: (runId: string) => boolean;

    /** Remove a stream from tracking (call after completion) */
    removeStream: (runId: string) => void;
}

export type StreamStore = StreamStoreState & StreamStoreActions;

export const useStreamStore = create<StreamStore>((set, get) => ({
    activeStreams: new Map(),

    registerStream: (runId, controller) =>
        set((state) => {
            const newStreams = new Map(state.activeStreams);
            newStreams.set(runId, controller);
            return { activeStreams: newStreams };
        }),

    abortStream: (runId) => {
        const controller = get().activeStreams.get(runId);
        if (controller) {
            controller.abort();
            set((state) => {
                const newStreams = new Map(state.activeStreams);
                newStreams.delete(runId);
                return { activeStreams: newStreams };
            });
        }
    },

    abortAllStreams: () => {
        const streams = get().activeStreams;
        streams.forEach((controller) => controller.abort());
        set({ activeStreams: new Map() });
    },

    isStreamActive: (runId) => get().activeStreams.has(runId),

    removeStream: (runId) =>
        set((state) => {
            const newStreams = new Map(state.activeStreams);
            newStreams.delete(runId);
            return { activeStreams: newStreams };
        }),
}));
