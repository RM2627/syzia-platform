import { spawnSync } from "node:child_process";
const r = spawnSync(process.execPath, ["scripts/commercial/build-demo.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_SUPABASE_URL: "",
    VITE_SUPABASE_PUBLISHABLE_KEY: "",
    VITE_COMMERCIAL_DEMO_ORIGIN: "http://127.0.0.1:5174",
    VITE_COMMERCIAL_API_URL: "http://127.0.0.1:10000",
  },
});
process.exitCode = r.status ?? 1;
