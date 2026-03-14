import { describe, expect, it } from "vitest";
import { getBrowserAppBaseUrl } from "@/lib/appUrl";

describe("getBrowserAppBaseUrl", () => {
  it("prefers NEXT_PUBLIC_APP_URL when it is valid", () => {
    expect(
      getBrowserAppBaseUrl({
        configuredAppUrl: "https://multimodel-ai.vercel.app",
        origin: "http://localhost:3000",
      }),
    ).toBe("https://multimodel-ai.vercel.app");
  });

  it("falls back to the current browser origin for local development", () => {
    expect(
      getBrowserAppBaseUrl({
        configuredAppUrl: undefined,
        origin: "http://localhost:3000",
      }),
    ).toBe("http://localhost:3000");
  });

  it("ignores invalid configured URLs", () => {
    expect(
      getBrowserAppBaseUrl({
        configuredAppUrl: "multimodel-ai.vercel.app",
        origin: "http://localhost:3000",
      }),
    ).toBe("http://localhost:3000");
  });
});
