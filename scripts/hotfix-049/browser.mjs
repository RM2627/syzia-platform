import { copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { prepareGateBrowser } from "../billing-047/browser-runtime.mjs";
await prepareGateBrowser();
const child = spawn(
  process.execPath,
  [
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config=playwright.hotfix049.config.ts",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: process.env },
);
child.on("error", () => {
  process.exitCode = 1;
});
child.on("exit", async (code) => {
  process.exitCode = code ?? 1;
  if (code === 0 && process.env.HOTFIX_CAPTURE_PREVIEWS === "1") {
    try {
      for (const id of ["home", "atendimento", "orcamentos", "agenda"])
        await copyFile(
          `reports/hotfix-049/produto-${id}.webp`,
          `public/marketing/produto-${id}.webp`,
        );
    } catch {
      process.exitCode = 1;
      console.error("Falha ao atualizar as prévias locais.");
    }
  }
});
