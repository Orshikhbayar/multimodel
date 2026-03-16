import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

const TEST_EXCLUDES = [
  "node_modules",
  ".next",
  "dist",
  "e2e/**",
  "playwright.config.ts",
  "test/integration/**",
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
  },
  test: {
    globals: true,
    envFile: ".env.test",
    projects: [
      {
        extends: true,
        test: {
          name: "unit-dom",
          environment: "jsdom",
          setupFiles: ["./test/setup.dom.ts"],
          include: [
            "components/**/*.{test,spec}.{ts,tsx}",
            "lib/hooks/**/*.{test,spec}.{ts,tsx}",
            "lib/i18n/**/*.{test,spec}.{ts,tsx}",
            "lib/stores/**/*.{test,spec}.{ts,tsx}",
            "lib/state/**/*.{test,spec}.{ts,tsx}",
          ],
          exclude: TEST_EXCLUDES,
        },
      },
      {
        extends: true,
        test: {
          name: "unit-node",
          environment: "node",
          setupFiles: ["./test/setup.node.ts"],
          include: [
            "lib/rateLimit.test.ts",
            "lib/logger.test.ts",
            "lib/metrics.test.ts",
            "lib/modelCatalog.test.ts",
            "lib/appUrl.test.ts",
            "lib/api/**/*.{test,spec}.ts",
            "lib/billing/**/*.{test,spec}.ts",
            "lib/supabase/**/*.{test,spec}.ts",
            "lib/actions/**/*.{test,spec}.ts",
            "lib/tools/**/*.{test,spec}.ts",
            "app/api/**/*.test.ts",
            "app/auth/**/*.test.ts",
            "middleware.test.ts",
          ],
          exclude: TEST_EXCLUDES,
        },
      },
      {
        extends: true,
        test: {
          name: "integration-supabase",
          environment: "node",
          setupFiles: ["./test/setup.node.ts"],
          include: ["test/integration/**/*.int.test.ts"],
          exclude: ["node_modules", ".next", "dist"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
