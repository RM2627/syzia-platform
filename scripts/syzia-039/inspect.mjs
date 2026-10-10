import { consumerDB } from "../../tests/support/consumer-db.mjs";
import { writeFile } from "node:fs/promises";
const { db } = await consumerDB({
  through: "202609250038_multiservice_requests.sql",
});
const rows = (
  await db.query(
    `select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' and (p.proname like '%billing%' or p.proname like '%analytics%' or p.proname like '%commercial%' or p.proname in ('plan_capabilities','entitlement','foundation_create_organization','operations_customer','company_initialize','consumer_create_multi_request','operations_agenda','financial_summary','central_act')) order by 1`,
  )
).rows;
await writeFile(
  "reports/syzia-039/inspection-functions.json",
  JSON.stringify(rows, null, 2),
);
await db.close();
console.log("Funções atuais inspecionadas: " + rows.length);
