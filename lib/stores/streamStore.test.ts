import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useStreamStore } from "@/lib/stores/streamStore";

describe("streamStore", () => {
  beforeEach(() => {
    useStreamStore.setState({ activeStreams: new Map() });
  });

  it("registers and removes streams", () => {
    const controller = new AbortController();

    act(() => {
      useStreamStore.getState().registerStream("run-1", controller);
    });

    expect(useStreamStore.getState().isStreamActive("run-1")).toBe(true);

    act(() => {
      useStreamStore.getState().removeStream("run-1");
    });

    expect(useStreamStore.getState().isStreamActive("run-1")).toBe(false);
  });

  it("aborts a specific stream", () => {
    const controller = new AbortController();
    const spy = vi.spyOn(controller, "abort");

    act(() => {
      useStreamStore.getState().registerStream("run-1", controller);
      useStreamStore.getState().abortStream("run-1");
    });

    expect(spy).toHaveBeenCalled();
    expect(useStreamStore.getState().activeStreams.size).toBe(0);
  });

  it("aborts all streams", () => {
    const first = new AbortController();
    const second = new AbortController();
    const firstSpy = vi.spyOn(first, "abort");
    const secondSpy = vi.spyOn(second, "abort");

    act(() => {
      useStreamStore.getState().registerStream("r1", first);
      useStreamStore.getState().registerStream("r2", second);
      useStreamStore.getState().abortAllStreams();
    });

    expect(firstSpy).toHaveBeenCalled();
    expect(secondSpy).toHaveBeenCalled();
    expect(useStreamStore.getState().activeStreams.size).toBe(0);
  });
});
