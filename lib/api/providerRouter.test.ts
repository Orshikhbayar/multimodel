import { describe, expect, it, vi, afterEach } from "vitest";

import { streamCompletion } from "@/lib/api/providerRouter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("providerRouter.streamCompletion", () => {
  it("throws for unknown provider prefix", async () => {
    const gen = streamCompletion({
      model: "unknown/some-model",
      messages: [{ role: "user", content: "hi" }],
    });
    await expect(gen.next()).rejects.toThrow(
      'unknown provider prefix "unknown"',
    );
  });

  it("throws for malformed model string (no slash)", async () => {
    const gen = streamCompletion({
      model: "noProviderPrefix",
      messages: [{ role: "user", content: "hi" }],
    });
    await expect(gen.next()).rejects.toThrow();
  });

  it("routes openai/* to OpenAI adapter (delegates getOpenAIModelName error for unknown model)", async () => {
    const gen = streamCompletion({
      model: "openai/nonexistent-model",
      messages: [{ role: "user", content: "hi" }],
    });
    // Should throw from getOpenAIModelName, not the router
    await expect(gen.next()).rejects.toThrow(/MODEL_MAP/);
  });

  it("routes anthropic/* to Anthropic adapter when API key missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const gen = streamCompletion({
      model: "anthropic/claude-sonnet-4",
      messages: [{ role: "user", content: "hi" }],
    });
    await expect(gen.next()).rejects.toThrow("ANTHROPIC_API_KEY");
  });

  it("routes google/* to Google adapter when API key missing", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "");
    const gen = streamCompletion({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: "hi" }],
    });
    await expect(gen.next()).rejects.toThrow("GOOGLE_API_KEY");
  });

  it("routes xai/* to OpenAI-compatible adapter when API key missing", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    const gen = streamCompletion({
      model: "xai/grok-3",
      messages: [{ role: "user", content: "hi" }],
    });
    await expect(gen.next()).rejects.toThrow("XAI_API_KEY");
  });

  it("routes deepseek/* to OpenAI-compatible adapter when API key missing", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const gen = streamCompletion({
      model: "deepseek/deepseek-chat",
      messages: [{ role: "user", content: "hi" }],
    });
    await expect(gen.next()).rejects.toThrow("DEEPSEEK_API_KEY");
  });
});
