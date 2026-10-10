import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({ ...demo, testMatch: "billing047.spec.ts", timeout: 90000, retries: 0, outputDir: "test-results-billing047",
  reporter: [["list"], ["json", { outputFile: "reports/billing-047/browser.json" }]],
  use: { ...demo.use, trace: "on", screenshot: "only-on-failure" },
  webServer: { ...demo.webServer, command: "npm run dev:demo", env: { DEMO_TEST_MODE: "true", DEMO_MINIMAL: "true", DEMO_BILLING_047: "true", DEMO_BILLING_047_REJECT_FIRST: "true" } },
});
