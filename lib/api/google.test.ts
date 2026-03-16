import { describe, expect, it, vi, afterEach } from "vitest";

import { getGoogleModelName, streamGoogleCompletion } from "@/lib/api/google";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getGoogleModelName", () => {
  it("maps known catalog IDs to Gemini API model strings", () => {
    expect(getGoogleModelName("google/gemini-2.5-flash")).toBe(
      "gemini-2.5-flash-preview-04-17",
    );
    expect(getGoogleModelName("google/gemini-2.0")).toBe("gemini-2.0-flash");
  });

  it("throws for unknown model IDs", () => {
    expect(() => getGoogleModelName("google/gemini-3-pro")).toThrow(
      "getGoogleModelName",
    );
    expect(() => getGoogleModelName("openai/gpt-4o")).toThrow(
      "getGoogleModelName",
    );
  });
});

describe("streamGoogleCompletion", () => {
  it("throws when GOOGLE_API_KEY is not set", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "");
    const gen = streamGoogleCompletion({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: "hello" }],
    });
    await expect(gen.next()).rejects.toThrow("GOOGLE_API_KEY");
  });

  it("streams text from Gemini SSE events as token events", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "goog-test");

    const encoder = new TextEncoder();
    const events =
      [
        `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "hello " }] } }] })}`,
        `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "world" }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, totalTokenCount: 7 } })}`,
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

    const collected: Array<{ type: string }> = [];
    for await (const event of streamGoogleCompletion({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: "hi" }],
    })) {
      collected.push(event);
    }

    const tokens = collected.filter((e) => e.type === "token");
    const usages = collected.filter((e) => e.type === "usage");

    expect(tokens).toHaveLength(2);
    expect(usages).toHaveLength(1);
  });

  it("throws on non-ok API response", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "goog-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: "API key invalid" } }),
      })),
    );

    const gen = streamGoogleCompletion({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: "hi" }],
    });
    await expect(gen.next()).rejects.toThrow("API key invalid");
  });

  it("separates system messages from user messages in request body", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "goog-test");

    let capturedBody: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options: RequestInit) => {
        capturedBody = JSON.parse(options.body as string);
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: "bad request" } }),
        };
      }),
    );

    const gen = streamGoogleCompletion({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
      ],
    });

    try {
      await gen.next();
    } catch {
      // expected to throw
    }

    expect(capturedBody).toMatchObject({
      system_instruction: { parts: [{ text: "You are helpful." }] },
      contents: [{ role: "user", parts: [{ text: "Hello" }] }],
    });
  });
});
