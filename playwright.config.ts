import { defineConfig } from "@playwright/test";
const executablePath = process.env.FOUNDATION_CHROMIUM_PATH || undefined;
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/browser-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    launchOptions: { executablePath, args: ["--no-sandbox", "--disable-gpu"] },
  },
  webServer: {
    command: "npm run dev -- --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_PLATFORM_API_URL: "http://127.0.0.1:54321",
      VITE_ATTACHMENT_GATEWAY_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_contract_test",
    },
  },
});
