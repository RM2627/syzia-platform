import { spawn } from "node:child_process";
import { prepareGateBrowser } from "../billing-047/browser-runtime.mjs";
await prepareGateBrowser();
const child = spawn(
  process.execPath,
  [
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config=playwright.syzia049.config.ts",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: process.env },
);
child.on("error", () => {
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
