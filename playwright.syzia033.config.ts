import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  use: { ...demo.use, actionTimeout: 15000 },
  testMatch: ["syzia-033.spec.ts", "syzia-033-media.spec.ts"],
  timeout: 120000,
  outputDir: "test-results-syzia033",
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          process.env.SYZIA033_BROWSER_REPORT ||
          "reports/syzia-033/browser.json",
      },
    ],
  ],
});
