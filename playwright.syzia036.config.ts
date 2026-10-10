import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  use: { ...demo.use, actionTimeout: 15000 },
  testMatch: ["syzia-036*.spec.ts"],
  timeout: 120000,
  outputDir: "test-results-syzia036",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/syzia-036/browser.json" }],
  ],
});
