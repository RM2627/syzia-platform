import { consumerDB } from "../tests/support/consumer-db.mjs";
import { writeFile } from "node:fs/promises";
const c = await consumerDB();
const q = async (sql) => (await c.db.query(sql)).rows;
const report = {
  environment: "LOCAL PGlite; migrations 001–020",
  tables: await q(
    "select relname name,relrowsecurity rls,relforcerowsecurity force_rls from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname",
  ),
  policies: await q(
    "select tablename,policyname,cmd,roles from pg_policies where schemaname='public' order by tablename,policyname",
  ),
  functions: await q(
    "select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef security_definer,p.proconfig settings,p.proacl::text grants from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like 'billing_%' order by n.nspname,p.proname",
  ),
  constraints: await q("select c.conname name,c.conrelid::regclass::text table_name,pg_get_constraintdef(c.oid) definition from pg_constraint c join pg_class t on t.oid=c.conrelid where t.relname like 'billing_%' order by table_name,name"),
  triggers: await q("select t.tgname name,c.relname table_name,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgname like 'billing_%' order by c.relname,t.tgname"),
  indexes: await q(
    "select indexname,indexdef from pg_indexes where schemaname='public' and indexname like 'billing_%'",
  ),
};
await c.db.close();
await writeFile(
  "reports/phase-8-sql-catalog.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    tables: report.tables.length,
    forced: report.tables.filter((t) => t.rls && t.force_rls).length,
    policies: report.policies.length,
    functions: report.functions.length,
    indexes: report.indexes.length,
  }),
);
