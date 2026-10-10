import {
  h,
  db,
  as,
  scalar,
  orgs,
  users,
  assert,
  randomUUID,
  upgrade,
  rpc,
  quota,
  act,
  weekly,
} from "./support/flexible-db.mjs";
import { writeFile, mkdir } from "node:fs/promises";
await db.exec("begin");
await as("root");
let d = await rpc("assisted_admin_context");
await rpc("assisted_policy_save", {
  p_revision: d.policy.revision,
  p_active: true,
  p_hours: weekly(),
  p_timezone: "America/Recife",
  p_message: "Mensagem programada preservada da 045.",
});
await quota();
await act(h.legacy.codes.A, "claim");
await as("adminA");
await rpc("employee_availability_save", {
  p_org: orgs.A,
  p_user: users.worker,
  p_revision: 0,
  p_inherit: true,
  p_hours: [],
  p_blocks: [{ date: "2027-01-02", all_day: true }],
});
const { p, s } = await h.setup({ duration: 45 });
const q = await h.draft(p, [h.empty(s)]);
await h.complete(q, (await h.slots(p, [h.empty(s)]))[0]);
const a = (await h.records(q))[0];
await as("adminA");
await rpc("operations_assign_responsible", {
  p_org: orgs.A,
  p_id: a.id,
  p_user: users.worker,
  p_revision: a.revision,
  p_key: randomUUID(),
});
await db.exec("commit;reset role");
const tables = (
  await db.query(
    "select table_schema,table_name,string_agg(quote_ident(column_name),','order by ordinal_position) cols from information_schema.columns where table_schema in('public','private') group by 1,2 order by 1,2",
  )
).rows;
async function snapshot() {
  const r = {};
  for (const t of tables)
    r[t.table_schema + "." + t.table_name] = await scalar(
      `select coalesce(jsonb_agg(r order by r::text),'[]') from(select to_jsonb(x)r from(select ${t.cols} from ${t.table_schema}.${t.table_name})x)z`,
    );
  return r;
}
const names = [
  "assisted_consume",
  "assisted_plan_save",
  "assisted_cycle_start",
  "employee_available",
  "employee_availability_save",
  "appointment_availability_guard",
  "operations_assign_responsible",
  "execution_plan",
  "execution_validate_plan",
  "central_book_core",
];
async function functions() {
  return (
    await db.query(
      "select n.nspname||'.'||p.proname name,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname=any($1)order by 1",
      [names],
    )
  ).rows;
}
const before = await snapshot(),
  beforeFunctions = await functions();
await upgrade();
const after = await snapshot();
for (const [k, rows] of Object.entries(before)) {
  if (["public.audit_logs", "private.assisted_policy_history"].includes(k))
    for (const r of rows)
      assert.ok(
        after[k].some((x) => JSON.stringify(x) === JSON.stringify(r)),
        k + " old audit record preserved",
      );
  else assert.deepEqual(after[k], rows, k);
}
assert.deepEqual(await functions(), beforeFunctions);
assert.equal(
  await scalar("select availability_mode from private.assisted_policy"),
  "scheduled",
);
assert.equal(
  await scalar("select count(*) from private.assisted_consumption"),
  1,
);
assert.equal(
  await scalar("select responsible_id from appointments where id=$1", [a.id]),
  users.worker,
);
const result = {
  status: "PASS",
  engine: "Local PGlite; populated 045 → 046",
  tablesPreserved: tables.length,
  oldRowsAndColumnsPreserved: true,
  auditAppendsOnly: ["public.audit_logs", "private.assisted_policy_history"],
  configuredPolicyMode: "scheduled",
  existingGridTimezoneMessageActiveRevisionPreserved: true,
  employeeAndAgendaFunctionsUnchanged: true,
  quotaCycleConsumptionFunctionsUnchanged: true,
  functionsCompared: beforeFunctions.map((f) => f.name),
};
await mkdir("reports/flexible-support", { recursive: true });
await writeFile(
  "reports/flexible-support/upgrade.json",
  JSON.stringify(result, null, 2),
);
console.log(
  "PASS populated 045 → 046;",
  tables.length,
  "tables; only mode column and append-only migration audit",
);
await db.close();
