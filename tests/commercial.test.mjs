import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { seedCommercial } from "./fixtures/commercial.mjs";
const c = await consumerDB(),
  { db, as, rpc, scalar, orgs, services } = c,
  f = await seedCommercial(c),
  results = [];
const ctx = (k = "A") =>
    rpc("commercial_context", { p_code: f.opportunities[k] }),
  list = (p_filters = {}) => rpc("commercial_list", { p_filters, p_offset: 0 });
async function test(name, fn) {
  await db.exec("begin");
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS " + name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.error("FAIL " + name + ": " + e.message);
  } finally {
    await db.exec("rollback;reset role");
  }
}
async function denied(fn, codes = ["42501"]) {
  await db.exec("savepoint denied");
  try {
    await fn();
  } catch (e) {
    await db.exec("rollback to savepoint denied");
    assert.ok(codes.includes(e.code), e.code + ": " + e.message);
    return;
  }
  throw Error("Expected denial");
}
const active = (x) =>
  x.tasks.find((t) => !["completed", "cancelled"].includes(t.state)) ||
  x.tasks[0];
async function act(action, data = {}, over = {}) {
  const t = active(await ctx());
  return rpc("commercial_task_act", {
    p_code: t.public_code,
    p_revision: t.revision,
    p_action: action,
    p_data: data,
    p_key: randomUUID(),
    ...over,
  });
}
async function opAct(action, data = {}) {
  const x = await ctx();
  return rpc("commercial_op_act", {
    p_code: x.code,
    p_revision: x.revision,
    p_action: action,
    p_data: data,
    p_key: randomUUID(),
  });
}
async function claim() {
  await as("agentA");
  await act("claim");
}
async function start() {
  await claim();
  await act("start");
}
async function cfg(data) {
  await as("adminA");
  const x = await rpc("commercial_config", { p_org: orgs.A });
  await rpc("commercial_config_save", {
    p_org: orgs.A,
    p_revision: x.settings.revision,
    p_data: data,
  });
}
async function rule(data) {
  await as("adminA");
  return rpc("commercial_rule_save", {
    p_org: orgs.A,
    p_id: null,
    p_revision: 0,
    p_data: data,
  });
}
async function effective() {
  await db.exec("reset role");
  return scalar("select private.commercial_effective($1,$2,'quote_followup')", [
    orgs.A,
    services.A[0],
  ]);
}
const result = (outcome, extra = {}) =>
  act("result", { outcome, note: "", ...extra });
async function approve(code = f.requests.A) {
  await as("alice");
  const x = await rpc("consumer_request_context", { p_code: code });
  await rpc("consumer_approve_quote", {
    p_code: code,
    p_version: x.current_version,
    p_key: randomUUID(),
  });
}
async function newInterest(contact = true) {
  await as(contact ? "alice" : "charlie");
  const p = await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" }),
    s = p.services.find((s) => s.price_mode === "fixed");
  return rpc("consumer_create_request", {
    p_slug: p.slug,
    p_revision: p.revision,
    p_service: s.code,
    p_addons: [],
    p_answers: { [s.questions[0].code]: "Teste" },
    p_customer: {
      name: "Ana Teste",
      whatsapp: "81999990000",
      accepted_notice: true,
      notice_version: "consumer-v1",
    },
    p_notes: "",
    p_contact: contact,
    p_expected_cents: s.price_cents,
    p_key: randomUUID(),
  });
}
await test("01 Isolamento A/B na lista, contexto e RLS", async () => {
  await as("agentA");
  assert.equal((await list()).items.length, 1);
  await denied(() => ctx("B"));
  assert.equal(
    (
      await db.query(
        "select * from commercial_tasks where organization_id=$1",
        [orgs.B],
      )
    ).rows.length,
    0,
  );
});
await test("02 Atendente sem vínculo não acessa comercial", async () => {
  await as("worker");
  await denied(() => ctx());
  assert.equal((await list()).items.length, 0);
});
await test("03 Empresa suspensa impede novas operações", async () => {
  await claim();
  await db.exec("reset role");
  await db.query("update organizations set status='suspended' where id=$1", [
    orgs.A,
  ]);
  await as("agentA");
  await denied(() => ctx());
});
await test("04 Vínculo revogado impede operação com sessão existente", async () => {
  await claim();
  await as("root");
  await scalar("select foundation_set_attendant($1,$2,'primary','suspended')", [
    orgs.A,
    users.agentA,
  ]);
  await as("agentA");
  await denied(() => act("start"));
});
await test("05 Conciliação repetida não duplica tarefa", async () => {
  await as("agentA");
  const n = (await ctx()).tasks.length;
  for (let i = 0; i < 3; i++)
    await rpc("commercial_refresh", { p_org: orgs.A });
  assert.equal((await ctx()).tasks.length, n);
});
await test("06 Assunções intercaladas em série têm um vencedor", async () => {
  await as("agentA");
  const t = active(await ctx());
  await act("claim");
  await as("backup");
  await denied(() => act("claim", {}, { p_revision: t.revision }), ["40001"]);
});
await test("07 Resultados intercalados em série não duplicam execução", async () => {
  await start();
  const t = active(await ctx());
  await result("no_response");
  await denied(
    () =>
      act(
        "result",
        { outcome: "no_response" },
        { p_revision: t.revision, p_code: t.public_code },
      ),
    ["40001"],
  );
  assert.equal((await ctx()).attempts.length, 1);
});
await test("08 Revisão obsoleta não sobrescreve tarefa", async () => {
  await claim();
  const t = active(await ctx());
  await act("priority", { priority: 2 });
  await denied(
    () => act("priority", { priority: 0 }, { p_revision: t.revision }),
    ["40001"],
  );
  assert.equal(active(await ctx()).priority, 2);
});
await test("09 Regra específica prevalece sobre serviço", async () => {
  await rule({
    service_id: services.A[0],
    interval_minutes: 360,
    max_attempts: 3,
  });
  await rule({
    service_id: services.A[0],
    kind: "quote_followup",
    interval_minutes: 17,
    max_attempts: 1,
  });
  const x = await effective();
  assert.equal(x.interval_minutes, 17);
  assert.equal(x.max_attempts, 1);
  assert.equal(x.interval_source, "rule");
});
await test("10 Serviço prevalece sobre empresa", async () => {
  await rule({
    service_id: services.A[0],
    interval_minutes: 360,
    max_attempts: 3,
  });
  const x = await effective();
  assert.equal(x.interval_minutes, 360);
  assert.equal(x.interval_source, "service");
});
await test("11 Empresa prevalece sobre padrão", async () => {
  await cfg({ interval_minutes: 77, max_attempts: 4 });
  const x = await effective();
  assert.equal(x.interval_minutes, 77);
  assert.equal(x.max_attempts, 4);
  assert.equal(x.interval_source, "company");
});
await test("12 Padrão seguro 24 horas e duas tentativas", async () => {
  await cfg({ interval_minutes: null, max_attempts: null });
  const x = await effective();
  assert.equal(x.interval_minutes, 1440);
  assert.equal(x.max_attempts, 2);
});
await test("13 Limite impede terceira tentativa", async () => {
  await start();
  await result("no_response");
  await db.exec(
    "reset role;update commercial_tasks set due_at=now()-interval '1 minute' where state='pending'",
  );
  await start();
  await result("no_response");
  assert.equal((await ctx()).state, "no_response");
  assert.equal((await ctx()).attempts.length, 2);
  await rpc("commercial_refresh", { p_org: orgs.A });
  assert.ok(
    (await ctx()).tasks.every((t) =>
      ["completed", "cancelled"].includes(t.state),
    ),
  );
});
await test("14 Ausência de consentimento impede abandono recuperável", async () => {
  await newInterest(false);
  await as("agentA");
  const item = (await list()).items.find((x) => x.state === "interested");
  assert.ok(item);
  assert.equal(
    (await rpc("commercial_context", { p_code: item.code })).tasks.length,
    0,
  );
});
await test("15 Revogação de consentimento interrompe tarefa", async () => {
  await start();
  await as("alice");
  await rpc("consumer_set_contact", { p_code: f.requests.A, p_allowed: false });
  await as("agentA");
  assert.equal(active(await ctx()).state, "cancelled");
  assert.equal((await ctx()).contact, null);
  await denied(() => act("start"), ["22023"]);
});
await test("16 Resposta do consumidor invalida retorno e revisão antiga", async () => {
  await start();
  const t = active(await ctx());
  await as("alice");
  await rpc("central_consumer_send", {
    p_request: f.requests.A,
    p_body: "Voltei",
    p_key: randomUUID(),
  });
  await as("agentA");
  assert.equal((await ctx()).state, "responded");
  await denied(
    () => act("result", { outcome: "no_response" }, { p_revision: t.revision }),
    ["40001"],
  );
  assert.equal((await ctx()).attempts.length, 0);
});
await test("17 Aprovação real cancela retorno de orçamento antigo", async () => {
  await as("agentA");
  const t = active(await ctx());
  await approve();
  await as("agentA");
  assert.equal((await ctx()).state, "approved");
  assert.equal(
    (await ctx()).tasks.find((x) => x.id === t.id).state,
    "cancelled",
  );
  assert.equal(active(await ctx()).kind, "approval_followup");
});
await test("18 Recusa real encerra recuperação", async () => {
  await as("alice");
  const x = await rpc("consumer_request_context", { p_code: f.requests.A });
  await rpc("consumer_decline_quote", {
    p_code: f.requests.A,
    p_version: x.current_version,
    p_key: randomUUID(),
  });
  await as("agentA");
  assert.equal((await ctx()).state, "refused");
});
await test("19 Conversão exige agendamento confirmado e evento real", async () => {
  await approve();
  const p = await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" }),
    s = p.services.find((s) => s.price_mode === "fixed");
  const slots = await rpc("consumer_slots", {
    p_slug: p.slug,
    p_service: s.code,
    p_addons: [],
    p_day: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  });
  await rpc("consumer_book", {
    p_code: f.requests.A,
    p_start: slots[0],
    p_previous: null,
    p_key: randomUUID(),
  });
  await as("agentA");
  assert.equal((await ctx()).state, "converted");
  assert.equal(
    (await ctx()).events.filter((e) => e.event === "converted").length,
    1,
  );
});
await test("20 Perda terminal vence conversão posterior sem apagar histórico", async () => {
  await as("agentA");
  await opAct("lose", { reason: "price" });
  await approve();
  await as("agentA");
  assert.equal((await ctx()).state, "lost");
});
await test("21 Novo interesse não apaga oportunidade perdida", async () => {
  await as("agentA");
  await opAct("lose", { reason: "price" });
  await newInterest();
  await as("agentA");
  assert.equal((await list()).items.length, 2);
  assert.equal((await ctx()).state, "lost");
});
await test("22 Fora da janela impede contato e concilia prazo", async () => {
  await cfg({ contact_hours: [{ day: 1, open: "01:00", close: "01:01" }] });
  await claim();
  await denied(() => act("start"), ["22023"]);
  await rpc("commercial_refresh", { p_org: orgs.A });
  assert.ok(new Date(active(await ctx()).due_at) > new Date());
});
await test("23 Fuso e fim de semana produzem próxima janela determinística", async () => {
  await cfg({ contact_hours: [{ day: 1, open: "08:00", close: "18:00" }] });
  await db.exec("reset role");
  assert.equal(
    new Date(
      await scalar("select private.commercial_window($1,$2)", [
        orgs.A,
        "2026-09-19T12:00:00Z",
      ]),
    ).toISOString(),
    "2026-09-21T11:00:00.000Z",
  );
});
await test("24 Tarefa atrasada aparece no filtro sem mover prazo dentro da janela", async () => {
  await as("agentA");
  const before = active(await ctx()).due_at;
  await rpc("commercial_refresh", { p_org: orgs.A });
  assert.equal(active(await ctx()).due_at, before);
  assert.equal((await list({ view: "overdue" })).items.length, 1);
});
await test("25 Transferência auditada bloqueia responsável anterior", async () => {
  await claim();
  await act("transfer", { user_id: users.backup });
  await denied(() => act("start"));
  await as("backup");
  await act("start");
  assert.ok((await ctx()).events.some((e) => e.event === "transferred"));
});
await test("26 Motivo de perda configurável e validado", async () => {
  await cfg({ loss_reasons: ["custom_reason"] });
  await as("agentA");
  await denied(() => opAct("lose", { reason: "invented" }), ["22023"]);
  await opAct("lose", { reason: "custom_reason" });
  assert.equal((await ctx()).loss_reason, "custom_reason");
});
await test("27 Origem simples preservada e filtrável", async () => {
  await as("agentA");
  assert.equal((await ctx()).source, "direct");
  assert.equal((await list({ source: "direct" })).items.length, 1);
  assert.equal((await list({ source: "google" })).items.length, 0);
});
await test("28 Integração reutiliza mesmo ticket e solicitação", async () => {
  await as("agentA");
  const x = await ctx();
  assert.equal(x.ticket, f.codes.A);
  assert.equal(x.request, f.requests.A);
  assert.ok(active(x).ticket_id);
});
await test("29 Snapshot e valor de proposta existente preservados", async () => {
  await as("agentA");
  assert.equal((await ctx()).value, 12000);
  assert.equal((await ctx()).service, "Lavagem de cuidado");
});
await test("30 Resultado não inventa aprovação ou agendamento", async () => {
  await start();
  await denied(() => result("approved"), ["23514"]);
  await denied(() => result("booked"), ["23514"]);
});
await test("31 Notas comerciais não vazam a consumidor nem a oportunidade original", async () => {
  await start();
  await result("other", { note: "SEGREDO_INTERNO" });
  await as("alice");
  for (const t of [
    "commercial_opportunity_state",
    "commercial_tasks",
    "commercial_attempts",
    "commercial_events",
  ])
    assert.equal((await db.query("select * from " + t)).rows.length, 0);
  assert.ok(
    !JSON.stringify(
      (await db.query("select * from opportunities")).rows,
    ).includes("commercial_"),
  );
  assert.ok(
    !JSON.stringify(
      await rpc("central_consumer_thread", { p_request: f.requests.A }),
    ).includes("SEGREDO_INTERNO"),
  );
});
await test("32 Busca e filtros não descobrem empresa B", async () => {
  await as("agentA");
  assert.equal((await list({ org: orgs.B })).items.length, 0);
  assert.equal((await list({ search: "Bruno" })).items.length, 0);
  assert.equal(
    (await list({ search: "Ana", kind: "quote_followup" })).items.length,
    1,
  );
});
await test("33 Repetição idempotente tem um efeito e payload divergente falha", async () => {
  await start();
  const t = active(await ctx()),
    args = {
      p_code: t.public_code,
      p_revision: t.revision,
      p_action: "result",
      p_data: { outcome: "other", note: "Teste real" },
      p_key: randomUUID(),
    };
  await rpc("commercial_task_act", args);
  await rpc("commercial_task_act", args);
  assert.equal((await ctx()).attempts.length, 1);
  await denied(
    () =>
      rpc("commercial_task_act", { ...args, p_data: { outcome: "refused" } }),
    ["22023", "23505"],
  );
});
await test("34 FK composta impede cruzamento entre empresas", async () => {
  await db.exec("reset role");
  await denied(
    () =>
      db.query(
        "update commercial_tasks set organization_id=$1 where organization_id=$2",
        [orgs.B, orgs.A],
      ),
    ["23503"],
  );
});
await test("35 Consumidor não acessa RPC comercial; telefone igual não autentica", async () => {
  await as("alice");
  await denied(() => ctx());
  await as("bob");
  await denied(() => ctx());
  await as("anon");
  await denied(() => ctx());
});
await test("36 75 tabelas mantêm RLS FORCE e nenhuma escrita direta", async () => {
  await db.exec("reset role");
  const r = await db.query(
    "select relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'",
  );
  assert.equal(r.rows.length, 75);
  assert.ok(r.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity));
  await as("agentA");
  await denied(() => db.exec("update commercial_tasks set priority=2"));
});
await test("37 Remoção de autonomia bloqueia operações subsequentes", async () => {
  await start();
  await db.exec("reset role");
  await db.query(
    "update attendant_permissions set allowed_actions=array_remove(allowed_actions,'follow_up') where organization_id=$1",
    [orgs.A],
  );
  await as("agentA");
  await denied(() => result("no_response"));
});
await test("38 Presença pausada impede assumir; presença não concede vínculo", async () => {
  await as("agentA");
  await rpc("central_presence", { p_state: "pause" });
  await denied(() => act("claim"));
  await as("worker");
  await denied(() => ctx());
});
await test("39 Configuração exige administrador, revisão e auditoria", async () => {
  await as("agentA");
  await denied(() =>
    rpc("commercial_config_save", {
      p_org: orgs.A,
      p_revision: 2,
      p_data: { max_attempts: 10 },
    }),
  );
  await cfg({ interval_minutes: 333 });
  await denied(
    () =>
      rpc("commercial_config_save", {
        p_org: orgs.A,
        p_revision: 1,
        p_data: { enabled: false },
      }),
    ["40001"],
  );
  await db.exec("reset role");
  assert.ok(
    Number(
      await scalar(
        "select count(*) from audit_logs where entity_table='commercial_settings'",
      ),
    ) > 0,
  );
});
await test("40 Reagendamento preserva tentativa; outro exige observação", async () => {
  await start();
  await denied(() => result("other"), ["23514"]);
  await act("reschedule", {
    due_at: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(active(await ctx()).attempt, 1);
  assert.equal((await ctx()).attempts.length, 0);
});
await test("41 Configuração nova não altera snapshot realizado", async () => {
  await start();
  await result("no_response");
  await cfg({ interval_minutes: 999, max_attempts: 1 });
  await as("agentA");
  assert.equal(
    (await ctx()).tasks.find((t) => t.state === "completed").rule_snapshot
      .interval_minutes,
    120,
  );
  await denied(() => act("claim"));
});
await test("42 Recuperação desligada cancela sem disparo automático", async () => {
  await cfg({ enabled: false });
  await as("agentA");
  assert.equal(active(await ctx()).state, "cancelled");
  assert.equal(
    (await rpc("central_context", { p_code: f.codes.A })).messages.length,
    1,
  );
});
await test("43 Tarefa de administrador não pode ser tomada por atendente", async () => {
  await as("adminA");
  await act("claim");
  await as("backup");
  await denied(() => act("claim"), ["40001"]);
});
await test("44 Outro responsável não pode encerrar nem reprogramar oportunidade", async () => {
  await claim();
  await as("backup");
  await denied(() => opAct("lose", { reason: "price" }));
  await denied(() =>
    opAct("schedule", {
      due_at: new Date(Date.now() + 86400000).toISOString(),
    }),
  );
});
await test("45 Rascunho persistido e autorizado permite tarefa de abandono", async () => {
  const q = await newInterest();
  await as("agentA");
  const items = (await list({ view: "abandoned" })).items;
  assert.equal(items.length, 1);
  const x = await rpc("commercial_context", { p_code: items[0].code });
  assert.equal(x.request, q.code);
  assert.equal(x.ticket, null);
  assert.equal(x.request_state, "draft");
});
await test("46 Serviço desativado impede retorno em sessão aberta", async () => {
  await start();
  await db.exec("reset role");
  await db.query("update services set active=false where id=$1", [
    services.A[0],
  ]);
  await as("agentA");
  await denied(() => result("no_response"));
});
await test("47 Janela vazia cancela tarefa vencida", async () => {
  await cfg({ contact_hours: [] });
  await as("agentA");
  await rpc("commercial_refresh", { p_org: orgs.A });
  assert.equal(active(await ctx()).state, "cancelled");
});
await test("48 Elevar limite não amplia ciclo já iniciado", async () => {
  await start();
  await cfg({ max_attempts: 10 });
  await as("agentA");
  await result("no_response");
  assert.equal(active(await ctx()).max_attempts, 2);
});
await test("49 Aprovação real converte novo interesse sob critério configurado", async () => {
  await cfg({ conversion_criterion: "approval" });
  const q = await newInterest();
  await rpc("consumer_submit_request", {
    p_code: q.code,
    p_attachment_count: 0,
    p_key: randomUUID(),
  });
  await as("adminA");
  const x = await rpc("consumer_request_context", { p_code: q.code });
  await rpc("consumer_send_quote", {
    p_code: q.code,
    p_items: [{ name: "Serviço fictício", quantity: 1, unit_cents: 12000 }],
    p_duration: 60,
    p_expires: new Date(Date.now() + 86400000).toISOString(),
    p_expected_revision: x.revision,
    p_key: randomUUID(),
  });
  await approve(q.code);
  await as("agentA");
  assert.equal((await list({ state: "converted" })).items.length, 1);
});
await test("50 Helpers privados não estão executáveis por clientes", async () => {
  await db.exec("reset role");
  assert.equal(
    Number(
      await scalar(
        "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'commercial_%' and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute'))",
      ),
    ),
    0,
  );
});
await test("51 FK rejeita evento de conversão de outra empresa", async () => {
  await db.exec("reset role");
  const e = await scalar(
    "select id from request_events where organization_id=$1 limit 1",
    [orgs.B],
  );
  await denied(
    () =>
      db.query(
        "update commercial_opportunity_state set commercial_state='converted',commercial_conversion_event=$1,commercial_converted_at=now() where commercial_code=$2",
        [e, f.opportunities.A],
      ),
    ["23503"],
  );
});
await test("52 Timeline ordena eventos reais na mesma transação", async () => {
  await as("agentA");
  const ev = (await ctx()).events.map((e) => e.event);
  assert.ok(ev.indexOf("interest") < ev.indexOf("requested"));
  assert.ok(ev.indexOf("requested") < ev.indexOf("quote_sent"));
  assert.ok(ev.indexOf("quote_sent") < ev.indexOf("scheduled"));
});
await test("53 Tentativas e eventos realizados são imutáveis", async () => {
  await start();
  await result("other", { note: "Registro fictício" });
  await db.exec("reset role");
  await denied(
    () => db.exec("update commercial_attempts set note='changed'"),
    ["23514"],
  );
  await denied(() => db.exec("delete from commercial_events"), ["23514"]);
});
await test("54 Proposta expirada interrompe retorno sem modificar versão imutável", async () => {
  await db.exec("reset role");
  const q = (
    await db.query("select * from quote_requests where public_code=$1", [
      f.requests.A,
    ])
  ).rows[0];
  const id = await scalar(
    "insert into quote_versions(organization_id,request_id,version,kind,state,price_mode,total_cents,duration_minutes,expires_at,created_by) values($1,$2,99,'final','sent','fixed',12000,60,now()-interval '1 hour',$3) returning id",
    [orgs.A, q.id, users.adminA],
  );
  await db.query(
    "update quote_requests set current_version_id=$1 where id=$2",
    [id, q.id],
  );
  await as("agentA");
  await denied(() => act("claim"));
  await rpc("commercial_refresh", { p_org: orgs.A });
  assert.equal((await ctx()).state, "expired");
  assert.ok((await ctx()).tasks.every((t) => t.state === "cancelled"));
});
await db.close();
await writeFile(
  "reports/commercial-results.json",
  JSON.stringify(
    {
      environment:
        "LOCAL PGlite; Auth/claims simulados; interleavings seriais, não conexões independentes",
      tests: results,
      passed: results.filter((x) => x.status === "PASS").length,
      failed: results.filter((x) => x.status === "FAIL").length,
    },
    null,
    2,
  ),
);
if (results.some((x) => x.status === "FAIL")) process.exitCode = 1;
