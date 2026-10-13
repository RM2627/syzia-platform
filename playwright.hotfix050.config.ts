import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  testMatch: "hotfix-050.spec.ts",
  outputDir: "test-results-hotfix-050",
  reporter: [["list"], ["json", { outputFile: "reports/hotfix-050/browser.json" }]],
  use: { ...demo.use, trace: "off", screenshot: "off" },
  webServer: { ...demo.webServer, env: { DEMO_TEST_MODE: "true", DEMO_MINIMAL: "true", DEMO_BILLING_047: "true" } },
});
