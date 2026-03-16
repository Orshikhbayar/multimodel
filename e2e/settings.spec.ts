import { expect, test } from "@playwright/test";

test("user can open settings drawer", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const settingsButton = page
    .getByRole("button", { name: /open settings/i })
    .first();
  await settingsButton.waitFor({ state: "visible", timeout: 30_000 });
  await settingsButton.click();

  await expect(page.getByText(/workspace settings/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /^ai team$/i })).toBeVisible();
});
