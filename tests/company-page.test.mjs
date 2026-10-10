import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
const { db, as, rpc, orgs, manuals } = await consumerDB();
const results = [];
async function denied(fn) {
  await db.exec("savepoint rejected");
  try {
    await fn();
  } catch (e) {
    await db.exec("rollback to savepoint rejected");
    assert.equal(e.code, "42501");
    return;
  }
  throw Error("Expected authorization denial");
}
async function test(name, fn) {
  await db.exec("begin");
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS " + name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.error(e);
  } finally {
    await db.exec("rollback;reset role");
  }
}
for (const actor of ["worker", "agentA", "adminB", "alice"])
  await test(
    actor + " não administra/pública página de A por chamada direta",
    async () => {
      if (actor === "worker")
        await db.query(
          "update organization_members set is_attendant=true where user_id=$1",
          [users.worker],
        );
      await as(actor);
      for (const fn of ["consumer_presence_context", "consumer_admin_context"])
        await denied(() => rpc(fn, { p_org: orgs.A }));
      await denied(() =>
        rpc("consumer_portfolio_save", {
          p_org: orgs.A,
          p_code: null,
          p_data: {},
        }),
      );
      await denied(() =>
        rpc("consumer_branding_save", {
          p_org: orgs.A,
          p_revision: 0,
          p_data: {},
        }),
      );
      await denied(() =>
        rpc("consumer_publish_page", {
          p_org: orgs.A,
          p_manual: manuals.A,
          p_enabled: true,
          p_show_prices: true,
          p_expected_revision: 1,
        }),
      );
      await denied(() =>
        rpc("consumer_set_page_enabled", {
          p_org: orgs.A,
          p_enabled: false,
          p_expected_revision: 1,
        }),
      );
    },
  );
await test("Revogação impede edição/publicação com identidade de sessão anterior", async () => {
  await as("adminA");
  await rpc("consumer_presence_context", { p_org: orgs.A });
  await db.exec("reset role");
  await db.query(
    "update organization_members set status='suspended' where user_id=$1 and organization_id=$2",
    [users.adminA, orgs.A],
  );
  await as("adminA");
  await denied(() => rpc("consumer_presence_context", { p_org: orgs.A }));
  await denied(() =>
    rpc("consumer_set_page_enabled", {
      p_org: orgs.A,
      p_enabled: false,
      p_expected_revision: 1,
    }),
  );
});
await test("Projeção pública não contém identificadores e conteúdos administrativos", async () => {
  await as("anon");
  const p = await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" });
  assert.ok(p);
  const text = JSON.stringify(p);
  for (const forbidden of [
    "organization_id",
    "manual_sections",
    "autonomy",
    "internal_note",
    "customer_id",
    orgs.A,
    orgs.B,
    manuals.A,
  ])
    assert.ok(!text.includes(forbidden), forbidden);
  await denied(() => rpc("consumer_presence_context", { p_org: orgs.A }));
});
await writeFile(
  "reports/company-page-sql.json",
  JSON.stringify(
    {
      environment: "LOCAL PGlite",
      tests: results,
      passed: results.filter((x) => x.status === "PASS").length,
      failed: results.filter((x) => x.status === "FAIL").length,
    },
    null,
    2,
  ),
);
await db.close();
if (results.some((x) => x.status === "FAIL")) process.exitCode = 1;
