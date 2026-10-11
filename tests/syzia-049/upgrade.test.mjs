import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { upgradeOperationFixture } from "../../scripts/syzia-049/fixture.mjs";
Object.assign(process.env, {
  SYZIA_TEAM_CURRENT: "1",
  SYZIA_FLEXIBLE_CURRENT: "1",
  SYZIA_BILLING_CURRENT: "1",
  SYZIA_OPTIONAL_MANUAL_CURRENT: "1",
  SYZIA_OPERATION_CURRENT: "0",
});
const h = await import("../support/current-db.mjs");
await h.db.exec("commit;reset role");
test.after(() => h.db.close());
test("049-G01 migration em banco populado preserva registros 048, RLS e mensagens imutáveis", async () => {
  const tables = (
    await h.db.query(
      "select n.nspname||'.'||c.relname name,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private')and c.relkind='r'order by 1",
    )
  ).rows;
  const snapshot = async () => {
    const result = {};
    for (const t of tables) {
      const rows = (
        await h.db.query(
          `select to_jsonb(t)-'attendance_revision'row from ${t.name} t order by(to_jsonb(t)-'attendance_revision')::text`,
        )
      ).rows;
      result[t.name] = createHash("sha256")
        .update(JSON.stringify(rows))
        .digest("hex");
    }
    return result;
  };
  const before = await snapshot();
  await upgradeOperationFixture(h.db);
  assert.deepEqual(await snapshot(), before);
  for (const t of tables) {
    const after = (
      await h.db.query(
        "select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass",
        [t.name],
      )
    ).rows[0];
    assert.equal(after.relrowsecurity, t.relrowsecurity, t.name);
    assert.equal(after.relforcerowsecurity, t.relforcerowsecurity, t.name);
  }
  assert.equal(
    await h.scalar("select count(*)from private.ticket_message_numbers"),
    await h.scalar("select count(*)from ticket_messages"),
  );
});
