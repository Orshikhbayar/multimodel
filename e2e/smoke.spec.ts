import { test, expect } from "@playwright/test";

test("app loads and user menu opens", async ({ page }) => {
  await page.goto("/");

  // Sign in if redirected to login
  const emailField = page.getByLabel("Email");
  if (await emailField.isVisible()) {
    await emailField.fill("demo@example.com");
    await page.getByLabel("Password").fill("demo123");
    await page.getByRole("button", { name: /sign in with email/i }).click();
  }

  // Sidebar has a New Chat button in the redesigned layout
  await expect(page.getByRole("button", { name: /new chat/i })).toBeVisible({
    timeout: 15_000,
  });

  // Open user menu
  await page.getByRole("button", { name: /demo user|guest/i }).click();
  await expect(page.getByText("Settings", { exact: true })).toBeVisible();
});
