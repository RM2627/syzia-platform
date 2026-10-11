import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
Object.assign(process.env, {
  SYZIA_TEAM_CURRENT: "1",
  SYZIA_FLEXIBLE_CURRENT: "1",
  SYZIA_BILLING_CURRENT: "1",
  SYZIA_OPTIONAL_MANUAL_CURRENT: "1",
  SYZIA_OPERATION_CURRENT: "1",
});
const socket = process.env.FOUNDATION_NATIVE_SOCKET;
if (!socket?.startsWith("/")) throw Error("Disposable local socket required");
const h = await import("../support/current-db.mjs");
const { db, as, rpc, scalar, orgs, users } = h;
async function call(user, name, args) {
  const c = new pg.Client({
    host: socket,
    user: "postgres",
    database: "foundation_phase2_test",
  });
  await c.connect();
  try {
    await c.query("begin");
    await c.query("set local statement_timeout='15s'");
    await c.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({
        sub: users[user],
        is_anonymous: ["alice", "bob", "charlie"].includes(user),
      }),
    ]);
    await c.query("set local role authenticated");
    const r = await c.query(
      `select public.${name}(${args.map((_, n) => "$" + (n + 1)).join(",")}) result`,
      args,
    );
    await c.query("commit");
    return r.rows[0].result;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    await c.end();
  }
}
try {
  await db.exec("commit;reset role;begin");
  const setup = await h.setup();
  await as("adminA");
  const ctx = await rpc("company_context", { p_org: orgs.A });
  const args = [
    orgs.A,
    setup.id,
    ctx.settings.revision,
    JSON.stringify({ description: "Concorrência fictícia" }),
    0,
    JSON.stringify([{ title: "Etapa única" }]),
    randomUUID(),
  ];
  await db.exec("commit;reset role");
  const results = await Promise.all([
    call("adminA", "company_service_save_with_checklist", args),
    call("adminA", "company_service_save_with_checklist", args),
  ]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(
    await scalar(
      "select count(*)::int from private.service_checklist_items where service_id=$1",
      [setup.id],
    ),
    1,
  );
  console.log("PASS HF-N01 duas transações, mesma chave de modelo: um efeito");
  await db.exec("begin");
  await as("adminA");
  const next = await rpc("company_context", { p_org: orgs.A });
  await db.exec("commit;reset role");
  const edits = [
    orgs.A,
    setup.id,
    next.settings.revision,
    JSON.stringify({ description: "Edição simultânea" }),
    1,
    JSON.stringify([{ title: "Etapa futura" }]),
    randomUUID(),
  ];
  const race = await Promise.allSettled([
    call("adminA", "company_service_save_with_checklist", edits),
    call("adminA", "company_service_save_with_checklist", [
      ...edits.slice(0, -1),
      randomUUID(),
    ]),
  ]);
  assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(race.find((x) => x.status === "rejected").reason.code, "40001");
  console.log(
    "PASS HF-N02 duas abas com revisões iguais: conflito, sem perda silenciosa",
  );
  await db.exec("begin");
  const p = await h.publish(),
    s = p.services.find((x) => x.code === setup.s.code),
    q = await h.draft(p, [h.empty(s)]),
    start = (await h.slots(p, [h.empty(s)]))[0];
  await db.exec("commit;reset role");
  const booking = [q.code, start, 0, randomUUID()];
  const bookings = await Promise.all([
    call("alice", "consumer_complete_journey", booking),
    call("alice", "consumer_complete_journey", booking),
  ]);
  assert.deepEqual(bookings[0], bookings[1]);
  assert.equal(
    await scalar(
      "select count(*)::int from appointments where request_id=(select id from quote_requests where public_code=$1)",
      [q.code],
    ),
    1,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from private.execution_checklist where appointment_id in(select id from appointments where request_id=(select id from quote_requests where public_code=$1))",
      [q.code],
    ),
    1,
  );
  console.log("PASS HF-N03 criação simultânea de agendamento: snapshot único");
  const l = await call("adminA", "operations_tracking_link", [
    orgs.A,
    q.code,
    "issue",
  ]);
  const redeem = await Promise.allSettled([
    call("bob", "consumer_redeem_tracking_link", [q.code, l.secret]),
    call("charlie", "consumer_redeem_tracking_link", [q.code, l.secret]),
  ]);
  assert.equal(redeem.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    redeem.find((x) => x.status === "rejected").reason.code,
    "42501",
  );
  console.log(
    "PASS HF-N04 resgate concorrente em navegadores diferentes: apenas um vínculo",
  );
} finally {
  await db.close();
}
