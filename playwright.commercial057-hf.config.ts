import { defineConfig } from "@playwright/test";
import base from "./playwright.commercial057.config";

export default defineConfig({
  ...base,
  testMatch: "commercial057-hf-convites.spec.ts",
  outputDir: "test-results-commercial057-hf",
  reporter: [["list"]],
});
