// Disposable local catalog only. Never connects to Supabase.
import { consumerDB } from "../tests/support/consumer-db.mjs";
import { writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const c = await consumerDB();
const q = async (sql) => (await c.db.query(sql)).rows;
const catalog = {
  environment: "LOCAL PGlite; schema somente",
  tables: await q(
    "select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'commercial_%' order by c.relname",
  ),
  policies: await q(
    "select tablename,policyname,roles,cmd,qual from pg_policies where schemaname='public' and tablename like 'commercial_%' order by tablename",
  ),
  functions: await q(
    "select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_function_result(p.oid) result,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anon_execute,has_function_privilege('authenticated',p.oid,'execute') authenticated_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like 'commercial_%' order by n.nspname,p.proname",
  ),
  constraints: await q(
    "select c.relname,co.conname,pg_get_constraintdef(co.oid) definition from pg_constraint co join pg_class c on c.oid=co.conrelid where c.relname like 'commercial_%' order by c.relname,co.conname",
  ),
  indexes: await q(
    "select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename like 'commercial_%' order by tablename,indexname",
  ),
  triggers: await q(
    "select c.relname,t.tgname,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and (c.relname like 'commercial_%' or t.tgname like 'commercial_%') order by c.relname,t.tgname",
  ),
};
await c.db.close();
await writeFile(
  "reports/phase-6-sql-catalog.json",
  JSON.stringify(catalog, null, 2),
);
const old = JSON.parse(
  await readFile("reports/phase-6-migration-integrity.json", "utf8"),
);
for (const p of old.previous_migrations)
  if (
    createHash("sha256")
      .update(await readFile(p.path))
      .digest("hex") !== p.sha256
  )
    throw Error("Migration alterada: " + p.path);
console.log("Inventário local e integridade das migrations 001–013: PASS");
