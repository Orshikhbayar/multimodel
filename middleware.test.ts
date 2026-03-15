import { describe, expect, it, vi } from "vitest";

const { mockUpdateSession } = vi.hoisted(() => ({
  mockUpdateSession: vi.fn(),
}));

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: mockUpdateSession,
}));

import { config, middleware } from "@/middleware";

describe("middleware wrapper", () => {
  it("delegates to updateSession", async () => {
    const response = new Response("ok");
    mockUpdateSession.mockResolvedValue(response);

    const request = {
      nextUrl: new URL("http://localhost:3000/"),
      cookies: {
        getAll: () => [],
        set: vi.fn(),
      },
    } as unknown as Parameters<typeof middleware>[0];

    const result = await middleware(request);

    expect(mockUpdateSession).toHaveBeenCalled();
    expect(result).toBe(response);
  });

  it("keeps matcher config", () => {
    expect(config.matcher).toEqual([
      "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
    ]);
  });
});
