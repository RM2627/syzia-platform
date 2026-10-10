import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({
  ...demo,
  testMatch: "team-availability.spec.ts",
  timeout: 120000,
  retries: 0,
  outputDir: "test-results-team-availability",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/team-availability/browser.json" }],
  ],
  use: { ...demo.use, trace: "on", screenshot: "only-on-failure" },
});
