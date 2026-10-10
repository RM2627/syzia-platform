import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  testMatch: "ux001.spec.ts",
  timeout: 120000,
  retries: 0,
  outputDir: "test-results-ux001",
  reporter: [["list"], ["json", { outputFile: "reports/ux001/browser.json" }]],
  use: {
    ...demo.use,
    actionTimeout: 15000,
    trace: "on",
    screenshot: "only-on-failure",
  },
});
