import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/demo-browser",
  outputDir: "test-results-demo",
  timeout: 60000,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/demo-browser-results.json" }],
  ],
  use: {
    locale: "pt-BR",
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    launchOptions: {
      executablePath: process.env.FOUNDATION_CHROMIUM_PATH || undefined,
      args: ["--no-sandbox", "--disable-gpu"],
    },
  },
  webServer: {
    command: "npm run dev:demo",
    env: { DEMO_TEST_MODE: "true" },
    url: "http://127.0.0.1:5173",
    timeout: 90000,
    reuseExistingServer: false,
  },
});
