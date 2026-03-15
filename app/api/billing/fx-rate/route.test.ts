import { describe, expect, it, vi } from "vitest";

const { mockGetUsdToMntRate } = vi.hoisted(() => ({
  mockGetUsdToMntRate: vi.fn(),
}));

vi.mock("@/lib/billing/fx", () => ({
  getUsdToMntRate: mockGetUsdToMntRate,
}));

import { GET } from "@/app/api/billing/fx-rate/route";

describe("/api/billing/fx-rate", () => {
  it("returns latest rate with no-store cache", async () => {
    mockGetUsdToMntRate.mockResolvedValue({
      usdToMnt: 3500,
      fetchedAtISO: "2025-01-01T00:00:00.000Z",
      source: "test",
      live: true,
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(json.usdToMnt).toBe(3500);
  });
});
