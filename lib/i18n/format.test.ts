import { describe, expect, it } from "vitest";

import {
  formatDateByLocale,
  formatDateTimeByLocale,
  formatNumberByLocale,
  formatTimeByLocale,
  toIntlLocale,
} from "@/lib/i18n/format";

describe("i18n format", () => {
  it("maps to intl locales", () => {
    expect(toIntlLocale("mn")).toBe("mn-MN");
    expect(toIntlLocale("en")).toBe("en-US");
  });

  it("formats date/time/number values", () => {
    const date = "2025-01-01T12:34:56.000Z";

    expect(formatDateByLocale(date, "en")).toBeTruthy();
    expect(formatTimeByLocale(date, "en")).toBeTruthy();
    expect(formatDateTimeByLocale(date, "en")).toBeTruthy();
    expect(formatNumberByLocale(1234.5, "en")).toContain("1");
  });
});
