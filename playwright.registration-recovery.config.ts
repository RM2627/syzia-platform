import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/registration-recovery",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 30000,
  outputDir: "test-results/registration-recovery",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/registration-recovery/browser.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4190",
    headless: true,
    launchOptions: {
      executablePath: process.env.FOUNDATION_CHROMIUM_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4190 --strictPort",
    url: "http://127.0.0.1:4190",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_contract_test",
      VITE_PLATFORM_API_URL: "http://127.0.0.1:54321",
      VITE_COMMERCIAL_API_URL: "http://127.0.0.1:54321",
    },
  },
});
