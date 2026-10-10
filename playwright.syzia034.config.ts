import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  webServer: {
    ...(demo.webServer as any),
    reuseExistingServer: process.env.SYZIA034_REUSE_DEMO === "true",
  },
  use: { ...demo.use, actionTimeout: 15000 },
  testMatch: ["syzia-034*.spec.ts"],
  timeout: 120000,
  outputDir: "test-results-syzia034",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/syzia-034/browser.json" }],
  ],
});
