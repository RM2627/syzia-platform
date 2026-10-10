import { consumerDB } from "../tests/support/consumer-db.mjs";
import { writeFile } from "node:fs/promises";
const c = await consumerDB(),
  q = async (sql) => (await c.db.query(sql)).rows;
const report = {
  environment: "LOCAL PGlite / 001–021; external homologation pending",
  tables: await q(
    "select relname name,relrowsecurity rls,relforcerowsecurity force_rls from pg_class where relnamespace='private'::regnamespace and relname like 'trial_%' and relkind='r' order by relname",
  ),
  functions: await q(
    "select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef security_definer,p.proconfig settings,p.proacl::text grants from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like 'trial_%' or p.proname like 'billing_trial_%' or p.proname in ('billing_subscription_action_base','billing_context_base') order by n.nspname,p.proname",
  ),
  constraints: await q(
    "select c.conname name,c.conrelid::regclass::text table_name,pg_get_constraintdef(c.oid) definition from pg_constraint c join pg_class t on t.oid=c.conrelid where t.relname like 'trial_%' order by table_name,name",
  ),
  indexes: await q(
    "select indexname,indexdef from pg_indexes where schemaname='private' and tablename like 'trial_%' order by indexname",
  ),
  triggers: await q(
    "select t.tgname name,c.relname table_name,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgname like 'trial_%' order by c.relname,t.tgname",
  ),
  public_rls: await q(
    "select count(*)::int tables,count(*) filter(where relrowsecurity and relforcerowsecurity)::int forced from pg_class where relnamespace='public'::regnamespace and relkind='r'",
  ),
};
await c.db.close();
await writeFile(
  "reports/trial-sql-catalog.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    private_trial_tables: report.tables.length,
    forced: report.tables.filter((t) => t.rls && t.force_rls).length,
    functions: report.functions.length,
    public: report.public_rls,
  }),
);
