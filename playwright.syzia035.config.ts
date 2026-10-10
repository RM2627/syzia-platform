import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  use: { ...demo.use, actionTimeout: 15000 },
  testMatch: [
    "syzia-035*.spec.ts",
    "syzia-034-access.spec.ts",
    "syzia-034-media.spec.ts",
  ],
  timeout: 120000,
  outputDir: "test-results-syzia035",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/syzia-035/browser.json" }],
  ],
});
