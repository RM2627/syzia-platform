import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  testDir: "./tests/ux-modernization",
  testMatch: "*.spec.ts",
  outputDir: "test-results-ux-modernization",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/ux-modernization/browser.json" }],
  ],
  timeout: 90000,
});
