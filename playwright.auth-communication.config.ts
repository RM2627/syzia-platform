import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/auth-communication",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 30000,
  outputDir: "test-results/auth-communication",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/auth-communication/browser.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4185",
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
    command: "npm run dev -- --port 4185",
    url: "http://127.0.0.1:4185",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_contract_test",
      VITE_PLATFORM_API_URL: "http://127.0.0.1:54321",
    },
  },
});
