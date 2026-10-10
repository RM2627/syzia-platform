import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  testMatch: ["syzia-037.spec.ts"],
  timeout: 90000,
  outputDir: "test-results-syzia037",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/syzia-037/browser.json" }],
  ],
});
