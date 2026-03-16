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
    const model = getModelById("openai/gpt-4.1");
    expect(model?.label).toBe("GPT-4.1");

    const provider = getProviderById("openai");
    expect(provider?.name).toBe("OpenAI");
  });

  it("falls back for missing model label", () => {
    expect(getModelLabel("unknown/model")).toBe("unknown/model");
  });

  it("resolves glyph from model or provider", () => {
    expect(getModelGlyphKey("openai/gpt-4.1")).toBe("openai");
    expect(getModelGlyphKey(undefined, "misc")).toBe("misc");
  });

  it("contains no fictional/aspirational model IDs", () => {
    const bannedPrefixes = ["gpt-5", "gemini-3", "grok-4", "claude-opus-4.1"];
    for (const model of MODELS) {
      for (const prefix of bannedPrefixes) {
        expect(model.id).not.toContain(prefix);
      }
    }
  });

  it("DEFAULT_SLOT_MODEL_IDS are all present in catalog", () => {
    for (const id of DEFAULT_SLOT_MODEL_IDS) {
      expect(getModelById(id)).toBeDefined();
    }
  });
});
