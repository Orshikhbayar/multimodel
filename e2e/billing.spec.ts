import { expect, test } from "@playwright/test";

test("billing page renders usage and invoices sections", async ({ page }) => {
  await page.goto("/account/billing");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { name: /billing/i }).first(),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /^usage$/i })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^invoices$/i }),
  ).toBeVisible();
});
