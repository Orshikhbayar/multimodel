import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  extractOAuthAvatarUrl,
  getOAuthProviderRequiringAvatar,
} from "@/lib/supabase/oauthProfile";

function buildUser(payload: Partial<User>): Pick<
  User,
  "app_metadata" | "user_metadata" | "identities"
> {
  return {
    app_metadata: {},
    user_metadata: {},
    identities: [],
    ...payload,
  };
}

describe("oauthProfile helpers", () => {
  it("detects required oauth providers", () => {
    const user = buildUser({
      app_metadata: { provider: "github" },
    });

    expect(getOAuthProviderRequiringAvatar(user)).toBe("github");
  });

  it("extracts avatar from user metadata", () => {
    const user = buildUser({
      app_metadata: { provider: "google" },
      user_metadata: {
        picture: "https://lh3.googleusercontent.com/avatar.png",
      },
    });

    expect(extractOAuthAvatarUrl(user, "google")).toBe(
      "https://lh3.googleusercontent.com/avatar.png",
    );
  });

  it("extracts avatar from provider identity payload", () => {
    const user = buildUser({
      app_metadata: { providers: ["google"] },
      identities: [
        {
          provider: "google",
          identity_data: {
            avatar_url: "https://avatars.githubusercontent.com/u/42?v=4",
          },
        },
      ] as User["identities"],
    });

    expect(extractOAuthAvatarUrl(user, "google")).toBe(
      "https://avatars.githubusercontent.com/u/42?v=4",
    );
  });

  it("prefers the active provider identity over generic metadata", () => {
    const user = buildUser({
      app_metadata: { provider: "google" },
      user_metadata: {
        avatar_url: "https://example.com/stale.png",
      },
      identities: [
        {
          provider: "google",
          identity_data: {
            picture: "https://lh3.googleusercontent.com/fresh.png",
          },
        },
      ] as User["identities"],
    });

    expect(extractOAuthAvatarUrl(user, "google")).toBe(
      "https://lh3.googleusercontent.com/fresh.png",
    );
  });

  it("ignores invalid avatar values", () => {
    const user = buildUser({
      app_metadata: { provider: "google" },
      user_metadata: {
        picture: "not-a-url",
      },
    });

    expect(extractOAuthAvatarUrl(user, "google")).toBeNull();
  });
});
