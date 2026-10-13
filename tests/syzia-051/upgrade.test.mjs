import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fixture } from "../billing-047/fixture.mjs";
const c = await fixture({ checkoutDiagnostics: false });
test.after(() => c.db.close());
const migration = await readFile(
  "supabase/migrations/202610130051_checkout_diagnostics.sql",
  "utf8",
);
const tables = [
  "private.billing047_contracts",
  "private.billing047_trial_reservations",
  "private.billing047_audit",
  "private.legal_acceptances",
  "public.legal_documents",
];
async function snapshot() {
  await c.db.exec("reset role");
  const result = {};
  for (const t of tables)
    result[t] = (
      await c.db.query(
        `select to_jsonb(t) row from ${t} t order by to_jsonb(t)::text`,
      )
    ).rows.map((r) => {
      if (t.includes("contracts")) {
        delete r.row.provider_http_status;
        delete r.row.provider_error_stage;
      }
      return r.row;
    });
  return result;
}
let before, id;
test("051-M populated upgrade failure rolls back columns, function rename and all historical records", async () => {
  id = await c.asUser("adminA", "billing047_prepare", {
    p_org: c.orgs.A,
    p_action: "checkout",
    p_version: c.versions.profissional,
    p_key: randomUUID(),
    p_trial: true,
  });
  before = await snapshot();
  await assert.rejects(
    c.db.exec(migration.replace("commit;", "select 1/0;commit;")),
    /division by zero/,
  );
  await c.db.exec("rollback");
  assert.deepEqual(await snapshot(), before);
  assert.equal(
    await c.scalar(
      "select to_regprocedure('public.billing051_failure(uuid,uuid,text,integer,text)')",
    ),
    null,
  );
  assert.equal(
    await c.scalar(
      "select to_regprocedure('public.billing047_context_050(uuid)')",
    ),
    null,
  );
});
test("051-M upgrade preserves rows, trial reservations, legal versions/acceptances and FORCE RLS", async () => {
  await c.db.exec(migration);
  assert.deepEqual(await snapshot(), before);
  for (const t of tables) {
    const r = (
      await c.db.query(
        "select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass",
        [t],
      )
    ).rows[0];
    assert.equal(r.relrowsecurity, true);
    assert.equal(r.relforcerowsecurity, true);
  }
  const view = await c.view();
  assert.equal(view.subscription.id, id);
  assert.equal(view.subscription.checkout_trial, true);
  assert.equal(view.subscription.checkout_retryable, true);
  await assert.rejects(
    c.asUser("adminA", "billing047_context_050", { p_org: c.orgs.A }),
    /permission denied/,
  );
});
test("051-M repeat upgrade fails transactionally without silent replacement", async () => {
  const current = await snapshot();
  await assert.rejects(c.db.exec(migration), /already exists/);
  await c.db.exec("rollback");
  assert.deepEqual(await snapshot(), current);
});
