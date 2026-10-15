import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
for (const name of [
  "TEAM",
  "FLEXIBLE",
  "BILLING",
  "OPTIONAL_MANUAL",
  "OPERATION",
])
  process.env["SYZIA_" + name + "_CURRENT"] = "1";
const { db, as, scalar, orgs, users } =
  await import("../support/current-db.mjs");
await db.exec("commit;reset role");
test.beforeEach(() => db.exec("begin"));
test.afterEach(() => db.exec("rollback;reset role"));
test.after(() => db.close());
async function notification() {
  await db.exec("reset role");
  const id = randomUUID();
  await db.query(
    "insert into notifications(id,organization_id,object_id,kind,title,href)values($1,$2,$1,'appointment','Fictitious update','/painel/ficticio/agenda')",
    [id, orgs.A],
  );
  return id;
}
async function denied(action) {
  await db.exec("savepoint denied");
  try {
    await action();
    assert.fail("Expected denial");
  } catch (e) {
    await db.exec("rollback to savepoint denied");
    assert.match(e.message, /denied|permission/);
  }
}
test("N01 read persists per user and repeated click is idempotent", async () => {
  const id = await notification();
  await as("adminA");
  await db.query("select operations_read_notification($1,$2)", [orgs.A, id]);
  await db.query("select operations_read_notification($1,$2)", [orgs.A, id]);
  const result = await scalar("select operations_home_section($1,'updates')", [
    orgs.A,
  ]);
  assert.equal(result.notifications.find((n) => n.id === id).read, true);
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*)::int from notification_reads where notification_id=$1 and user_id=$2",
      [id, users.adminA],
    ),
    1,
  );
});
test("N02 other tenant cannot read or mark notification; no forged org", async () => {
  const id = await notification();
  await as("adminB");
  await denied(() =>
    db.query("select operations_read_notification($1,$2)", [orgs.A, id]),
  );
  await denied(() =>
    db.query("select operations_read_notification($1,$2)", [orgs.B, id]),
  );
  assert.equal(
    await scalar("select count(*)::int from notifications where id=$1", [id]),
    0,
  );
});
test("N03 employee without management permission cannot mark or receive home updates", async () => {
  const id = await notification();
  await as("worker");
  await denied(() =>
    db.query("select operations_read_notification($1,$2)", [orgs.A, id]),
  );
  await denied(() =>
    db.query("select operations_home_section($1,'updates')", [orgs.A]),
  );
});
test("N04 reads are separate for authorized users and FORCE RLS remains on both tables", async () => {
  const id = await notification();
  await as("adminA");
  await db.query("select operations_read_notification($1,$2)", [orgs.A, id]);
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*)::int from notification_reads where notification_id=$1 and user_id<>$2",
      [id, users.adminA],
    ),
    0,
  );
  const rows = (
    await db.query(
      "select relrowsecurity,relforcerowsecurity from pg_class where oid in('notifications'::regclass,'notification_reads'::regclass)",
    )
  ).rows;
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.relrowsecurity && r.relforcerowsecurity));
});
