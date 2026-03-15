import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExchange, mockGetUser, mockSignOut } = vi.hoisted(() => ({
  mockExchange: vi.fn(),
  mockGetUser: vi.fn(),
  mockSignOut: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      exchangeCodeForSession: mockExchange,
      getUser: mockGetUser,
      signOut: mockSignOut,
    },
  }),
}));

import { GET } from "@/app/auth/callback/route";

describe("auth callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExchange.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockSignOut.mockResolvedValue({ error: null });
  });

  it("exchanges code and redirects to safe next path", async () => {
    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=abc&next=/projects",
      ),
    );

    expect(mockExchange).toHaveBeenCalledWith("abc");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/projects",
    );
  });

  it("sanitizes invalid next URL", async () => {
    const response = await GET(
      new Request("http://localhost:3000/auth/callback?next=https://evil.com"),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("rejects oauth users when provider avatar is missing", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          app_metadata: { provider: "google" },
          user_metadata: { full_name: "No Avatar User" },
          identities: [],
        },
      },
      error: null,
    });

    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=abc&next=/projects",
      ),
    );

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/auth/login?error=oauth_avatar_required&next=%2Fprojects",
    );
  });
});
