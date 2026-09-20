import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    ...(!process.env.E2E_BASE_URL
      ? [
          {
            command: "node node_modules/vite/bin/vite.js",
            url: "http://127.0.0.1:5174",
            reuseExistingServer: !process.env.CI,
          },
        ]
      : []),
    ...(process.env.TEST_DATABASE_URL
      ? [
          {
            command: "node node_modules/tsx/dist/cli.mjs scripts/e2e-server.ts",
            url: "http://127.0.0.1:8082/api/health",
            reuseExistingServer: false,
          },
        ]
      : []),
  ],
});
