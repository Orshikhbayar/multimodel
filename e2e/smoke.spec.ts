import { test, expect } from "@playwright/test";

test("app loads and user menu opens", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Chat", { exact: true })).toBeVisible();

  // Open user menu
  await page.getByRole("button", { name: /demo user|guest/i }).click();
  await expect(page.getByText("Settings", { exact: true })).toBeVisible();
});
