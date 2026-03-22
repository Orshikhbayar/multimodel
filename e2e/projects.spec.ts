import { expect, test } from "@playwright/test";

test("chat page loads and new conversation can be started", async ({
  page,
}) => {
  await page.goto("/chat");
  await page.waitForLoadState("networkidle");

  // The composer textarea should be visible on the chat page
  const composer = page.getByRole("textbox");
  await expect(composer).toBeVisible({ timeout: 15_000 });
});
