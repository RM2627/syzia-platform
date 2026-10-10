import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
test("A4-37 Testes e migrations históricos preservados; resultados históricos externos ao pacote limpo", async () => {
  const baseline = JSON.parse(
    await readFile("docs/testing/preserved-042-sha256.json", "utf8"),
  );
  assert.ok(Object.keys(baseline).length > 500);
  // 047 cleanup: raw reports remain in the already delivered historical archives.
  // Preserve the complete baseline manifest; enforce every original test/migration hash.
  const inputs = Object.entries(baseline).filter(([p]) => !p.startsWith("reports/"));
  assert.equal(inputs.length, 165);
  for (const [p, hash] of inputs)
    assert.equal(
      createHash("sha256")
        .update(await readFile(p))
        .digest("hex"),
      hash,
      p,
    );
});
test("A4-35 Falha controlada do runner oficial retorna não-zero e relatório FAIL", async () => {
  const r = spawnSync(
    process.execPath,
    ["scripts/syzia-044/current-gate.mjs", "--inject-failure"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 1);
  const report = JSON.parse(
    await readFile("reports/syzia-044/gate-controlled-failure.json", "utf8"),
  );
  assert.equal(report.status, "FAIL");
  assert.equal(report.steps[0].exitCode, 42);
});
test("A4-36/38/39 Cada falha histórica tem decisão e cobertura atual explícita", async () => {
  const map = JSON.parse(
    await readFile("docs/testing/history-current-map.json", "utf8"),
  );
  assert.equal(map.length, 108);
  for (const r of map) {
    assert.ok(
      r.id && r.reason && r.decision && r.currentCoverage?.length,
      r.id,
    );
    for (const ref of r.currentCoverage) await access(ref.file);
  }
  const doc = await readFile("docs/testing/current-regression-gate.md", "utf8");
  assert.match(doc, /test:current-gate/);
  assert.match(doc, /PENDENTE/);
});
