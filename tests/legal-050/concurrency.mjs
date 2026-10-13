// Real separate PostgreSQL sessions, only launched by scripts/legal-050/native.mjs.
import pg from "pg";
import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { publicationSQL, rollbackSQL } from "../../scripts/legal-050/sql.mjs";
import { snapshot, fixtureDocuments, provision, accept } from "./fixture.mjs";
const socket = process.env.FOUNDATION_NATIVE_SOCKET;
if (
  !socket?.startsWith("/tmp/syzia-legal050-") &&
  !socket?.includes("/syzia-legal050-")
)
  throw Error("Isolated local runner required");
Object.assign(process.env, {
  SYZIA_TEAM_CURRENT: "1",
  SYZIA_FLEXIBLE_CURRENT: "1",
  SYZIA_BILLING_CURRENT: "1",
  SYZIA_OPTIONAL_MANUAL_CURRENT: "1",
  SYZIA_OPERATION_CURRENT: "1",
});
const { consumerDB } = await import("../support/current-fixture.mjs");
const c = await consumerDB();
await c.db.exec("commit;reset role");
async function client() {
  const p = new pg.Client({
    host: socket,
    user: "postgres",
    database: "foundation_phase2_test",
  });
  await p.connect();
  return p;
}
async function sql(sql) {
  const p = await client();
  try {
    return await p.query(sql);
  } finally {
    await p.end();
  }
}
async function waitForLock() {
  for (let n = 0; n < 100; n++) {
    const count = Number(
      (
        await c.db.query(
          "select count(*) from pg_locks where locktype='advisory' and not granted",
        )
      ).rows[0].count,
    );
    if (count) return;
    await wait(20);
  }
  throw Error("Contending transaction never reached advisory lock");
}
try {
  const admin = await provision(c);
  await accept(c, admin);
  const before = await snapshot(c.db),
    docs = await fixtureDocuments("native-050-v1", "native-material-v1"),
    review = "f".repeat(64);
  const apply = publicationSQL(before, docs, review);
  const race = await Promise.allSettled([sql(apply), sql(apply)]);
  assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
  assert.match(
    race.find((x) => x.status === "rejected").reason.message,
    /legal_expected_version_mismatch/,
  );
  console.log(
    "PASS L050-N01 two publishers, one commit and one stale-snapshot rejection",
  );
  const before2 = await snapshot(c.db),
    docs2 = await fixtureDocuments("native-050-v2", "native-material-v2");
  const writer = await client();
  await writer.query(
    publicationSQL(before2, docs2, review).replace(/COMMIT;\s*$/, ""),
  );
  const reader = await client();
  try {
    await reader.query("begin");
    await reader.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({
        sub: admin.user_id,
        session_id: admin.session,
        is_anonymous: false,
      }),
    ]);
    await reader.query("set local role authenticated");
    const stale = reader
      .query("select public.access_legal_accept($1,$2)", [
        docs[0].version,
        docs[1].version,
      ])
      .then(
        () => ({ ok: true }),
        (e) => ({ error: e.message }),
      );
    await waitForLock();
    await writer.query("commit");
    const outcome = await stale;
    assert.match(outcome.error, /legal_version_changed/);
    console.log(
      "PASS L050-N02 acceptance waits for publication and rejects old version",
    );
  } finally {
    await reader.query("rollback");
    await reader.end();
    await writer.end();
  }
  const acc = await client();
  await acc.query("begin");
  await acc.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({
      sub: admin.user_id,
      session_id: admin.session,
      is_anonymous: false,
    }),
  ]);
  await acc.query("set local role authenticated");
  await acc.query("select public.access_legal_accept($1,$2)", [
    docs2[0].version,
    docs2[1].version,
  ]);
  const reversal = sql(rollbackSQL(before2, docs2, review)).then(
    () => ({ ok: true }),
    (e) => ({ error: e.message }),
  );
  await waitForLock();
  await acc.query("commit");
  await acc.end();
  assert.match((await reversal).error, /legal_rollback_has_acceptances/);
  console.log("PASS L050-N03 concurrent acceptance prevents rollback");
  const blocker = await client();
  await blocker.query("begin;select pg_advisory_xact_lock(734921501)");
  try {
    const now = await snapshot(c.db);
    const script = publicationSQL(
      now,
      await fixtureDocuments("native-050-v3", "native-material-v3"),
      review,
    ).replace("lock_timeout='5s'", "lock_timeout='100ms'");
    await assert.rejects(sql(script), /lock timeout/);
    assert.deepEqual((await snapshot(c.db)).current, now.current);
    console.log("PASS L050-N04 lock timeout leaves current versions untouched");
  } finally {
    await blocker.query("rollback");
    await blocker.end();
  }
} finally {
  await c.db.close();
}
