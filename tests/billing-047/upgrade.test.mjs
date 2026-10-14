import { assertHotfix051File } from "../support/hotfix051-integrity.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fixture } from "./fixture.mjs";
test("047-26 Upgrade populado preserva todas as linhas anteriores e cadeia completa 001–046", async () => {
  const hashes = JSON.parse(await readFile("docs/billing-047/migrations-046-sha256.json", "utf8"));
  assert.equal(Object.keys(hashes).length, 42);
  for (const [file, hash] of Object.entries(hashes)) assertHotfix051File(file, await readFile(file), hash);
  let tables, before;
  const snapshot = async c => { const result = {}; for (const t of tables) result[t.table_schema + "." + t.table_name] = await c.scalar(`select coalesce(jsonb_agg(r order by r::text),'[]')from(select to_jsonb(x)r from(select ${t.cols} from ${t.table_schema}.${t.table_name})x)y`); return result; };
  const c = await fixture({ beforeUpgrade: async c => {
    tables = (await c.db.query("select table_schema,table_name,string_agg(quote_ident(column_name),','order by ordinal_position)cols from information_schema.columns where table_schema in('public','private')group by 1,2 order by 1,2")).rows;
    before = await snapshot(c);
  }, afterUpgrade: async c => { assert.deepEqual(await snapshot(c), before); } });
  try {
    const rls = (await c.rawSQL("select relname,relrowsecurity,relforcerowsecurity from pg_class where relname like 'billing047_%'and relkind='r'")).rows;
    assert.equal(rls.length, 6); assert.ok(rls.every(r => r.relrowsecurity && r.relforcerowsecurity));
    for (const role of ["anon", "authenticated"]) {
      const result = (await c.rawSQL("select has_function_privilege($1,'public.billing047_service(text,uuid,jsonb)','execute')allowed", [role])).rows[0]; assert.equal(result.allowed, false);
    }
    const result = (await c.rawSQL("select has_function_privilege('service_role','public.billing047_service(text,uuid,jsonb)','execute')allowed")).rows[0]; assert.equal(result.allowed, true);
  } finally { await c.db.close(); }
});
