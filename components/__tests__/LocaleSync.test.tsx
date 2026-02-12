import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocaleSync } from "@/components/LocaleSync";

const mockedSettings = vi.hoisted(() => ({
  locale: "en",
  reduceMotion: false,
}));

vi.mock("@/lib/state/hooks", () => ({
  useSettings: () => mockedSettings,
}));

describe("LocaleSync", () => {
  afterEach(() => {
    document.documentElement.lang = "en";
    delete document.documentElement.dataset.reduceMotion;
  });

  it("sets normalized lang and reduce-motion dataset", () => {
    mockedSettings.locale = "mn-MN";
    mockedSettings.reduceMotion = true;

    render(<LocaleSync />);

    expect(document.documentElement.lang).toBe("mn");
    expect(document.documentElement.dataset.reduceMotion).toBe("true");
  });

  it("updates document when settings change", () => {
    mockedSettings.locale = "en";
    mockedSettings.reduceMotion = false;

    const { rerender } = render(<LocaleSync />);

    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dataset.reduceMotion).toBe("false");

    mockedSettings.locale = "en-US";
    mockedSettings.reduceMotion = false;
    rerender(<LocaleSync />);

    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dataset.reduceMotion).toBe("false");
  });
});
