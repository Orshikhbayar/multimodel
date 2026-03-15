import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("billing fx", () => {
  it("returns a live rate when a provider responds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("open.er-api.com")) {
          return {
            ok: true,
            json: async () => ({
              rates: { MNT: 3500 },
              time_last_update_utc: "Wed, 01 Jan 2025 00:00:00 +0000",
            }),
          };
        }
        return { ok: false, json: async () => ({}) };
      }),
    );

    const { getUsdToMntRate } = await import("@/lib/billing/fx");
    const rate = await getUsdToMntRate({ forceRefresh: true });

    expect(rate.live).toBe(true);
    expect(rate.usdToMnt).toBe(3500);
  });

  it("falls back when providers fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );

    const { getUsdToMntRate } = await import("@/lib/billing/fx");
    const rate = await getUsdToMntRate({ forceRefresh: true });

    expect(rate.live).toBe(false);
    expect(rate.source).toBe("fallback");
  });

  it("uses cache unless force refresh is set", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ rates: { MNT: 3000 } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { getUsdToMntRate } = await import("@/lib/billing/fx");
    await getUsdToMntRate({ forceRefresh: true });
    await getUsdToMntRate();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
