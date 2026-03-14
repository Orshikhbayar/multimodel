import { describe, expect, it, vi } from "vitest";

import {
  getOpenAIModelName,
  streamOpenAICompletion,
  streamWithCallbacks,
} from "@/lib/api/openai";
import { buildDoneSseChunk, buildSseChunk, streamFromStrings } from "@/test/utils/sse";

describe("openai api helpers", () => {
  it("maps internal model IDs", () => {
    expect(getOpenAIModelName("openai/gpt-5.2")).toBe("gpt-5.2");
    expect(getOpenAIModelName("openai/unknown")).toBe("gpt-4o-mini");
  });

  it("streams token and usage events from SSE", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        body: streamFromStrings([
          buildSseChunk({ choices: [{ delta: { content: "hello" } }] }),
          buildSseChunk({ usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }),
          buildDoneSseChunk(),
        ]),
      })),
    );

    const events: Array<{ type: string }> = [];
    for await (const event of streamOpenAICompletion({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    })) {
      events.push({ type: event.type });
    }

    expect(events).toEqual([{ type: "token" }, { type: "usage" }]);
  });

  it("throws for non-ok response", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "upstream failed" } }),
      })),
    );

    const iter = streamOpenAICompletion({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    });

    await expect(iter.next()).rejects.toThrow("upstream failed");
  });

  it("supports callback helper", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        body: streamFromStrings([
          buildSseChunk({ choices: [{ delta: { content: "abc" } }] }),
          buildDoneSseChunk(),
        ]),
      })),
    );

    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await streamWithCallbacks(
      {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hello" }],
      },
      { onToken, onDone, onError },
    );

    expect(onToken).toHaveBeenCalledWith("abc");
    expect(onDone).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
