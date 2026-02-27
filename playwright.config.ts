import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:5000";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 1,
  workers: 1,
  grepInvert: /@manual/,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results/playwright",
  use: {
    baseURL,
    headless: true,
    trace: "on",
    video: "on",
    screenshot: "off",
    recordHar: {
      path: "test-results/network/demo-hi-and-dashboard.har",
      mode: "full",
    },
  },
  webServer: {
    command: "npm run e2e:web",
    url: `${baseURL}/api/health`,
    timeout: 120_000,
    reuseExistingServer: true,
  },
  projects: [
    { name: "default", testMatch: "**/*.spec.ts", testIgnore: ["**/chat-reliability.spec.ts"] },
    {
      name: "chat-reliability",
      testMatch: "**/chat-reliability.spec.ts",
      use: { baseURL },
      webServer: {
        command: "npm run e2e:web:drop",
        url: `${baseURL}/api/health`,
        timeout: 120_000,
        reuseExistingServer: true,
      },
    },
  ],
});
