import {authorizeSupport} from "./support/authorized-support.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { seedCentral } from "./fixtures/central.mjs";
const c = await consumerDB(),
  { db, as, rpc, orgs, scalar } = c,
  results = [];
await seedCentral(c, { tickets: false });
async function denied(fn, codes = ["42501"]) {
  await db.exec("savepoint rejection");
  try {
    await fn();
  } catch (e) {
    await db.exec("rollback to savepoint rejection");
    assert.ok(codes.includes(e.code), e.code + ": " + e.message);
    return;
  }
  throw Error("Expected rejection");
}
async function test(name, fn) {
  await db.exec("begin");
  try {
    await as("adminA");
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS " + name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.error("FAIL " + name + ": " + e.stack);
  } finally {
    await db.exec("rollback;reset role");
  }
}
const customer = (over = {}, key = randomUUID(), org = orgs.A) =>
  rpc("operations_customer", {
    p_org: org,
    p_data: {
      name: "Cliente inteiramente fictício",
      whatsapp: "81999990000",
      accepted_notice: true,
      contact: false,
      ...over,
    },
    p_key: key,
  });
async function request(org = orgs.A) {
  const d = await rpc("operations_directory", {
      p_org: org,
      p_search: "",
      p_offset: 0,
    }),
    s = d.catalog.services.find((s) => s.price_mode === "fixed"),
    id = await customer({}, randomUUID(), org);
  return rpc("operations_request", {
    p_org: org,
    p_customer: id,
    p_service: s.code,
    p_addons: [],
    p_answers: Object.fromEntries(
      s.questions.map((q) => [q.code, "Veículo fictício"]),
    ),
    p_notes: "Anotação fictícia",
    p_source: "whatsapp",
    p_key: randomUUID(),
  });
}
const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
async function book(q, start = day + "T12:00:00Z", key = randomUUID()) {
  return rpc("operations_schedule", {
    p_org: orgs.A,
    p_request: q.id,
    p_start: start,
    p_duration: 60,
    p_note: "Atendimento fictício",
    p_key: key,
  });
}
const act = (a, action, data = {}, key = randomUUID()) =>
  rpc("operations_appointment_act", {
    p_org: orgs.A,
    p_id: a.id,
    p_revision: a.revision,
    p_action: action,
    p_data: data,
    p_key: key,
  });
await test("Cliente manual preserva finalidade, idempotência e não mescla telefone", async () => {
  const key = randomUUID(),
    a = await customer({}, key);
  assert.equal(await customer({}, key), a);
  const b = await customer();
  assert.notEqual(a, b);
  assert.equal(
    await scalar("select user_id from customers where id=$1", [a]),
    null,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from customer_consents where customer_id=$1",
      [a],
    ),
    1,
  );
  await denied(() => customer({ accepted_notice: false }), ["22023"]);
  await denied(() => customer({ user_id: users.alice }), ["22023"]);
});
await test("Solicitação manual calcula estimativa no banco e vincula cliente/oportunidade", async () => {
  const q = await request(),
    d = await rpc("operations_quote_context", {
      p_org: orgs.A,
      p_code: q.code,
    });
  assert.equal(d.versions[0].total_cents, 12000);
  assert.equal(d.versions[0].kind, "estimate");
  assert.equal(d.state, "submitted");
  assert.equal(
    await scalar(
      "select count(*)::int from opportunities where organization_id=$1",
      [orgs.A],
    ),
    1,
  );
});
await test("Agendamento manual reutiliza reserva e rejeita conflito sem duplicar", async () => {
  const q = await request(),
    key = randomUUID(),
    a = await book(q, day + "T12:00:00Z", key);
  assert.deepEqual(await book(q, day + "T12:00:00Z", key), a);
  await denied(async () => book(await request()), ["23P01"]);
  assert.equal(
    await scalar(
      "select count(*)::int from appointments where organization_id=$1 and state='confirmed'",
      [orgs.A],
    ),
    1,
  );
});
await test("Remarcação malsucedida preserva horário original e sucesso gera histórico", async () => {
  let a = await book(await request());
  await book(await request(), day + "T15:00:00Z");
  await denied(
    () => act(a, "reschedule", { start: day + "T15:00:00Z" }),
    ["23P01"],
  );
  assert.equal(
    new Date(
      await scalar("select starts_at from appointments where id=$1", [a.id]),
    ).toISOString(),
    new Date(a.starts_at).toISOString(),
  );
  a = await act(a, "reschedule", { start: day + "T17:00:00Z" });
  assert.equal(a.revision, 2);
  assert.equal(
    await scalar(
      "select count(*)::int from appointment_events where appointment_id=$1 and event='rescheduled'",
      [a.id],
    ),
    1,
  );
});
await test("Ciclo iniciar/concluir é auditado, idempotente e não cria receita", async () => {
  let a = await book(await request());
  await denied(() => act(a, "complete"), ["22023"]);
  await denied(() => act(a, "start"), ["22023"]);
  await db.exec("reset role");
  await db.query(
    "update appointments set starts_at=now()-interval '10 minutes',ends_at=now()+interval '50 minutes' where id=$1",
    [a.id],
  );
  await as("adminA");
  a = (await rpc("operations_detail", { p_org: orgs.A, p_id: a.id }))
    .appointment;
  a = await act(a, "start");
  const key = randomUUID(),
    completed = await act(a, "complete", {}, key);
  assert.deepEqual(await act(a, "complete", {}, key), completed);
  assert.equal(completed.execution_state, "completed");
  const localDay=await scalar("select (now() at time zone 'America/Recife')::date::text");
  const metrics=await rpc('analytics_company',{p_org:orgs.A,p_from:localDay,p_to:localDay,p_service:null,p_source:null});
  assert.equal(metrics.execution.completed,1);assert.equal(metrics.execution.revenue_cents,null);assert.equal(metrics.values.revenue_cents,null);

  await denied(() => act(completed, "cancel"), ["22023"]);
  assert.equal(
    await scalar(
      "select count(*)::int from request_events where request_id=$1 and event='service_completed'",
      [a.request_id],
    ),
    1,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from quote_versions where request_id=$1 and kind='final'",
      [a.request_id],
    ),
    0,
  );
});
await test("Cancelamento libera horário sem apagar ficha ou histórico", async () => {
  let a = await book(await request());
  a = await act(a, "cancel");
  assert.equal(a.state, "cancelled");
  assert.ok(
    (
      await rpc("operations_detail", { p_org: orgs.A, p_id: a.id })
    ).history.some((e) => e.event === "cancelled"),
  );
  await book(await request());
});
await test("Troca de empresa/UUID não abre dados operacionais para usuários empresariais", async () => {
  const a = await book(await request());
  for (const who of ["adminB", "worker", "alice"]) {
    await as(who);
    await denied(() => rpc("operations_detail", { p_org: orgs.A, p_id: a.id }));
    await denied(() => rpc("operations_home", { p_org: orgs.A }));
    await denied(() => customer());
    assert.equal(
      (await db.query("select * from appointment_events")).rows.length,
      0,
    );
  }
});
await test("Escopo explícito de orçamento rejeita código de B mesmo para gestor de A e B", async () => {
  await as("adminB");
  const q = await request(orgs.B);
  await as("adminB");
  await scalar("select foundation_set_member($1,$2,'admin_empresa','active')", [
    orgs.B,
    users.adminA,
  ]);
  await as("adminA");
  await denied(() =>
    rpc("operations_quote_context", { p_org: orgs.A, p_code: q.code }),
  );
  assert.ok(
    await rpc("operations_quote_context", { p_org: orgs.B, p_code: q.code }),
  );
});
await test("Notificações são da empresa e leitura pertence ao gestor", async () => {
  await book(await request());
  let home = await rpc("operations_home", { p_org: orgs.A });
  assert.ok(home.notifications.length);
  const id = home.notifications[0].id;
  await rpc("operations_read_notification", { p_org: orgs.A, p_id: id });
  home = await rpc("operations_home", { p_org: orgs.A });
  assert.equal(home.notifications.find((n) => n.id === id).read, true);
  await as("adminB");
  await denied(() =>
    rpc("operations_read_notification", { p_org: orgs.B, p_id: id }),
  );
  assert.equal((await db.query("select * from notifications")).rows.length, 0);
});
await test("Atendente próprio atua só na empresa e nunca consulta métricas de gestão", async () => {
  await rpc("operations_set_attendant", {
    p_org: orgs.A,
    p_user: users.worker,
    p_enabled: true,
  });
  await rpc("operations_support_mode", {
    p_org: orgs.A,
    p_mode: "mixed",
    p_revision: await scalar(
      "select revision from company_settings where organization_id=$1",
      [orgs.A],
    ),
  });
  await scalar("select company_set_activation($1,$2,true,true)", [
    orgs.A,
    await scalar(
      "select revision from company_settings where organization_id=$1",
      [orgs.A],
    ),
  ]);
  await as("worker");
  await rpc("central_presence", { p_state: "available" });
  await db.exec("reset role");
  assert.equal(
    await scalar("select private.central_eligible($1,$2)", [
      orgs.A,
      users.worker,
    ]),
    true,
  );
  assert.equal(
    await scalar("select private.central_eligible($1,$2)", [
      orgs.B,
      users.worker,
    ]),
    false,
  );
  await as("worker");
  await denied(() =>
    rpc("analytics_central", { p_org: orgs.A, p_from: day, p_to: day }),
  );
  await denied(() => rpc("operations_home", { p_org: orgs.A }));
  await denied(() =>
    db.query("update organization_members set is_attendant=true"),
  );
  await as("adminA");
  await rpc("operations_set_attendant", {
    p_org: orgs.A,
    p_user: users.worker,
    p_enabled: false,
  });
  await db.exec("reset role");
  assert.equal(
    await scalar("select private.central_eligible($1,$2)", [
      orgs.A,
      users.worker,
    ]),
    false,
  );
});
await test("Período inválido e revisão antiga não alteram dados", async () => {
  await denied(
    () =>
      rpc("operations_agenda", {
        p_org: orgs.A,
        p_from: "2026-01-01",
        p_to: "2026-12-31",
      }),
    ["22023"],
  );
  const a = await book(await request());
  await act(a, "cancel");
  await denied(
    () => act(a, "reschedule", { start: day + "T17:00:00Z" }),
    ["40001"],
  );
});
await test("Vínculo próprio é atômico, promoção limpa marca e colaborador não concede papéis",async()=>{
 await rpc('operations_member',{p_org:orgs.A,p_user:users.worker,p_role:'own_attendant',p_status:'active'});
 assert.equal(await scalar('select is_attendant from organization_members where organization_id=$1 and user_id=$2',[orgs.A,users.worker]),true);
 await as('worker');await denied(()=>rpc('operations_member',{p_org:orgs.A,p_user:users.worker,p_role:'admin_empresa',p_status:'active'}));
 await as('adminA');await rpc('operations_member',{p_org:orgs.A,p_user:users.worker,p_role:'admin_empresa',p_status:'active'});
 assert.equal(await scalar('select is_attendant from organization_members where organization_id=$1 and user_id=$2',[orgs.A,users.worker]),false);
});
await test("Duração manipulada não encurta o serviço previsto",async()=>{const q=await request();await denied(()=>rpc('operations_schedule',{p_org:orgs.A,p_request:q.id,p_start:day+'T12:00:00Z',p_duration:1,p_note:'',p_key:randomUUID()}),['22023']);});
await test("Bloqueio usa a mesma capacidade do agendamento manual",async()=>{
 await rpc('consumer_schedule_block',{p_org:orgs.A,p_start:day+'T12:00:00Z',p_end:day+'T14:00:00Z',p_note:'Bloqueio fictício',p_key:randomUUID()});
 await denied(async()=>book(await request()),['23P01']);
 assert.equal(await scalar("select count(*)::int from appointments where organization_id=$1 and kind='booking'",[orgs.A]),0);
});
await test("Serviço desativado não gera contratação manual",async()=>{
 const q=await request();await db.exec('reset role');await db.query('update services set active=false where id=(select service_id from quote_requests where id=$1)',[q.id]);await as('adminA');await denied(()=>book(q),['22023']);
});
await test("Superadmin autorizado usa métricas atuais; função anterior continua privada",async()=>{
 await authorizeSupport({as,scalar},orgs.A,'adminA');assert.ok(await rpc('analytics_company',{p_org:orgs.A,p_from:day,p_to:day,p_service:null,p_source:null}));await denied(()=>rpc('analytics_company_before_operations',{p_org:orgs.A,p_from:day,p_to:day,p_service:null,p_source:null}));
});
await writeFile(
  "reports/operations-local.json",
  JSON.stringify(
    {
      environment:
        "LOCAL PostgreSQL/PGlite; Auth simulado; concorrência sequencial nesta suíte",
      tests: results,
      passed: results.filter((r) => r.status === "PASS").length,
      failed: results.filter((r) => r.status === "FAIL").length,
    },
    null,
    2,
  ),
);
await db.close();
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
