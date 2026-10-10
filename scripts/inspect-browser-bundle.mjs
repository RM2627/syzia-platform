// Local build with a fictitious server-only marker; never supply a real secret.
import { spawnSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const reportPrefix = process.env.BUNDLE_REPORT_PREFIX || "reports/phase-8";
const marker = "phase8_server_secret_canary_not_a_credential";
const result = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  { encoding: "utf8" },
);
assert.equal(result.status, 0, result.stdout + result.stderr);
const build = spawnSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build"],
  {
    env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: marker, MERCADO_PAGO_ACCESS_TOKEN: marker, MERCADO_PAGO_WEBHOOK_SECRET: marker },
    encoding: "utf8",
  },
);
await writeFile(
  reportPrefix + "-build.txt",
  result.stdout + result.stderr + build.stdout + build.stderr,
);
assert.equal(
  build.status,
  0,
  "Build failed; inspect reports/phase-8-build.txt",
);
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = dir + "/" + entry.name;
    if (entry.isDirectory()) await walk(path);
    else {
      const bytes = await readFile(path);
      assert.ok(!bytes.includes(marker), "Server marker leaked: " + path);
      assert.ok(
        !bytes.includes("SUPABASE_SERVICE_ROLE_KEY"),
        "Server variable leaked: " + path,
      );
      assert.ok(!bytes.includes("MERCADO_PAGO_ACCESS_TOKEN"), "Billing secret variable leaked: " + path);
      assert.ok(!bytes.includes("MERCADO_PAGO_WEBHOOK_SECRET"), "Webhook secret variable leaked: " + path);
      files.push({
        path,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
}
await walk("dist");
await writeFile(
  reportPrefix + "-bundle-scan.json",
  JSON.stringify(
    {
      environment:
        "LOCAL; build com marcador fictício em variável exclusiva do servidor",
      build_exit_code: 0,
      server_secret_canary_found: false,
      server_secret_variable_found: false,
      files,
      scope:
        "Build local; nenhuma credencial real. Revisar configurações do futuro host separadamente.",
    },
    null,
    2,
  ),
);
console.log("Typecheck, build e ausência do marcador server-only: PASS");
