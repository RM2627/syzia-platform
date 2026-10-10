// Independent transactions in a disposable local PostgreSQL cluster only.
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
const socket = process.env.FOUNDATION_NATIVE_SOCKET;
if (!socket?.startsWith("/")) throw Error("Local disposable socket required");
const c = await consumerDB(),
  { db, as, rpc, orgs } = c,
  results = [];
async function concurrent(sql, args) {
  const x = new pg.Client({
    host: socket,
    user: "postgres",
    database: "foundation_phase2_test",
  });
  await x.connect();
  try {
    await x.query("begin");
    await x.query("set local statement_timeout='15s'");
    await x.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: users.adminA, is_anonymous: false }),
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
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS " + name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.error("FAIL " + name, e);
    process.exitCode = 1;
  }
}
await test("Duas abas com revisão zero: somente uma inicia o tutorial", async () => {
  const r = await Promise.allSettled([
    concurrent("select onboarding_act($1,'start',0,$2) as v", [
      orgs.A,
      randomUUID(),
    ]),
    concurrent("select onboarding_act($1,'start',0,$2) as v", [
      orgs.A,
      randomUUID(),
    ]),
  ]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(r.find((x) => x.status === "rejected").reason.code, "40001");
});
await test("Duas conexões com mesma chave retornam o mesmo efeito", async () => {
  const key = randomUUID(),
    data = {
      name: "Pessoa fictícia concorrente",
      whatsapp: "81999990001",
      accepted_notice: true,
    };
  const r = await Promise.all([
    concurrent("select operations_customer($1,$2,$3) as id", [
      orgs.A,
      data,
      key,
    ]),
    concurrent("select operations_customer($1,$2,$3) as id", [
      orgs.A,
      data,
      key,
    ]),
  ]);
  assert.equal(r[0].id, r[1].id);
});
const requests = [];
await db.exec("begin");
await as("adminA");
const d = await rpc("operations_directory", {
    p_org: orgs.A,
    p_search: "",
    p_offset: 0,
  }),
  s = d.catalog.services.find((s) => s.price_mode === "fixed");
for (let i = 0; i < 2; i++) {
  const customer = await rpc("operations_customer", {
    p_org: orgs.A,
    p_data: {
      name: "Pessoa " + i + " fictícia",
      whatsapp: "81999990100",
      accepted_notice: true,
    },
    p_key: randomUUID(),
  });
  requests.push(
    await rpc("operations_request", {
      p_org: orgs.A,
      p_customer: customer,
      p_service: s.code,
      p_addons: [],
      p_answers: Object.fromEntries(
        s.questions.map((q) => [q.code, "Veículo fictício"]),
      ),
      p_notes: "",
      p_source: "direct",
      p_key: randomUUID(),
    }),
  );
}
await db.exec("commit;reset role");
const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
await test("Duas reservas simultâneas em conexões independentes: apenas uma confirmada", async () => {
  const r = await Promise.allSettled(
    requests.map((q) =>
      concurrent(
        "select operations_schedule($1,$2,$3,60,'',$4) as appointment",
        [orgs.A, q.id, day + "T12:00:00Z", randomUUID()],
      ),
    ),
  );
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(r.find((x) => x.status === "rejected").reason.code, "23P01");
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from appointments where organization_id=$1 and state='confirmed'",
        [orgs.A],
      )
    ).rows[0].n,
    1,
  );
});
await db.close();
await writeFile(
  "reports/operations-native.json",
  JSON.stringify(
    {
      environment:
        "LOCAL PostgreSQL nativo; conexões independentes; Auth claims de teste; sem Supabase real",
      tests: results,
    },
    null,
    2,
  ),
);
