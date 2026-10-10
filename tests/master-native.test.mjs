// Native-only concurrency. This never accepts a network connection string.
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
const socket = process.env.FOUNDATION_NATIVE_SOCKET;
if (!socket?.startsWith("/"))
  throw Error("Disposable local Unix socket required");
const c = await consumerDB();
await c.db.exec("begin");
await c.as("adminA");
await c.rpc("foundation_set_member", {
  p_org: c.orgs.A,
  p_user: users.adminB,
  p_role: "admin_empresa",
  p_status: "active",
});
await c.db.exec("commit;reset role");
async function run(actor, sql, args = []) {
  const x = new pg.Client({
    host: socket,
    user: "postgres",
    database: "foundation_phase2_test",
  });
  await x.connect();
  try {
    await x.query("begin");
    await x.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: users[actor], is_anonymous: false }),
    ]);
    await x.query("set local role authenticated");
    const r = await x.query(sql, args);
    await x.query("commit");
    return r.rows[0];
  } catch (e) {
    await x.query("rollback");
    throw e;
  } finally {
    await x.end();
  }
}
const key = randomUUID();
const pair = await Promise.all([
  run("root", "select support_request($1,$2,1,$3,false) id", [
    c.orgs.A,
    "Diagnóstico autorizado de concorrência",
    key,
  ]),
  run("root", "select support_request($1,$2,1,$3,false) id", [
    c.orgs.A,
    "Diagnóstico autorizado de concorrência",
    key,
  ]),
]);
assert.equal(pair[0].id, pair[1].id);
const id = pair[0].id;
const decisions = await Promise.allSettled([
  run("adminA", "select support_decide($1,true)", [id]),
  run("adminB", "select support_decide($1,false)", [id]),
]);
assert.equal(decisions.filter((r) => r.status === "fulfilled").length, 1);
await run("adminA", "select support_revoke($1)", [id]).catch(async () => {
  const state = await c.scalar(
    "select state from private.support_requests where id=$1",
    [id],
  );
  assert.equal(state, "denied");
});
const emergency = await run(
  "root",
  "select support_request($1,$2,1,$3,true) id",
  [c.orgs.A, "Emergência fictícia para testar revogação", randomUUID()],
);
await Promise.allSettled([
  run("adminA", "select support_revoke($1)", [emergency.id]),
  run("root", "select operations_home($1)", [c.orgs.A]),
]);
await assert.rejects(
  () => run("root", "select operations_home($1)", [c.orgs.A]),
  (e) => e.code === "42501",
);
const codes = await Promise.all(
  Array.from({ length: 8 }, () =>
    run(
      "root",
      "select access_create_organization('Nomes Iguais',$1,$2) data",
      ["concorrencia-" + randomUUID(), randomUUID()],
    ),
  ),
);
assert.equal(new Set(codes.map((r) => r.data.company_code)).size, 8);
await c.db.close();
await writeFile(
  "reports/master-native.json",
  JSON.stringify(
    {
      engine: "PostgreSQL native",
      tests: [
        "Concurrent idempotent requests",
        "Competing ADM decisions",
        "Revocation versus operation; next access denied",
        "Concurrent readable codes",
      ],
      status: "PASS",
    },
    null,
    2,
  ),
);
console.log("PASS native support/code concurrency");
