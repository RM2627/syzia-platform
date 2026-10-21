import { defineConfig } from "@playwright/test";
import base from "./playwright.commercial055.config";
export default defineConfig({
  ...base,
  use: { ...base.use, actionTimeout: 15000, navigationTimeout: 20000 },
  testMatch: "commercial056.spec.ts",
  outputDir: "test-results-commercial056",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/syzia-056/browser.json" }],
  ],
  webServer: {
    ...base.webServer,
    env: {
      DEMO_TEST_MODE: "true",
      DEMO_MINIMAL: "true",
      DEMO_BILLING_047: "true",
      DEMO_COMMERCIAL_055: "true",
      DEMO_COMMERCIAL_056: "true",
    },
  },
});
