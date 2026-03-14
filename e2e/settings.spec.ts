import { expect, test } from "@playwright/test";

test("user can open settings drawer", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /open settings/i }).first().click();

  await expect(page.getByText(/workspace settings/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /^ai team$/i })).toBeVisible();
});
