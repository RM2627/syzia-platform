// Independent connections to a disposable local PostgreSQL only. Never accepts a remote URL.
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { digest } from "../server/enterprise-access.mjs";
if (!process.env.FOUNDATION_NATIVE_SOCKET?.startsWith("/"))
  throw Error("Disposable local socket required");
const c = await consumerDB(),
  results = [];
async function query(sql, args = []) {
  const db = new pg.Client({
    host: process.env.FOUNDATION_NATIVE_SOCKET,
    user: "postgres",
    database: "foundation_phase2_test",
  });
  await db.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: users.root, is_anonymous: false }),
    ]);
    const r = await db.query(sql, args);
    await db.query("commit");
    return r.rows[0]?.value;
  } finally {
    await db.end();
  }
}
const key = randomUUID(),
  created = await Promise.all(
    [1, 2].map(() =>
      query(
        "select access_create_organization('Concorrência Fictícia','concorrencia-ficticia',$1) value",
        [key],
      ),
    ),
  );
assert.equal(created[0].organization_id, created[1].organization_id);
results.push({
  name: "Concurrent no-admin creation keeps one organization/code",
  status: "PASS",
});
const org = created[0].organization_id;
// Reservation and deletion share the existing authorization lock. Either deletion wins and reservation fails,
// or reservation wins and deletion is refused. They can never both succeed in deleting and provisioning.
const race = await Promise.allSettled([
  query(
    "select access_reserve($1,'','','Ana Silva','ana.silva','ana@example.invalid','','admin_empresa',$2) value",
    [org, randomUUID()],
  ),
  query("select access_delete_organization($1,'Concorrência Fictícia') value", [
    org,
  ]),
]);
assert(
  !(
    race[0].status === "fulfilled" &&
    race[1].status === "fulfilled" &&
    race[1].value.deleted
  ),
);
results.push({
  name: "Concurrent deletion/reservation cannot orphan a reserved identity",
  status: "PASS",
});
const a = await query(
  "select access_reserve($1,'','','Nova Pessoa','nova.pessoa','nova@example.invalid','','admin_empresa',$2) value",
  [c.orgs.A, randomUUID()],
);
await c.db.query(
  "insert into auth.users(id,email,email_confirmed_at) values($1,'ficticia@access.vireloq.invalid',now())",
  [a.user_id],
);
await query("select access_finish_provision($1,$2,$3) value", [
  a.id,
  users.root,
  digest("code"),
]);
const send = await Promise.allSettled(
  [1, 2].map((i) =>
    query("select access_delivery_prepare($1,$2,$3,true) value", [
      a.id,
      users.root,
      digest("code" + i),
    ]),
  ),
);
assert.equal(send.filter((x) => x.status === "fulfilled").length, 1);
results.push({
  name: "Concurrent resends issue one generation, with persistent cooldown",
  status: "PASS",
});
await writeFile(
  "reports/organization-activation-native.json",
  JSON.stringify(
    {
      environment:
        "Disposable native PostgreSQL; independent connections; no SMTP",
      results,
    },
    null,
    2,
  ),
);
console.log(results);
await c.db.close();
