import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  testMatch: "flexible-support.spec.ts",
  timeout: 120000,
  retries: 0,
  outputDir: "test-results-flexible-support",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/flexible-support/browser.json" }],
  ],
  use: { ...demo.use, trace: "on", screenshot: "only-on-failure" },
});
