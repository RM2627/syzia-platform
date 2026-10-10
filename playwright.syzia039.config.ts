import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  testMatch: ["syzia-039.spec.ts"],
  timeout: 90000,
  outputDir: "test-results-syzia039",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/syzia-039/browser.json" }],
  ],
});
