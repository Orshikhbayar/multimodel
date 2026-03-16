import { describe, expect, it } from "vitest";

import {
  DEFAULT_SLOT_MODEL_IDS,
  getAllModelIds,
  getModelById,
  getModelCostPer1kTokens,
  getModelGlyphKey,
  getModelLabel,
  getProviderById,
  isValidModel,
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

  it("isValidModel returns true for real models and false for fictional ones", () => {
    expect(isValidModel("openai/gpt-4.1")).toBe(true);
    expect(isValidModel("anthropic/claude-sonnet-4")).toBe(true);
    expect(isValidModel("google/gemini-2.5-flash")).toBe(true);

    expect(isValidModel("openai/gpt-5.2")).toBe(false);
    expect(isValidModel("google/gemini-3-pro")).toBe(false);
    expect(isValidModel("anthropic/claude-opus-4.1")).toBe(false);
    expect(isValidModel("xai/grok-4")).toBe(false);
  });

  it("getAllModelIds returns a flat list matching MODELS length", () => {
    const ids = getAllModelIds();
    expect(ids).toHaveLength(MODELS.length);
    expect(ids).toContain("openai/gpt-4o");
    expect(ids).toContain("deepseek/deepseek-chat");
  });

  it("every model has positive pricing data", () => {
    for (const model of MODELS) {
      expect(model.inputCostPer1M).toBeDefined();
      expect(model.outputCostPer1M).toBeDefined();
      expect(model.inputCostPer1M!).toBeGreaterThan(0);
      expect(model.outputCostPer1M!).toBeGreaterThan(0);
    }
  });

  it("every model has a positive context window token count", () => {
    for (const model of MODELS) {
      expect(model.contextWindowTokens).toBeDefined();
      expect(model.contextWindowTokens!).toBeGreaterThan(0);
    }
  });

  it("output rate is always >= input rate (models charge more for generation)", () => {
    for (const model of MODELS) {
      if (model.inputCostPer1M && model.outputCostPer1M) {
        expect(model.outputCostPer1M).toBeGreaterThanOrEqual(model.inputCostPer1M);
      }
    }
  });

  it("getModelCostPer1kTokens returns a blended rate for known models", () => {
    const rate = getModelCostPer1kTokens("openai/gpt-4o");
    expect(rate).toBeDefined();
    expect(rate!).toBeGreaterThan(0);
  });

  it("getModelCostPer1kTokens returns undefined for unknown models", () => {
    expect(getModelCostPer1kTokens("unknown/model")).toBeUndefined();
  });
});
