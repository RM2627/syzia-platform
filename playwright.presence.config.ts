import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  testMatch: "presence-correction.spec.ts",
  timeout: 120000,
  outputDir: "test-results-presence",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/presence-correction/browser.json" }],
  ],
});
