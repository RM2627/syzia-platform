// LOCAL disposable native cluster only. Never accepts a remote DATABASE_URL.
import { Client } from "pg";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const socket = process.env.FOUNDATION_NATIVE_SOCKET;
if (!socket?.startsWith("/")) throw Error("Disposable local socket required");
const clients = Array.from(
  { length: 3 },
  () =>
    new Client({
      host: socket,
      user: "postgres",
      database: "foundation_phase2_test",
    }),
);
const results = [];
await Promise.all(clients.map((c) => c.connect()));
const [owner, a, b] = clients,
  root = randomUUID(),
  ua = randomUUID(),
  ub = randomUUID();
const scalar = async (c, sql, args = []) =>
  Object.values((await c.query(sql, args)).rows[0])[0];
async function begin(c, user) {
  await c.query("begin");
  await c.query("set local statement_timeout='15s'");
  await c.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: user, is_anonymous: false }),
  ]);
  await c.query("set local role authenticated");
}
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.log("FAIL", name, e.message);
    process.exitCode = 1;
    await Promise.all([a, b].map((c) => c.query("rollback")));
  }
}
try {
  await owner.query(await readFile("tests/auth-fixture.sql", "utf8"));
  for (const f of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await owner.query(await readFile("supabase/migrations/" + f, "utf8"));
  for (const id of [root, ua, ub])
    await owner.query(
      "insert into auth.users(id,email_confirmed_at,is_anonymous) values($1,now(),false)",
      [id],
    );
  await owner.query(
    "insert into platform_roles(user_id,role) values($1,'super_admin')",
    [root],
  );
  await begin(owner, root);
  const orgA = await scalar(
    owner,
    "select foundation_create_organization('Native A fictícia','native-a',$1)",
    [ua],
  );
  const orgB = await scalar(
    owner,
    "select foundation_create_organization('Native B fictícia','native-b',$1)",
    [ub],
  );
  const plan = await scalar(owner, "select billing_plan_save(null,0,$1)", [
    JSON.stringify({
      name: "Trial nativo fictício",
      price_cents: 100,
      interval_months: 1,
      trial_days: 15,
      available: true,
      active: true,
    }),
  ]);
  for (const org of [orgA, orgB])
    await owner.query(
      "select billing_trial_verify($1,'business','ZZ:TEST:SHAREDNATIVE','native-fixture','Verified fictitious native identity',true)",
      [org],
    );
  await owner.query("commit;reset role");
  assert.notEqual(
    await scalar(a, "select pg_backend_pid()"),
    await scalar(b, "select pg_backend_pid()"),
  );
  const request = "select billing_subscription_action($1,'trial',$2,0,$3)";
  await test("Independent connections: same verified identity across organizations grants only once", async () => {
    await begin(a, ua);
    await begin(b, ub);
    const first = await scalar(a, request, [orgA, plan, randomUUID()]);
    const waiting = scalar(b, request, [orgB, plan, randomUUID()]);
    waiting.catch(() => {});
    await a.query("commit");
    const second = await waiting;
    await b.query("commit");
    assert.equal(first.trial, true);
    assert.equal(second.review_required, true);
    assert.equal(
      await scalar(owner, "select count(*)::int from private.trial_grants"),
      1,
    );
  });
  await test("Independent connections: duplicate administrative extension adds days once", async () => {
    await begin(a, root);
    await begin(b, root);
    const args = [orgA, randomUUID()];
    const sql =
      "select billing_trial_admin($1,'extend',null,1,5,'Fictitious concurrent extension',true,$2)";
    const first = await scalar(a, sql, args),
      waiting = scalar(b, sql, args);
    waiting.catch(() => {});
    await a.query("commit");
    const second = await waiting;
    await b.query("commit");
    assert.deepEqual(first, second);
    assert.equal(
      await scalar(owner, "select count(*)::int from private.trial_extensions"),
      1,
    );
  });
  await test("Independent connections: stale extension revision cannot apply twice", async () => {
    await begin(a, root);
    await begin(b, root);
    const sql =
      "select billing_trial_admin($1,'extend',null,2,2,'Fictitious optimistic concurrency',true,$2)";
    await scalar(a, sql, [orgA, randomUUID()]);
    const waiting = scalar(b, sql, [orgA, randomUUID()]);
    waiting.catch(() => {});
    await a.query("commit");
    await assert.rejects(waiting, (e) => e.code === "40001");
    await b.query("rollback");
    assert.equal(
      await scalar(owner, "select count(*)::int from private.trial_extensions"),
      2,
    );
  });
} finally {
  await Promise.all(clients.map((c) => c.end()));
  await writeFile(
    "reports/trial-native-results.json",
    JSON.stringify(
      {
        environment:
          "LOCAL native PostgreSQL; independent backend PIDs; fictitious data",
        results,
      },
      null,
      2,
    ),
  );
}
