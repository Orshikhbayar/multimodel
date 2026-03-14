import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockCreateServerClient, mockGetClaims } = vi.hoisted(() => ({
  mockCreateServerClient: vi.fn(),
  mockGetClaims: vi.fn(),
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

import { updateSession } from "@/lib/supabase/middleware";

function createMockRequest(url: string) {
  const parsed = new URL(url);
  return {
    nextUrl: {
      pathname: parsed.pathname,
      search: parsed.search,
      clone: () => new URL(parsed.toString()),
    },
    cookies: {
      getAll: () => [],
      set: vi.fn(),
    },
  };
}

describe("supabase middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("E2E_AUTH_BYPASS", "false");
    mockCreateServerClient.mockReturnValue({
      auth: {
        getClaims: mockGetClaims,
      },
    });
  });

  it("redirects unauthenticated users for protected routes", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: null } });

    const response = await updateSession(
      createMockRequest("http://localhost:3000/projects") as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth/login");
  });

  it("allows public routes without authentication", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: null } });

    const response = await updateSession(
      createMockRequest("http://localhost:3000/auth/login") as never,
    );

    expect(response.status).toBe(200);
  });

  it("allows unknown routes to fall through to not-found", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: null } });

    const response = await updateSession(
      createMockRequest(
        "http://localhost:3000/definitely-does-not-exist",
      ) as never,
    );

    expect(response.status).toBe(200);
  });
});
