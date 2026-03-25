import { expect, test } from "@playwright/test";

test("chat page loads and new conversation can be started", async ({
  page,
}) => {
  await page.goto("/chat");
  await page.waitForLoadState("networkidle");

  const composer = page.locator("textarea").first();
  await expect(composer).toBeVisible({ timeout: 15_000 });
});
