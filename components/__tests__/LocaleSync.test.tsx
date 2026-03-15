import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocaleSync } from "@/components/LocaleSync";

const { mockUseSettings } = vi.hoisted(() => ({
  mockUseSettings: vi.fn(),
}));

vi.mock("@/lib/state/hooks", () => ({
  useSettings: () => mockUseSettings(),
}));

describe("LocaleSync", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("lang");
    delete document.documentElement.dataset.reduceMotion;
  });

  it("updates html lang from locale setting", () => {
    mockUseSettings.mockReturnValue({
      locale: "mn-MN",
      reduceMotion: false,
    });

    render(<LocaleSync />);

    expect(document.documentElement.lang).toBe("mn");
  });

  it("mirrors reduceMotion setting to html dataset", () => {
    mockUseSettings.mockReturnValue({
      locale: "en",
      reduceMotion: true,
    });

    render(<LocaleSync />);

    expect(document.documentElement.dataset.reduceMotion).toBe("true");
  });
});
