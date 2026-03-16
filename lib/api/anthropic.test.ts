import { describe, expect, it, vi, afterEach } from "vitest";

import {
  getAnthropicModelName,
  streamAnthropicCompletion,
} from "@/lib/api/anthropic";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getAnthropicModelName", () => {
  it("maps known catalog IDs to Anthropic API strings", () => {
    expect(getAnthropicModelName("anthropic/claude-sonnet-4")).toBe(
      "claude-sonnet-4-5-20250514",
    );
    expect(getAnthropicModelName("anthropic/claude-opus-4")).toBe(
      "claude-opus-4-5-20250514",
    );
    expect(getAnthropicModelName("anthropic/claude-3.5")).toBe(
      "claude-3-5-sonnet-20241022",
    );
  });

  it("throws for unknown model IDs", () => {
    expect(() => getAnthropicModelName("anthropic/claude-opus-4.1")).toThrow(
      "getAnthropicModelName",
    );
    expect(() => getAnthropicModelName("openai/gpt-4o")).toThrow(
      "getAnthropicModelName",
    );
  });
});

describe("streamAnthropicCompletion", () => {
  it("throws when ANTHROPIC_API_KEY is not set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const gen = streamAnthropicCompletion({
      model: "anthropic/claude-sonnet-4",
      messages: [{ role: "user", content: "hello" }],
    });
    await expect(gen.next()).rejects.toThrow("ANTHROPIC_API_KEY");
  });

  it("streams content_block_delta events as token events", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");

    const encoder = new TextEncoder();
    const events =
      [
        `data: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 10 } } })}`,
        `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "hello" } })}`,
        `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: " world" } })}`,
        `data: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 5 } })}`,
        `data: ${JSON.stringify({ type: "message_stop" })}`,
      ].join("\n") + "\n";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        body: {
          getReader: () => {
            let done = false;
            return {
              read: async () => {
                if (done) return { done: true, value: undefined };
                done = true;
                return { done: false, value: encoder.encode(events) };
              },
              releaseLock: () => {},
            };
          },
        },
      })),
    );

    const collected: Array<{ type: string; content?: string }> = [];
    for await (const event of streamAnthropicCompletion({
      model: "anthropic/claude-sonnet-4",
      messages: [{ role: "user", content: "hi" }],
    })) {
      collected.push(event);
    }

    const tokens = collected.filter((e) => e.type === "token");
    const usages = collected.filter((e) => e.type === "usage");

    expect(tokens.map((e) => e.content).join("")).toBe("hello world");
    expect(usages).toHaveLength(1);
    if (usages[0].type === "usage") {
      // @ts-expect-error narrowing
      expect(usages[0].usage.promptTokens).toBe(10);
      // @ts-expect-error narrowing
      expect(usages[0].usage.completionTokens).toBe(5);
    }
  });

  it("throws on non-ok API response", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 529,
        json: async () => ({ error: { message: "overloaded" } }),
      })),
    );

    const gen = streamAnthropicCompletion({
      model: "anthropic/claude-sonnet-4",
      messages: [{ role: "user", content: "hi" }],
    });
    await expect(gen.next()).rejects.toThrow("overloaded");
  });
});
