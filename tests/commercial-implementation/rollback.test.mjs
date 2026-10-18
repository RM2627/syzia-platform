import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "../support/pglite.mjs";
test("M01 incremental DDL failure rolls back new tables, grants and optional-phone change atomically", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("tests/auth-fixture.sql", "utf8"));
    const files = (await readdir("supabase/migrations"))
      .filter((x) => x.endsWith(".sql") && !x.includes("0054_"))
      .sort();
    assert.equal(files.length, 49);
    for (const f of files)
      await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
    const sql = await readFile(
      "supabase/migrations/202610180054_commercial_preparation.sql",
      "utf8",
    );
    await assert.rejects(
      db.exec(sql.replace(/commit;\s*$/, "select 1/0;\ncommit;")),
      /division by zero/,
    );
    await db.exec("rollback");
    assert.equal(
      (
        await db.query(
          "select to_regclass('private.commercial_contacts') value",
        )
      ).rows[0].value,
      null,
    );
    assert.equal(
      (
        await db.query(
          "select attnotnull value from pg_attribute where attrelid='private.acquisition_leads'::regclass and attname='phone'",
        )
      ).rows[0].value,
      true,
    );
    assert.equal(
      (
        await db.query(
          "select to_regprocedure('public.consumer_page_draft_pre054(uuid,boolean)') value",
        )
      ).rows[0].value,
      null,
    );
    const constraint = (
      await db.query(
        "select pg_get_constraintdef(oid) value from pg_constraint where conname='people_grants_permissions_check'",
      )
    ).rows[0].value;
    assert.doesNotMatch(constraint, /commercial\.read/);
  } finally {
    await db.close();
  }
});
