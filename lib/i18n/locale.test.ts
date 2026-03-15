import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  getLocaleResponseInstruction,
  normalizeLocale,
  SUPPORTED_LOCALES,
} from "@/lib/i18n/locale";

describe("i18n locale", () => {
  it("normalizes supported locales", () => {
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("mn-MN")).toBe("mn");
    expect(normalizeLocale("unknown")).toBe(DEFAULT_LOCALE);
  });

  it("contains expected supported locales", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "mn"]);
  });

  it("returns mongolian response instruction only for mn", () => {
    expect(getLocaleResponseInstruction("mn")).toContain("Mongolian");
    expect(getLocaleResponseInstruction("en")).toBeNull();
  });
});
