import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
process.env.SYZIA_044_BASELINE = "1";
const h = await import("./support/current-db.mjs");
delete process.env.SYZIA_044_BASELINE;
const { db, as, rpc, orgs, scalar, randomUUID } = h;
await db.exec("begin");
const x = await h.divided();
await h.completePlan(x);
await as("adminA");
const customer = await rpc("operations_customer", {
  p_org: orgs.A,
  p_data: {
    name: "Upgrade fictício 044",
    whatsapp: "81999990002",
    email: "upgrade@example.invalid",
    accepted_notice: true,
    contact: false,
  },
  p_key: randomUUID(),
});
const { p, s } = await h.setup({ mode: "quote", contract: "evaluation" });
await as("adminA");
const q = await rpc("operations_request", {
  p_org: orgs.A,
  p_customer: customer,
  p_service: s.code,
  p_addons: [],
  p_answers: h.empty(s).answers,
  p_notes: "",
  p_source: "whatsapp",
  p_key: randomUUID(),
});
const start =
  new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10) + "T11:00:00Z";
await as("adminA");
const a = await rpc("operations_schedule", {
  p_org: orgs.A,
  p_request: q.id,
  p_start: start,
  p_duration: 75,
  p_note: "Duração manual histórica",
  p_key: randomUUID(),
});
assert.equal(a.service_minutes, null);
await db.exec("reset role");
const columns = (
  await db.query(
    "select table_schema,table_name,column_name from information_schema.columns where table_schema in('public','private') order by 1,2,ordinal_position",
  )
).rows;
async function snapshot() {
  const out = {};
  for (const table of new Set(
    columns.map((c) => c.table_schema + "." + c.table_name),
  )) {
    const cols = columns
      .filter((c) => c.table_schema + "." + c.table_name === table)
      .map((c) => '"' + c.column_name + '"');
    out[table] = await scalar(
      `select coalesce(jsonb_agg(j order by j::text),'[]')from(select to_jsonb(x)j from(select ${cols.join(",")}from ${table})x)q`,
    );
  }
  return out;
}
const before = await snapshot();
const security = () =>
  scalar(
    "select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relacl,c.relrowsecurity,c.relforcerowsecurity)order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private')and c.relkind='r'",
  );
const priorSecurity = await security();
const migration = await readFile(
  "supabase/migrations/202609260044_approved_audit_corrections.sql",
  "utf8",
);
await db.exec("commit");
await assert.rejects(
  () =>
    db.exec(
      migration.replace(
        "COMMIT;",
        "DO $$$$BEGIN RAISE EXCEPTION 'fixture_044_upgrade_failure';END;$$$$;COMMIT;",
      ),
    ),
  /fixture_044_upgrade_failure/,
);
await db.exec("rollback");
assert.equal(
  await scalar(
    "select count(*)::int from information_schema.columns where table_name='appointments'and column_name='buffer_minutes'",
  ),
  0,
);
assert.deepEqual(await snapshot(), before);
await db.exec(migration);
assert.deepEqual(await snapshot(), before);
assert.deepEqual(await security(), priorSecurity);
await db.exec("begin");
const upgraded = await h.records(x.q);
assert.ok(upgraded.every((a) => a.buffer_minutes === 0));
await as("adminA");
const c = await rpc("consumer_admin_context", { p_org: orgs.A });
await rpc("consumer_schedule_config", {
  p_org: orgs.A,
  p_expected_revision: c.schedule.revision,
  p_rules: {
    active: true,
    lead_minutes: 0,
    horizon_days: 25,
    step_minutes: 30,
    buffer_minutes: 30,
    cancel_minutes: 0,
  },
});
const moved = await rpc("operations_appointment_act", {
  p_org: orgs.A,
  p_id: a.id,
  p_revision: a.revision,
  p_action: "reschedule",
  p_data: { start: new Date(Date.parse(start) + 86400000).toISOString() },
  p_key: randomUUID(),
});
assert.equal(moved.service_minutes, 75);
assert.equal(moved.buffer_minutes, 30);
assert.equal(
  (Date.parse(moved.ends_at) - Date.parse(moved.starts_at)) / 60000,
  105,
);
const result = {
  status: "PASS",
  engine: "PGlite local",
  base: "042 populated → 044",
  tablesCompared: Object.keys(before).length,
  existingColumnsCompared: columns.length,
  securityUnchanged: true,
  allHistoricalRowsUnchanged: true,
  transactionRollbackVerified: true,
  legacyManual: {
    before: { service_minutes: a.service_minutes, occupied: 75 },
    after: {
      service_minutes: moved.service_minutes,
      buffer_minutes: moved.buffer_minutes,
      occupied: 105,
    },
    proof: "exact immutable command payload hash",
  },
};
await writeFile(
  "reports/syzia-044/upgrade.json",
  JSON.stringify(result, null, 2),
);
console.log(result);
await db.close();
