import { spawnSync } from "node:child_process";
import { copyFile } from "node:fs/promises";
const env = { ...process.env, VITE_APP_REALM: "demo" };
const r = spawnSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build", "--mode", "demo"],
  { stdio: "inherit", env },
);
if (r.status !== 0) process.exit(r.status || 1);
await copyFile("dist-demo/demo.html", "dist-demo/index.html");
