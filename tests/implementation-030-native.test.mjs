import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
const socket = process.env.FOUNDATION_NATIVE_SOCKET;
if (!socket?.startsWith("/"))
  throw Error("Disposable local PostgreSQL socket required");
const { db, as, scalar, orgs } = await consumerDB(),
  results = [];
const today = new Date().toISOString().slice(0, 10);
await db.exec("begin");
await as("adminA");
const a = await scalar("select financial_account_save($1,null,0,$2,$3)", [
  orgs.A,
  JSON.stringify({ description: "Concorrência fictícia", total_cents: 17000 }),
  randomUUID(),
]);
const b = await scalar("select financial_account_save($1,null,0,$2,$3)", [
  orgs.A,
  JSON.stringify({
    description: "Idempotência concorrente",
    total_cents: 17000,
  }),
  randomUUID(),
]);
await db.exec("commit;reset role");
async function client() {
  const c = new pg.Client({
    host: socket,
    user: "postgres",
    database: "foundation_phase2_test",
  });
  await c.connect();
  return c;
}
async function tx(c, fn, actor = users.adminA) {
  await c.query("begin");
  try {
    await c.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: actor, is_anonymous: false }),
    ]);
    await c.query("set local role authenticated");
    const r = await fn(c);
    await c.query("commit");
    return { ok: true, data: r.rows[0]?.r };
  } catch (e) {
    await c.query("rollback");
    return { ok: false, error: e.message };
  }
}
const x = await client(),
  y = await client();
const receive = (c, id, amount, key) =>
  tx(c, (c) =>
    c.query("select financial_receipt_record($1,$2,$3,$4,$5,$6,$7)as r", [
      orgs.A,
      id,
      amount,
      today,
      "pix",
      "Teste concorrente fictício",
      key,
    ]),
  );
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.error("FAIL", name, e.message);
  }
}
await test("Duas conexões não recebem acima do saldo", async () => {
  const r = await Promise.all([
    receive(x, a.id, 10000, randomUUID()),
    receive(y, a.id, 10000, randomUUID()),
  ]);
  assert.equal(r.filter((x) => x.ok).length, 1);
  assert.equal(
    await scalar("select private.financial_received($1,$2)", [orgs.A, a.id]),
    10000,
  );
});
await test("Mesma chave em duas conexões gera um único lançamento", async () => {
  const key = randomUUID();
  const r = await Promise.all([
    receive(x, b.id, 5000, key),
    receive(y, b.id, 5000, key),
  ]);
  assert.ok(r.every((x) => x.ok));
  assert.equal(r[0].data.id, r[1].data.id);
  assert.equal(
    await scalar(
      "select count(*)::int from financial_receipts where account_id=$1",
      [b.id],
    ),
    1,
  );
});
await test("Estornos simultâneos referenciam um único estorno do original", async () => {
  const receipt = await scalar(
    "select id from financial_receipts where account_id=$1",
    [b.id],
  );
  const reverse = (c) =>
    tx(c, (c) =>
      c.query("select financial_receipt_reverse($1,$2,$3,$4)as r", [
        orgs.A,
        receipt,
        "Correção fictícia concorrente",
        randomUUID(),
      ]),
    );
  const r = await Promise.all([reverse(x), reverse(y)]);
  assert.ok(r.every((x) => x.ok));
  assert.equal(r[0].data.id, r[1].data.id);
  assert.equal(
    await scalar("select private.financial_received($1,$2)", [orgs.A, b.id]),
    0,
  );
});
await test("Categoria concorrente normalizada é reutilizada", async () => {
  const create = (c) =>
    tx(c, (c) =>
      c.query("select company_category_save($1,null,0,$2,$3)as r", [
        orgs.A,
        JSON.stringify({ name: "Categoria concorrente" }),
        randomUUID(),
      ]),
    );
  const r = await Promise.all([create(x), create(y)]);
  assert.ok(r.every((x) => x.ok));
  assert.equal(r[0].data.id, r[1].data.id);
});
await test("Consulta de métricas não altera financeiro, auditoria ou guia", async () => {
  const counts = () =>
    scalar(
      `select jsonb_build_array((select count(*)from financial_accounts),(select count(*)from financial_receipts),(select count(*)from financial_events),(select count(*)from audit_logs),(select count(*)from organization_user_guides))`,
    );
  const before = await counts();
  const r = await tx(x, (c) =>
    c.query("select analytics_company($1,$2,$3,null,null)as r", [
      orgs.A,
      today,
      today,
    ]),
  );
  assert.ok(r.ok, r.error);
  assert.deepEqual(await counts(), before);
  assert.equal(
    await scalar("select count(*)::int from private.permission_frames"),
    0,
  );
});
await test("Concorrência de permissões respeita revisão", async () => {
  const read = await tx(x, (c) =>
    c.query("select permissions_team($1)as r", [orgs.A]),
  );
  const rev = read.data.members.find(
    (m) => m.user_id === users.worker,
  ).revision;
  const change = (c, key, granted) =>
    tx(c, (c) =>
      c.query("select permissions_save($1,$2,$3,$4,$5)as r", [
        orgs.A,
        users.worker,
        rev,
        JSON.stringify([
          { action: "home.read", scope: "organization", granted },
        ]),
        key,
      ]),
    );
  const results = await Promise.all([
    change(x, randomUUID(), true),
    change(y, randomUUID(), false),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
});
await test("Ativação cadastral concorrente com a mesma chave não duplica histórico", async () => {
  const o = await tx(
    x,
    (c) =>
      c.query("select foundation_create_organization($1,$2,$3)as r", [
        "Empresa concorrente fictícia",
        "race-" + randomUUID(),
        users.adminA,
      ]),
    users.root,
  );
  assert.ok(o.ok, o.error);
  const v = await tx(x, (c) =>
    c.query("select access_verification_context($1)as r", [o.data]),
  );
  assert.ok(v.ok, v.error);
  const key = randomUUID();
  const verify = (c) =>
    tx(c, (c) =>
      c.query("select access_verify_document($1,'CPF',$2,$3,$4)as r", [
        o.data,
        "52998224725",
        v.data.revision,
        key,
      ]),
    );
  const r = await Promise.all([verify(x), verify(y)]);
  assert.ok(
    r.every((x) => x.ok),
    JSON.stringify(r),
  );
  assert.deepEqual(r[0].data, r[1].data);
});
await test("Atribuição compartilhada concorrente preserva um vínculo por ator e empresa", async () => {
  await db.query(
    "insert into platform_roles(user_id,role)values($1,'atendente')on conflict do nothing",
    [users.agentA],
  );
  const exemption = await tx(
    x,
    (c) =>
      c.query("select billing_exemption_set($1,'internal',$2,$3,$4)as r", [
        orgs.A,
        JSON.stringify({
          software: true,
          human_support: true,
          commercial_followups: true,
        }),
        "Condição fictícia de teste concorrente",
        randomUUID(),
      ]),
    users.root,
  );
  assert.ok(exemption.ok, exemption.error);
  const assign = (c) =>
    tx(
      c,
      (c) =>
        c.query(
          "select foundation_set_attendant($1,$2,'primary','active')as r",
          [orgs.A, users.agentA],
        ),
      users.root,
    );
  const r = await Promise.all([assign(x), assign(y)]);
  assert.ok(
    r.every((x) => x.ok),
    JSON.stringify(r),
  );
  assert.equal(
    await scalar(
      "select count(*)::int from attendant_organizations where organization_id=$1 and user_id=$2",
      [orgs.A, users.agentA],
    ),
    1,
  );
});
await x.end();
await y.end();
await db.close();
await writeFile(
  "reports/implementation-030/native-concurrency.json",
  JSON.stringify(
    {
      environment:
        "PostgreSQL 18 local, separate connections, no network listener, fictitious data",
      results,
    },
    null,
    2,
  ),
);
if (results.some((x) => x.status === "FAIL")) process.exitCode = 1;
