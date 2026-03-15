import { expect, test } from "@playwright/test";

test("user can create a project", async ({ page }) => {
  await page.goto("/projects");

  await page.getByRole("button", { name: /new project/i }).click();
  await page.locator("#name").fill("E2E Project");
  await page.locator("#description").fill("Created by playwright test");
  await page.getByRole("button", { name: /^create$/i }).click();

  await expect(page.getByText("E2E Project")).toBeVisible();
});
