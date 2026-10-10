import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  testMatch: [
    "current-*.temporary.spec.ts",
    "current-session.spec.ts",
    "current-navigation.spec.ts",
    "syzia-044.spec.ts",
  ],
  timeout: 420000,
  retries: 0,
  outputDir: "test-results-current",
  use: { ...demo.use, actionTimeout: 15000, screenshot: "only-on-failure" },
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/syzia-044/browser.json" }],
  ],
});
