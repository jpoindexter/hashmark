import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  use: {
    baseURL: "http://localhost:3200",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start the studio server before running tests
  webServer: {
    command: "npm run build:hono && HASHMARK_NO_OPEN=1 node dist/bin.js",
    url: "http://localhost:3200/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
