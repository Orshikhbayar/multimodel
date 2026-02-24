import { describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/auth/[...nextauth]/route";

describe("legacy nextauth route", () => {
  it("returns 410 for GET", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.error).toContain("Legacy NextAuth route removed");
  });

  it("returns 410 for POST", async () => {
    const response = await POST();
    expect(response.status).toBe(410);
  });
});
