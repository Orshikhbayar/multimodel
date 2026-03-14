import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_SESSION, useSessionStore } from "@/lib/state/sessionStore";

describe("sessionStore", () => {
  it("signs in, touches and signs out", () => {
    act(() => {
      useSessionStore.getState().signIn("token-1");
    });

    expect(useSessionStore.getState().isAuthenticated).toBe(true);
    expect(useSessionStore.getState().authToken).toBe("token-1");

    act(() => {
      useSessionStore.getState().touch();
    });

    expect(useSessionStore.getState().lastActiveAt).toBeTruthy();

    act(() => {
      useSessionStore.getState().signOut();
    });

    expect(useSessionStore.getState().isAuthenticated).toBe(
      DEFAULT_SESSION.isAuthenticated,
    );
    expect(useSessionStore.getState().authToken).toBe(
      DEFAULT_SESSION.authToken,
    );
  });
});
