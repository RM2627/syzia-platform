import { defineConfig } from "@playwright/test";
import demo from "./playwright.demo.config";
export default defineConfig({ ...demo, testMatch: ["syzia-038.spec.ts"], timeout: 90000, outputDir: "test-results-syzia038", reporter: [["list"], ["json", { outputFile: "reports/syzia-038/browser.json" }]] });
