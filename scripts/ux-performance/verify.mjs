import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const read = async (f) =>
  JSON.parse(
    await readFile(`reports/ux-performance/${f}/measurements.json`, "utf8"),
  ).results;
const before = await read("before"),
  after = await read("after"),
  oldActions = await read("before-actions"),
  actions = await read("after-actions"),
  guards = await read("after-guards");
const get = (rs, id) => {
  const r = rs.find((r) => r.id === id);
  assert.ok(r, `Missing ${id}`);
  return r;
};
const rpc = (r, name) => r.requests.filter((x) => x.path.endsWith("/" + name));
const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push({ name, status: "PASS" });
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
  }
};
check("Shell remains visible throughout cold Super Admin company entry", () => {
  const b = get(before, "root-open-cold"),
    a = get(after, "root-open-cold");
  assert.ok(
    b.frames.some(
      (f) => f.shell === false && f.statuses?.includes("Carregando…"),
    ),
  );
  assert.equal(
    a.frames.some((f) => f.shell === false),
    false,
  );
  assert.ok(a.final.headings.includes("O que fazer hoje?"));
});
check("Onboarding is requested once in production, down from twice", () => {
  assert.equal(
    rpc(get(before, "root-open-cold"), "onboarding_context").length,
    2,
  );
  assert.equal(
    rpc(get(after, "root-open-cold"), "onboarding_context").length,
    1,
  );
});
for (const width of [1440, 390]) {
  check(
    `Same-company configuration navigation reuses the context (${width})`,
    () => {
      for (const section of [
        "servicos",
        "manual",
        "faq",
        "respostas",
        "regras",
      ])
        assert.equal(
          rpc(get(after, `route-${section}-${width}`), "company_context")
            .length,
          0,
        );
    },
  );
  check(`Subscription loads capabilities once (${width})`, () =>
    assert.equal(
      rpc(get(after, `route-assinatura-${width}`), "billing_capabilities")
        .length,
      1,
    ),
  );
  check(
    `Simultaneous image consumers share an authorized download (${width})`,
    () => {
      const images = get(after, `route-pagina-${width}`).requests.filter((r) =>
        r.path.startsWith("/company-media/"),
      );
      assert.ok(images.length > 0);
      assert.equal(new Set(images.map((r) => r.path)).size, images.length);
    },
  );
  check(
    `Sending updates ticket and queue concurrently after the command (${width})`,
    () => {
      const r = get(actions, `send-message-${width}`),
        ctx = rpc(r, "central_context")[0],
        queue = rpc(r, "central_queue")[0],
        command = rpc(r, "central_act")[0];
      assert.equal(command.status, 200);
      assert.ok(ctx.t >= command.end - 5);
      assert.ok(queue.t < ctx.end);
      assert.equal(r.final.alerts.length, 0);
    },
  );
  check(
    `Preview media requests run concurrently, capped at four (${width})`,
    () => {
      const r = get(actions, `page-preview-${width}`),
        images = r.requests.filter((x) => x.path.startsWith("/company-media/"));
      assert.equal(images.length, 4);
      assert.ok(
        Math.max(...images.map((x) => x.t)) <
          Math.min(...images.map((x) => x.end)),
      );
      assert.equal(r.final.alerts.length, 0);
    },
  );
}
check(
  "Focused guards: local failure/retry, fresh save, double-click and narrow layouts",
  () => {
    assert.equal(guards.length, 13);
    for (const r of guards) {
      assert.equal(r.status, "RECORDED", r.id);
      assert.equal(r.errors.length, 0, r.id);
      assert.equal(r.final.overflow, 0, r.id);
    }
    assert.equal(
      get(guards, "open-double-click").requests.filter(
        (r) => r.path === "/access/context",
      ).length,
      1,
    );
    assert.equal(
      rpc(get(guards, "configuration-reuse"), "company_context").length,
      0,
    );
  },
);
check("Measured layouts have no horizontal document overflow", () => {
  for (const r of [...before, ...after, ...actions])
    if (r.final) assert.equal(r.final.overflow, 0, r.id);
});
await writeFile(
  "reports/ux-performance/comparison-checks.json",
  JSON.stringify(
    {
      status: results.every((r) => r.status === "PASS") ? "PASS" : "FAIL",
      results,
    },
    null,
    2,
  ),
);
for (const r of results) console.log(r.status, r.name, r.error || "");
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
