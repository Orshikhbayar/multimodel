import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
const webServerHost = process.env.PLAYWRIGHT_WEB_SERVER_HOST || "127.0.0.1";
const webServerPort = Number.parseInt(
  process.env.PLAYWRIGHT_WEB_SERVER_PORT || "3000",
  10,
);
const resolvedBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL || `http://${webServerHost}:${webServerPort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: isCI ? 60_000 : 30_000,
  retries: isCI ? 2 : 1,
  workers: isCI ? 1 : undefined,
  reporter: isCI
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : [["list"], ["html", { open: "never" }]],

  expect: {
    timeout: isCI ? 15_000 : 5_000,
  },

  use: {
    baseURL: resolvedBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    navigationTimeout: isCI ? 60_000 : 30_000,
    actionTimeout: isCI ? 30_000 : 15_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: isCI
      ? `npm run start -- --hostname ${webServerHost} --port ${webServerPort}`
      : `npm run dev -- --hostname ${webServerHost} --port ${webServerPort}`,
    url: resolvedBaseUrl,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      E2E_AUTH_BYPASS: process.env.E2E_AUTH_BYPASS || "true",
      NEXT_PUBLIC_E2E_BYPASS: process.env.NEXT_PUBLIC_E2E_BYPASS || "true",
      NEXT_PUBLIC_DISABLE_SERVER_BILLING:
        process.env.NEXT_PUBLIC_DISABLE_SERVER_BILLING || "true",
      AUTH_SECRET: "e2e-test-secret",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || "sk-test",
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        "sb_publishable_test",
    },
  },
});
