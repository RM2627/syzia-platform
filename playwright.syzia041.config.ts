import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  testMatch: ["syzia-041.spec.ts"],
  timeout: 75000,
  use: { ...demo.use, actionTimeout: 15000 },
  outputDir: "test-results-syzia041",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/syzia-041/browser.json" }],
  ],
});
