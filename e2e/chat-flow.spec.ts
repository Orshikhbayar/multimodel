import { expect, test } from "@playwright/test";
import { mockChatSse } from "./helpers";

test("user can send a message and receive streamed output", async ({
  page,
}) => {
  await mockChatSse(page, { token: "stream token" });
  await page.goto("/chat");
  await page.waitForLoadState("networkidle");

  const composer = page.locator("textarea").first();
  await composer.waitFor({ state: "visible", timeout: 30_000 });
  await composer.fill("Explain test strategy");
  await composer.press("Control+Enter");

  await expect(
    page.getByLabel("Your message").getByText("Explain test strategy"),
  ).toBeVisible();
  await expect(
    page.getByText("stream token", { exact: false }).first(),
  ).toBeVisible();
});
