import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  testMatch: ["syzia-040.spec.ts"],
  timeout: 60000,
  use: {...demo.use,actionTimeout:15000},
  outputDir: "test-results-syzia040",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/syzia-040/browser.json" }],
  ],
});
