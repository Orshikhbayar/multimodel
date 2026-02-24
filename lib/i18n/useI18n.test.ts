import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { mockLocale } = vi.hoisted(() => ({
  mockLocale: vi.fn(),
}));

vi.mock("@/lib/state/settingsStore", () => ({
  useAppSettingsStore: (selector: (state: { locale: string }) => unknown) =>
    selector({ locale: mockLocale() }),
}));

import { useI18n } from "@/lib/i18n/useI18n";

describe("useI18n", () => {
  it("returns translation helpers", () => {
    mockLocale.mockReturnValue("en");

    const { result } = renderHook(() => useI18n());

    expect(result.current.locale).toBe("en");
    expect(result.current.t("common.appName")).toBeTruthy();
    expect(result.current.formatNumber(12)).toContain("12");
  });
});
