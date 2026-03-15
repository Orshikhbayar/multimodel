import { expect, test } from "@playwright/test";

test("user menu opens and language dialog can be shown", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /demo user|guest/i }).click();
  await expect(page.getByText(/settings/i)).toBeVisible();

  await page.getByRole("menuitem", { name: /language/i }).click();
  await expect(page.getByText(/select your display language/i)).toBeVisible();
});
