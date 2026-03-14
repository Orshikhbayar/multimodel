import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatErrorBoundary, ErrorBoundary } from "@/components/ErrorBoundary";

function ProblemChild(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("renders fallback UI on error and allows reset", () => {
    const onReset = vi.fn();

    render(
      <ErrorBoundary onReset={onReset}>
        <ProblemChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onReset).toHaveBeenCalled();
  });

  it("renders chat-specific fallback", () => {
    render(
      <ChatErrorBoundary>
        <ProblemChild />
      </ChatErrorBoundary>,
    );

    expect(screen.getByText(/chat failed/i)).toBeInTheDocument();
  });
});
