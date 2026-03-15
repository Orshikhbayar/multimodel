import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_USER, useUserStore } from "@/lib/state/userStore";

describe("userStore", () => {
  it("sets user and updates profile", () => {
    act(() => {
      useUserStore.getState().setUser({
        ...DEFAULT_USER,
        id: "u1",
        name: "Alice",
        email: "alice@example.com",
      });
      useUserStore.getState().updateProfile({ name: "Bob" });
      useUserStore.getState().setPlan("pro");
      useUserStore.getState().setLocale("mn-MN");
    });

    const user = useUserStore.getState().user;
    expect(user.name).toBe("Bob");
    expect(user.plan).toBe("pro");
    expect(user.locale).toBe("mn");
    expect(user.avatarInitial).toBe("B");
  });

  it("resets user", () => {
    act(() => {
      useUserStore.getState().resetUser();
    });

    expect(useUserStore.getState().user).toEqual(DEFAULT_USER);
  });
});
