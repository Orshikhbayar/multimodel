import { describe, expect, it, vi } from "vitest";

const { mockSignOut } = vi.hoisted(() => ({
  mockSignOut: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signOut: mockSignOut,
    },
  }),
}));

import { GET, POST } from "@/app/auth/logout/route";

describe("auth logout route", () => {
  it("handles POST logout", async () => {
    const response = await POST();
    const body = await response.json();

    expect(mockSignOut).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("handles GET logout and redirects", async () => {
    const response = await GET(new Request("http://localhost:3000/auth/logout"));

    expect(mockSignOut).toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/auth/login");
  });
});
