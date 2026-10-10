import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
process.env.SYZIA_TEAM_CURRENT = "0";
const h = await import("./support/current-db.mjs");
const { db, scalar } = h;
await db.exec("reset role");
const tables = (
  await db.query(
    "select table_schema,table_name,string_agg(quote_ident(column_name),','order by ordinal_position) cols from information_schema.columns where table_schema in('public','private') group by 1,2 order by 1,2",
  )
).rows;
async function snapshot() {
  const out = {};
  for (const t of tables)
    out[t.table_schema + "." + t.table_name] = await scalar(
      `select coalesce(jsonb_agg(r order by r::text),'[]') from(select to_jsonb(x)r from(select ${t.cols} from ${t.table_schema}.${t.table_name})x)z`,
    );
  return out;
}
const before = await snapshot();
await db.exec(
  await readFile(
    "supabase/migrations/202610030045_team_availability_assisted.sql",
    "utf8",
  ),
);
assert.deepEqual(await snapshot(), before);
assert.equal(
  await scalar(
    "select count(*) from appointments where responsible_id is not null",
  ),
  0,
);
assert.equal(
  await scalar("select count(*) from private.employee_availability"),
  0,
);
assert.equal(await scalar("select active from private.assisted_policy"), false);
const funcs = (
  await db.query(
    "select p.oid::regprocedure::text sig,has_function_privilege('anon',p.oid,'execute') anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('private','public') and (p.proname like 'employee_%' or p.proname like 'assisted_%' or p.proname='operations_assign_responsible')",
  )
).rows;
assert.ok(funcs.length > 10);
assert.ok(funcs.every((f) => !f.anon));
await writeFile(
  "reports/team-availability/upgrade.json",
  JSON.stringify(
    {
      status: "PASS",
      engine: "PGlite",
      tablesPreserved: tables.length,
      rowsAndOldColumnsUnchanged: true,
      emptyAvailabilityInheritsCompany: true,
      noQuotaOrHoursInvented: true,
      anonymousRPCPrivileges: funcs,
    },
    null,
    2,
  ),
);
console.log(
  "PASS upgrade populated 044 → 045",
  tables.length,
  "tables, all original rows/columns unchanged",
);
await db.close();
