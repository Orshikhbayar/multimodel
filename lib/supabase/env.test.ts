import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseConfig } from "@/lib/supabase/env";

describe("supabase env", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads configured url and publishable key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_pub");

    expect(getSupabaseConfig()).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "sb_pub",
    });
  });

  it("throws if url is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_pub");

    expect(() => getSupabaseConfig()).toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("falls back to legacy anon key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(getSupabaseConfig().publishableKey).toBe("anon");
  });
});
