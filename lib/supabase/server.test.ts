import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockCreateServerClient, mockCookies } = vi.hoisted(() => ({
  mockCreateServerClient: vi.fn(),
  mockCookies: {
    getAll: vi.fn(() => []),
    set: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => mockCookies,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mockCreateServerClient,
}));

vi.mock("@/lib/supabase/env", () => ({
  getSupabaseConfig: () => ({
    url: "https://example.supabase.co",
    publishableKey: "sb_pub",
  }),
}));

describe("supabase server helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns bypass user when E2E_AUTH_BYPASS is enabled", async () => {
    vi.stubEnv("E2E_AUTH_BYPASS", "true");

    const { getAuthenticatedUser } = await import("@/lib/supabase/server");
    const user = await getAuthenticatedUser();

    expect(user).toEqual({ id: "e2e-user", email: "e2e@example.com" });
  });

  it("builds server client and reads authenticated user claims", async () => {
    vi.stubEnv("E2E_AUTH_BYPASS", "");

    mockCreateServerClient.mockReturnValue({
      auth: {
        getClaims: vi.fn(async () => ({
          data: {
            claims: {
              sub: "user-1",
              email: "user@example.com",
            },
          },
        })),
      },
    });

    const { createSupabaseServerClient, getAuthenticatedUser } = await import(
      "@/lib/supabase/server"
    );

    const client = await createSupabaseServerClient();
    expect(client).toBeTruthy();

    const user = await getAuthenticatedUser();
    expect(user).toEqual({ id: "user-1", email: "user@example.com" });
  });
});
