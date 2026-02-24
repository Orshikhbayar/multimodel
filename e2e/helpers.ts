import type { Page } from "@playwright/test";

export async function mockChatSse(
  page: Page,
  options: { token?: string; elapsedMs?: number } = {},
) {
  const token = options.token ?? "hello from e2e";
  const elapsedMs = options.elapsedMs ?? 42;

  await page.route("**/api/chat", async (route) => {
    const body = [
      `data: ${JSON.stringify({ token, requestId: "e2e-request" })}\n\n`,
      `data: ${JSON.stringify({
        done: true,
        requestId: "e2e-request",
        elapsedMs,
        usage: {
          promptTokens: 12,
          completionTokens: 8,
          totalTokens: 20,
        },
        costUsd: 0.001,
      })}\n\n`,
      "data: [DONE]\n\n",
    ].join("");

    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Request-Id": "e2e-request",
      },
      body,
    });
  });
}
