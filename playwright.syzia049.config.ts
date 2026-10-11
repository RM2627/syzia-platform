import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  testMatch: "syzia-049.spec.ts",
  timeout: 120000,
  retries: 0,
  outputDir: "test-results-049",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/syzia-049/browser.json" }],
  ],
  use: {
    ...demo.use,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    ...demo.webServer,
    env: { DEMO_TEST_MODE: "true", DEMO_MINIMAL: "true" },
  },
});
