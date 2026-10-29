import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fixture } from "./fixture.mjs";
test("061 all three migrations roll back atomically on populated local database", async () => {
  const c = await fixture({ through: 60 });
  try {
    for (const [file, relation] of [
      ["202610280061_service_quantities.sql", "private.quantity_events"],
      ["202610280062_insights.sql", "private.insights_posts"],
      ["202610280063_billing_environments.sql", "private.billing061_offers"],
    ]) {
      const sql = await readFile("supabase/migrations/" + file, "utf8");
      const count = (
        await c.rawSQL("select count(*)::int n from public.organizations")
      ).rows[0].n;
      await assert.rejects(
        c.db.exec(sql.replace(/commit;\s*$/i, "select 1/0;commit;")),
        /division by zero/,
      );
      await c.db.exec("rollback");
      assert.equal(
        (await c.rawSQL("select to_regclass($1) r", [relation])).rows[0].r,
        null,
      );
      assert.equal(
        (await c.rawSQL("select count(*)::int n from public.organizations"))
          .rows[0].n,
        count,
      );
      await c.db.exec(sql);
      assert.ok(
        (await c.rawSQL("select to_regclass($1) r", [relation])).rows[0].r,
      );
    }
  } finally {
    await c.db.close();
  }
});
