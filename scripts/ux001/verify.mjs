import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const read = async (p) =>
  JSON.parse(await readFile(`reports/ux001/${p}/measurements.json`, "utf8"));
const before = await read("before"),
  after = await read("after");
const results = [];
for (const width of [1440, 390, 320]) {
  const get = (data, id) => data.results.find((r) => r.id === `${id}-${width}`);
  const b = get(before, "open"),
    a = get(after, "open");
  assert.equal(b.final.companyNav, false);
  assert.equal(a.final.companyNav, true);
  assert.equal(b.final.selectedTab, "Minha fila");
  assert.equal(a.final.selectedTab, "Todos");
  assert.equal(get(before, "switch").extraClicksToRestoreQueue, 1);
  assert.equal(get(after, "switch").extraClicksToRestoreQueue, 0);
  for (const action of ["open", "switch"]) {
    const r = get(after, action);
    assert.equal(
      r.requests.filter((q) => q.path.endsWith("/central_context")).length,
      1,
    );
    assert.equal(
      r.requests.filter((q) => q.path.endsWith("/central_queue")).length,
      0,
    );
    assert.ok(!r.frames.some((f) => f.companyNav === false));
    assert.ok(!r.frames.some((f) => f.statuses?.includes("Carregando…")));
  }
  for (const r of after.results.filter((r) => r.viewport.width === width)) {
    assert.equal(r.status, "RECORDED");
    assert.equal(r.errors.length, 0);
    assert.equal(r.final.overflow, 0);
    assert.ok(r.final.url.includes("/atendimento?ticket="));
  }
  results.push({
    width,
    status: "PASS",
    open: {
      beforeRequests: b.requests.length,
      afterRequests: a.requests.length,
      beforeTab: b.final.selectedTab,
      afterTab: a.final.selectedTab,
      beforeCompanyNav: b.final.companyNav,
      afterCompanyNav: a.final.companyNav,
    },
    clicksForTwoTickets: { before: 3, after: 2 },
  });
}
await writeFile(
  "reports/ux001/comparison-checks.json",
  JSON.stringify(
    {
      status: "PASS",
      engine: { browser: after.browser, latency: after.latency },
      results,
    },
    null,
    2,
  ),
);
console.log(
  "PASS: antes/depois, navegação, fila, consultas, shell e overflow nos três tamanhos",
);
