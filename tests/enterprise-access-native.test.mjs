import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
if (!process.env.FOUNDATION_NATIVE_SOCKET?.startsWith("/"))
  throw Error("Disposable local socket required");
const c = await consumerDB(),
  org = c.orgs.A,
  results = [];
const hash = (s) => createHash("sha256").update(s).digest("hex");
async function connection(sql, args, actor = users.root) {
  const db = new pg.Client({
    host: process.env.FOUNDATION_NATIVE_SOCKET,
    user: "postgres",
    database: "foundation_phase2_test",
  });
  await db.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: actor, is_anonymous: false }),
    ]);
    const r = await db.query(sql, args);
    await db.query("commit");
    return r.rows[0].value;
  } finally {
    await db.end();
  }
}
const reserve =
  "select access_reserve($1,null,null,'Pessoa Teste','pessoa.teste','','','colaborador_empresa',$2,null) value";
const sameKey = randomUUID(),
  both = await Promise.all(
    [1, 2].map(() => connection(reserve, [org, sameKey])),
  );
assert.equal(both[0].id, both[1].id);
results.push({
  name: "Cliques concorrentes, mesma chave, mesma reserva",
  status: "PASS",
});
const collisions = await Promise.allSettled(
  [1, 2].map(() =>
    connection(reserve.replace("pessoa.teste", "outra.pessoa"), [
      org,
      randomUUID(),
    ]),
  ),
);
assert.equal(collisions.filter((x) => x.status === "fulfilled").length, 1);
results.push({
  name: "Mesmo username, chaves distintas, uma única reserva",
  status: "PASS",
});
const a = both[0];
await c.db.query(
  "insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,'ficticio@access.vireloq.invalid',now(),false)",
  [a.user_id],
);
const info = await connection(
  "select access_finish_provision($1,$2,$3) value",
  [a.id, users.root, hash("code")],
);
await connection("select access_verify_code($1,$2,$3,$4) value", [
  info.company_code,
  info.username,
  hash("code"),
  hash("proof"),
]);
const begin = await Promise.all(
  [1, 2].map(() =>
    connection("select access_begin_activation($1) value", [hash("proof")]),
  ),
);
assert.equal(begin.filter(Boolean).length, 1);
results.push({
  name: "Duas conexões independentes consomem somente uma prova",
  status: "PASS",
});
await assert.rejects(() =>
  connection("select access_reset($1,$2,$3) value", [
    a.id,
    users.root,
    hash("reset"),
  ]),
);
results.push({
  name: "Reset concorrente não atravessa alteração Auth em andamento",
  status: "PASS",
});
const task = begin.find(Boolean);
assert(
  await connection("select access_finish_activation($1,$2,true) value", [
    a.id,
    task.operation,
  ]),
);
assert.equal(
  await connection("select access_begin_activation($1) value", [hash("proof")]),
  null,
);
results.push({
  name: "Prova consumida não produz segunda ativação",
  status: "PASS",
});
await writeFile(
  "reports/enterprise-access-native.json",
  JSON.stringify(
    {
      environment:
        "PostgreSQL local descartável, conexões independentes; sem Supabase real",
      results,
    },
    null,
    2,
  ),
);
console.log(results);
await c.db.close();
