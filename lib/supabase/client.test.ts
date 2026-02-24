import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockCreateBrowserClient } = vi.hoisted(() => ({
  mockCreateBrowserClient: vi.fn(() => ({ id: "client" })),
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: mockCreateBrowserClient,
}));

vi.mock("@/lib/supabase/env", () => ({
  getSupabaseConfig: () => ({
    url: "https://example.supabase.co",
    publishableKey: "sb_pub",
  }),
}));

describe("supabase browser client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreateBrowserClient.mockClear();
  });

  it("creates and memoizes a browser client", async () => {
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");

    const first = createSupabaseBrowserClient();
    const second = createSupabaseBrowserClient();

    expect(first).toBe(second);
    expect(mockCreateBrowserClient).toHaveBeenCalledTimes(1);
  });
});
