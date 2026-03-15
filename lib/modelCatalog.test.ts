import { describe, expect, it } from "vitest";

import {
  DEFAULT_SLOT_MODEL_IDS,
  getModelById,
  getModelGlyphKey,
  getModelLabel,
  getProviderById,
  MODELS,
  PROVIDERS,
} from "@/lib/modelCatalog";

describe("modelCatalog", () => {
  it("exposes providers and models", () => {
    expect(PROVIDERS.length).toBeGreaterThan(0);
    expect(MODELS.length).toBeGreaterThan(0);
    expect(DEFAULT_SLOT_MODEL_IDS.length).toBeGreaterThan(0);
  });

  it("resolves model and provider by id", () => {
    const model = getModelById("openai/gpt-5.2");
    expect(model?.label).toBe("GPT-5.2");

    const provider = getProviderById("openai");
    expect(provider?.name).toBe("OpenAI");
  });

  it("falls back for missing model label", () => {
    expect(getModelLabel("unknown/model")).toBe("unknown/model");
  });

  it("resolves glyph from model or provider", () => {
    expect(getModelGlyphKey("openai/gpt-5.2")).toBe("openai");
    expect(getModelGlyphKey(undefined, "misc")).toBe("misc");
  });
});
