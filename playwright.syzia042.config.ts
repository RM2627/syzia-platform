import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  testMatch: ["syzia-042.spec.ts"],
  timeout: 90000,
  use: { ...demo.use, actionTimeout: 15000 },
  outputDir: "test-results-syzia042",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/syzia-042/browser.json" }],
  ],
});
