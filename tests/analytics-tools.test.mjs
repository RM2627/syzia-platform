import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("Analytics externo exige modo explícito antes de conexão", () => {
  const r = spawnSync(
    process.execPath,
    ["scripts/homologation/analytics-http.mjs"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Nenhuma conexão aberta/);
});
test("Analytics externo recusa configuração ausente", () => {
  const r = spawnSync(
    process.execPath,
    [process.cwd() + "/scripts/homologation/analytics-http.mjs", "--read-only"],
    { cwd: "/tmp", encoding: "utf8" },
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Nenhuma conexão aberta/);
});
