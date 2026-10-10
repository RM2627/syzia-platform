import { consumerDB } from "../../tests/support/consumer-db.mjs";
import { mkdir, writeFile } from "node:fs/promises";
const c = await consumerDB({
  through: "202609260041_self_service_journeys.sql",
});
await mkdir("reports/syzia-042/baseline-functions", { recursive: true });
const rows = (
  await c.db.query(
    "select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('private','public') and p.prokind='f' and p.prolang in(select oid from pg_language where lanname in('sql','plpgsql'))",
  )
).rows;
for (const r of rows)
  await writeFile(
    "reports/syzia-042/baseline-functions/" +
      r.nspname +
      "." +
      r.proname +
      ".sql",
    r.definition,
  );
await writeFile(
  "reports/syzia-042/baseline-catalog.json",
  JSON.stringify(
    (
      await c.db.query(
        "select * from private.permission_catalog order by action",
      )
    ).rows,
    null,
    2,
  ),
);
await writeFile(
  "reports/syzia-042/baseline-columns.json",
  JSON.stringify(
    (
      await c.db.query(
        "select table_schema,table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema in('private','public') order by table_schema,table_name,ordinal_position",
      )
    ).rows,
    null,
    2,
  ),
);
console.log("041 loaded:", rows.length, "functions");
console.log(
  "trial policy",
  (await c.db.query("select * from private.trial_policy")).rows,
);
await c.db.close();
