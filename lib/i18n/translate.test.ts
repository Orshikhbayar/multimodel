import { describe, expect, it } from "vitest";

import { t } from "@/lib/i18n/translate";

describe("i18n translate", () => {
  it("returns translated value for known keys", () => {
    expect(t("en", "common.appName")).toBeTruthy();
  });

  it("falls back to english for unsupported locale", () => {
    const value = t("fr", "common.appName");
    expect(value).toBe(t("en", "common.appName"));
  });

  it("interpolates params", () => {
    const text = t("en", "errors.errorId", { id: "abc123" });
    expect(text).toContain("abc123");
  });
});
