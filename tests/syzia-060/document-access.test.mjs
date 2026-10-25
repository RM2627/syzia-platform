import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
Object.assign(process.env, {
  SYZIA_TEAM_CURRENT: "1",
  SYZIA_FLEXIBLE_CURRENT: "1",
  SYZIA_BILLING_CURRENT: "1",
  SYZIA_OPTIONAL_MANUAL_CURRENT: "1",
  SYZIA_OPERATION_CURRENT: "1",
});
const h = await import("../support/current-db.mjs"),
  { db, as, rpc, scalar } = h;
await db.exec("commit;reset role");
for (const n of (await readdir("supabase/migrations"))
  .filter((n) => /^202610(18|20|21|22|25)00(54|55|56|57|58|59|60)_/.test(n))
  .sort())
  await db.exec(await readFile("supabase/migrations/" + n, "utf8"));
test.after(() => db.close());
test("060 documents: real booking, customer identity, original snapshot unchanged and cross-scope refusal", async () => {
  await db.exec("begin");
  try {
    const { p, s } = await h.setup(),
      items = [h.empty(s)],
      q = await h.draft(p, items);
    await h.complete(q, (await h.slots(p, items))[0]);
    const [a] = await h.records(q);
    await as("alice");
    const args = {
      p_code: q.code,
      p_kind: "appointment",
      p_reference: a.public_code,
    };
    const after = await rpc("consumer_document", args);
    await db.exec("reset role");
    const before = await scalar(
      "select public.consumer_document_pre060($1,$2,$3)",
      [q.code, "appointment", a.public_code],
    );
    assert.deepEqual(
      { ...after.content, professional: undefined },
      { ...before.content, professional: undefined },
    );
    assert.equal(after.status, "Confirmado");
    assert.ok(after.customer.name);
    assert.equal(after.company.name, before.company.name);
    await as("bob");
    await h.denied(() => rpc("consumer_document", args), /denied/);
    await as("adminB");
    await h.denied(() => rpc("consumer_document", args), /denied/);
    await as("alice");
    await db.exec("savepoint canceled;reset role");
    await db.query("update appointments set state='cancelled'where id=$1", [
      a.id,
    ]);
    await as("alice");
    await h.denied(() => rpc("consumer_document", args), /unavailable/);
    await db.exec("rollback to canceled");
  } finally {
    await db.exec("rollback;reset role");
  }
});
