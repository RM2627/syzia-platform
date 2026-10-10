import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const secretJWT = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
const tests = [];
for (const [name, extra] of [
  [
    "secret key",
    { VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_test_should_never_bundle" },
  ],
  ["service_role JWT", { VITE_SUPABASE_PUBLISHABLE_KEY: secretJWT }],
  ["privileged VITE variable", { VITE_SERVICE_ROLE_KEY: "never-bundle" }],
]) {
  const r = spawnSync(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "build"],
    { env: { ...process.env, ...extra }, encoding: "utf8" },
  );
  assert.notEqual(r.status, 0, `${name} unexpectedly built`);
  assert.match(r.stderr + r.stdout, /privileged|publishable|Privileged/);
  tests.push({ name, status: "PASS" });
}
await writeFile(
  "reports/config-security-results.json",
  JSON.stringify({ tests, passed: tests.length, failed: 0 }, null, 2),
);
console.log("3 configuration safety tests passed.");
