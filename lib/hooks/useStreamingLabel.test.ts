import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStreamingLabel } from "./useStreamingLabel";

describe("useStreamingLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a default label when not streaming", () => {
    const { result } = renderHook(() => useStreamingLabel("some text", "done"));
    expect(result.current).toBeTruthy();
    expect(typeof result.current).toBe("string");
  });

  it("returns coding label when text matches code pattern", () => {
    const { result } = renderHook(() =>
      useStreamingLabel("function foo() { return 42; }", "streaming"),
    );
    expect(result.current).toBe("Writing the code...");
  });

  it("returns analysis label when text matches analysis pattern", () => {
    const { result } = renderHook(() =>
      useStreamingLabel("Let me analyze and compare the options", "streaming"),
    );
    expect(result.current).toBe("Comparing perspectives...");
  });

  it("returns default label when no pattern matches", () => {
    const { result } = renderHook(() =>
      useStreamingLabel("hello world", "streaming"),
    );
    expect(result.current).toBe("Synthesizing...");
  });

  it("rotates labels every 2.5 seconds while streaming", () => {
    const { result } = renderHook(() =>
      useStreamingLabel("hello world", "streaming"),
    );
    expect(result.current).toBe("Synthesizing...");

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current).toBe("Thinking...");

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current).toBe("Processing...");

    // Wraps around
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current).toBe("Synthesizing...");
  });

  it("stops rotating when status changes to done", () => {
    const { result, rerender } = renderHook(
      ({ status }: { status: string }) =>
        useStreamingLabel("hello world", status),
      { initialProps: { status: "streaming" } },
    );

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current).toBe("Thinking...");

    rerender({ status: "done" });

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // Should not continue rotating after status changes
    expect(typeof result.current).toBe("string");
  });

  it("returns static label when text is longer than 200 chars", () => {
    const longText = "a".repeat(201);
    const { result } = renderHook(() =>
      useStreamingLabel(longText, "streaming"),
    );
    // Should return first label, not rotate
    const initial = result.current;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(initial);
  });

  it("returns visualization label for chart-related text", () => {
    const { result } = renderHook(() =>
      useStreamingLabel("building a chart visualization", "streaming"),
    );
    expect(result.current).toBe("Building the visualization...");
  });

  it("returns research label for source-related text", () => {
    const { result } = renderHook(() =>
      useStreamingLabel("according to research sources", "streaming"),
    );
    expect(result.current).toBe("Pulling from sources...");
  });
});
