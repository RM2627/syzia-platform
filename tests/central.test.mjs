import {authorizeSupport} from "./support/authorized-support.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { seedCentral } from "./fixtures/central.mjs";
const c = await consumerDB(),
  { db, as, rpc, scalar, orgs, save } = c;
const { requests, codes } = await seedCentral(c),
  results = [];
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
async function denied(fn, accepted = ["42501"]) {
  await db.exec("savepoint rejection");
  try {
    await fn();
  } catch (e) {
    await db.exec("rollback to savepoint rejection");
    assert.ok(accepted.includes(e.code), e.code + ": " + e.message);
    return;
  }
  throw Error("Expected rejection");
}
const context = (code = codes.A) => rpc("central_context", { p_code: code });
const queue = (over = {}) =>
  rpc("central_queue", {
    p_org: null,
    p_search: "",
    p_state: null,
    p_mine: false,
    ...over,
  });
async function act(action, data = {}, over = {}) {
  const t = (await context()).ticket;
  return rpc("central_act", {
    p_code: codes.A,
    p_revision: t.revision,
    p_action: action,
    p_data: data,
    p_key: randomUUID(),
    ...over,
  });
}
async function claim() {
  await as("agentA");
  return act("claim");
}
const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
async function quote(over = {}) {
  const t = (await context()).ticket;
  return rpc("central_quote", {
    p_code: codes.A,
    p_revision: t.revision,
    p_discount: 10,
    p_expires: new Date(Date.now() + 86400000).toISOString(),
    p_reason: "Condição autorizada no manual",
    p_expected_cents: 10800,
    p_key: randomUUID(),
    ...over,
  });
}
async function book(start, over = {}) {
  const t = (await context()).ticket;
  return rpc("central_booking", {
    p_code: codes.A,
    p_revision: t.revision,
    p_action: "schedule",
    p_start: start,
    p_appointment: null,
    p_key: randomUUID(),
    ...over,
  });
}
await test("Atendente vinculado acessa ticket e somente snapshot publicado da empresa correta", async () => {
  await as("agentA");
  const x = await context();
  assert.equal(x.organization.id, orgs.A);
  assert.ok(x.manual.snapshot.quick_replies.length);
  assert.equal((await queue()).tickets.length, 1);
  assert.equal(x.customer.whatsapp, null);
});
await test("Sem vínculo, UUID/código conhecido não libera contexto, busca ou leitura direta", async () => {
  await as("agentB");
  await denied(() => context());
  assert.equal((await queue({ p_search: "Ana" })).tickets.length, 0);
  assert.equal(
    await scalar("select count(*) from tickets where organization_id=$1", [
      orgs.A,
    ]),
    0,
  );
  await as("worker");
  await denied(() => context());
});
await test("Multiempresa autorizado mantém tickets, manuais e respostas separados", async () => {
  await as("shared");
  assert.equal((await queue()).tickets.length, 2);
  const a = await context(),
    b = await context(codes.B);
  assert.notEqual(a.organization.id, b.organization.id);
  assert.match(a.manual.sections[0].content, / A/);
  assert.match(b.manual.sections[0].content, / B/);
});
await test("Empresa A não consulta, decide ou pesquisa tickets de B", async () => {
  await as("adminA");
  await denied(() => context(codes.B));
  assert.equal((await queue({ p_org: orgs.B })).tickets.length, 0);
});
await test("Ticket não associa cliente B à solicitação A mesmo em escrita privilegiada", async () => {
  await as("root");
  await db.exec("reset role");
  const b = await scalar(
    "select customer_id from tickets where public_code=$1",
    [codes.B],
  );
  await denied(
    () =>
      db.query("update tickets set customer_id=$1 where public_code=$2", [
        b,
        codes.A,
      ]),
    ["23503"],
  );
});
await test("Presença disponível não concede vínculo nem permite assumir outra empresa", async () => {
  await as("agentB");
  await rpc("central_presence", { p_state: "available" });
  await denied(() =>
    rpc("central_act", {
      p_code: codes.A,
      p_revision: 2,
      p_action: "claim",
      p_data: {},
      p_key: randomUUID(),
    }),
  );
  await as("worker");
  await denied(() => rpc("central_presence", { p_state: "available" }));
});
await test("Sessão de trabalho abre/fecha sem duplicar e pausa impede novas atribuições", async () => {
  await as("agentA");
  await rpc("central_presence", { p_state: "pause" });
  await denied(() => act("claim"));
  await rpc("central_presence", { p_state: "offline" });
  await rpc("central_presence", { p_state: "available" });
  assert.equal(
    await scalar(
      "select count(*) from work_sessions where user_id=$1 and ended_at is null",
      [users.agentA],
    ),
    1,
  );
});
await test("Duas tentativas com mesma revisão têm um único responsável (serial local)", async () => {
  await as("agentA");
  const revision = (await context()).ticket.revision;
  await act("claim");
  await as("backup");
  await denied(() => act("claim", {}, { p_revision: revision }), ["40001"]);
  assert.equal((await context()).ticket.assignee_id, users.agentA);
});
await test("Mensagem com revisão antiga falha e não sobrescreve nem duplica conversa", async () => {
  await claim();
  const rev = (await context()).ticket.revision;
  await act("message", {
    body: "Olá! Sou Alex, do atendimento compartilhado.",
  });
  await denied(
    () => act("message", { body: "Mensagem antiga" }, { p_revision: rev }),
    ["40001"],
  );
  assert.equal((await context()).messages.length, 2);
});
await test("Mensagem repetida com a mesma chave tem um efeito; payload alterado é recusado", async () => {
  await claim();
  const rev = (await context()).ticket.revision,
    key = randomUUID();
  const args = {
    p_code: codes.A,
    p_revision: rev,
    p_action: "message",
    p_data: { body: "Resposta humana" },
    p_key: key,
  };
  await rpc("central_act", args);
  await rpc("central_act", args);
  assert.equal((await context()).messages.length, 2);
  await denied(
    () => rpc("central_act", { ...args, p_data: { body: "Outro texto" } }),
    ["22023"],
  );
});
await test("Transferência revalida destinatário, revision e impede resposta do responsável anterior", async () => {
  await claim();
  const rev = (await context()).ticket.revision;
  await denied(() => act("transfer", { user_id: users.agentB }));
  await act("transfer", { user_id: users.backup });
  await denied(() => act("message", { body: "Não sou mais responsável" }));
  await as("backup");
  await denied(
    () => act("transfer", { user_id: users.shared }, { p_revision: rev }),
    ["40001"],
  );
  assert.equal((await context()).ticket.assignee_id, users.backup);
});
await test("Backup assume após devolução; histórico guarda autoria e atribuições", async () => {
  await claim();
  await act("return");
  await as("backup");
  await act("claim");
  const x = await context();
  assert.equal(x.ticket.assignee_id, users.backup);
  assert.ok(x.events.some((e) => e.event === "returned"));
  assert.ok(x.events.some((e) => e.author === "Bia • Fictícia"));
});
await test("Nota interna nunca aparece na projeção do consumidor nem na outra empresa", async () => {
  await claim();
  await act("note", { body: "INTERNO: confirmar exceção" });
  await as("alice");
  const pub = await rpc("central_consumer_thread", { p_request: requests.A });
  assert.ok(!JSON.stringify(pub).includes("INTERNO"));
  assert.equal(await scalar("select count(*) from ticket_notes"), 0);
  await as("agentB");
  assert.equal(await scalar("select count(*) from ticket_notes"), 0);
});
await test("Consumidor com mesmo telefone não acessa ou envia mensagem no ticket de outro", async () => {
  await as("bob");
  await denied(() => rpc("central_consumer_thread", { p_request: requests.A }));
  await denied(() =>
    rpc("central_consumer_send", {
      p_request: requests.A,
      p_body: "Invadir",
      p_key: randomUUID(),
    }),
  );
});
await test("Quick reply exige manual atual e edição só quando autorizada", async () => {
  await claim();
  const x = await context();
  await denied(() =>
    act("message", {
      body: "Alteração indevida",
      reply_index: 0,
      manual_id: x.manual.id,
    }),
  );
  await denied(
    () =>
      act("message", {
        body: x.manual.snapshot.quick_replies[0].body,
        reply_index: 0,
        manual_id: randomUUID(),
      }),
    ["40001"],
  );
  await act("message", {
    body: x.manual.snapshot.quick_replies[0].body,
    reply_index: 0,
    manual_id: x.manual.id,
  });
  assert.equal(
    (await context()).messages.at(-1).body,
    "NUNCA PUBLICAR ESTA RESPOSTA",
  );
});
await test("Rascunho de manual não é usado nem exposto ao atendente", async () => {
  await as("adminA");
  const rev = await scalar(
    "select revision from company_settings where organization_id=$1",
    [orgs.A],
  );
  const id = await scalar("select company_create_manual($1,$2,$3)", [
    orgs.A,
    rev,
    "Rascunho secreto",
  ]);
  await as("agentA");
  assert.notEqual((await context()).manual.id, id);
  assert.equal(
    await scalar("select count(*) from manual_versions where id=$1", [id]),
    0,
  );
});
await test("Encaminhamento guarda motivo/contexto e resposta autorizada retorna ao fluxo", async () => {
  await claim();
  await act("escalate", {
    reason: "Preço excepcional",
    summary: "Pedido fora do padrão",
    question: "Qual condição oferecer?",
  });
  assert.equal((await context()).ticket.state, "waiting_company");
  await denied(() => act("decision", { response: "Aprovo sozinho" }));
  await as("adminA");
  await act("decision", {
    response: "Manter preço publicado e explicar ao cliente.",
  });
  const x = await context();
  assert.equal(x.ticket.state, "active");
  assert.equal(x.ticket.next_action, "reply");
  assert.equal(
    x.escalations[0].response,
    "Manter preço publicado e explicar ao cliente.",
  );
  await as("alice");
  assert.ok(
    !JSON.stringify(
      await rpc("central_consumer_thread", { p_request: requests.A }),
    ).includes("excepcional"),
  );
});
await test("Desconto excedente e valor manipulado falham no banco", async () => {
  await claim();
  await denied(() => quote({ p_discount: 11 }));
  await denied(() => quote({ p_expected_cents: 1 }), ["22023"]);
  await denied(() =>
    rpc("central_quote", {
      p_code: codes.A,
      p_revision: 1,
      p_discount: -1,
      p_expires: null,
      p_reason: "Teste",
      p_expected_cents: 1,
      p_key: randomUUID(),
    }),
  );
});
await test("Atendente não consegue preço arbitrário pela RPC antiga nem chamar motor privado", async () => {
  await claim();
  await denied(() =>
    rpc("consumer_send_quote", {
      p_code: requests.A,
      p_items: [{ name: "Preço inventado", quantity: 1, unit_cents: 1 }],
      p_duration: 60,
      p_expires: new Date(Date.now() + 86400000).toISOString(),
      p_expected_revision: 2,
      p_key: randomUUID(),
    }),
  );
  await denied(() =>
    scalar(
      "select private.central_send_quote_core($1,$2,60,now()+interval '1 day',2,$3)",
      [requests.A, "[]", randomUUID()],
    ),
  );
});
await test("Proposta da Central reutiliza versões imutáveis, cálculo e desconto auditável", async () => {
  await claim();
  const r = await quote();
  assert.equal(r.total_cents, 10800);
  const x = await context();
  assert.equal(x.request.versions[0].total_cents, 10800);
  assert.equal(
    await scalar("select original_cents from central_quote_actions"),
    12000,
  );
  await db.exec("reset role");
  await denied(
    () =>
      db.query("update quote_versions set total_cents=1 where public_code=$1", [
        r.code,
      ]),
    ["23514"],
  );
});
await test("Proposta repetida é idempotente e não cria segunda versão", async () => {
  await claim();
  const rev = (await context()).ticket.revision,
    key = randomUUID(),
    expires = new Date(Date.now() + 86400000).toISOString();
  const a = { p_revision: rev, p_key: key, p_expires: expires };
  const x = await quote(a),
    y = await quote(a);
  assert.deepEqual(x, y);
  assert.equal((await context()).request.versions.length, 2);
});
await test("Agenda da Central mantém exclusão, cancelamento e rollback da remarcação", async () => {
  await claim();
  const slots = await rpc("central_slots", { p_code: codes.A, p_day: day });
  const a = await book(slots[0]);
  await as("adminA");
  await rpc("consumer_schedule_block", {
    p_org: orgs.A,
    p_start: slots[4],
    p_end: new Date(new Date(slots[4]).getTime() + 3600000).toISOString(),
    p_note: "Indisponível",
    p_key: randomUUID(),
  });
  await as("agentA");
  await denied(
    () => book(slots[4], { p_action: "reschedule", p_appointment: a.code }),
    ["23P01"],
  );
  assert.equal(
    (await context()).request.appointments[0].starts_at,
    a.starts_at,
  );
  await book(null, { p_action: "cancel", p_appointment: a.code });
  assert.equal((await context()).request.appointments[0].state, "cancelled");
});
await test("Agenda não aceita proposta final ainda não aprovada pelo consumidor", async () => {
  await claim();
  const slots = await rpc("central_slots", { p_code: codes.A, p_day: day });
  await quote();
  await denied(() => book(slots[0]), ["22023"]);
});
await test("Resolução e mensagem posterior reabrem o mesmo ticket sem duplicação", async () => {
  await claim();
  await act("state", { state: "resolved" });
  await as("alice");
  const key = randomUUID();
  await rpc("central_consumer_send", {
    p_request: requests.A,
    p_body: "Mais uma dúvida",
    p_key: key,
  });
  await rpc("central_consumer_send", {
    p_request: requests.A,
    p_body: "Mais uma dúvida",
    p_key: key,
  });
  await as("agentA");
  const x = await context();
  assert.equal(x.ticket.state, "active");
  assert.ok(x.events.some((e) => e.event === "reopened"));
  assert.equal(
    await scalar("select count(*) from tickets where organization_id=$1", [
      orgs.A,
    ]),
    1,
  );
});
await test("Ticket encerrado gera novo relacionado, preservando o histórico anterior", async () => {
  await claim();
  await act("state", { state: "resolved" });
  await act("state", { state: "closed" });
  await as("alice");
  const r = await rpc("central_consumer_send", {
    p_request: requests.A,
    p_body: "Outro atendimento",
    p_key: randomUUID(),
  });
  assert.notEqual(r.code, codes.A);
  await as("agentA");
  const x = await context(r.code);
  assert.ok(x.ticket.previous_ticket_id);
});
await test("Empresa suspensa bloqueia atendente e consumidor em sessões existentes", async () => {
  await claim();
  await as("root");
  await scalar(
    "select foundation_update_organization($1,'Empresa suspensa','suspended')",
    [orgs.A],
  );
  await as("agentA");
  await denied(() => context());
  await as("alice");
  await denied(() => rpc("central_consumer_thread", { p_request: requests.A }));
});
await test("Suspensão do perfil, papel e vínculo bloqueia nova operação sem renovar claims", async () => {
  await claim();
  await as("root");
  await scalar("select foundation_set_attendant($1,$2,'primary','suspended')", [
    orgs.A,
    users.agentA,
  ]);
  await as("agentA");
  await denied(() => context());
  await as("root");
  await scalar("select foundation_set_attendant($1,$2,'primary','active')", [
    orgs.A,
    users.agentA,
  ]);
  await scalar("select foundation_set_profile_status($1,'suspended')", [
    users.agentA,
  ]);
  await as("agentA");
  await denied(() => context());
  await as("root");
  await scalar("select foundation_set_profile_status($1,'active')", [
    users.agentA,
  ]);
  await scalar("select foundation_set_global_role($1,'atendente',false)", [
    users.agentA,
  ]);
  await as("agentA");
  await denied(() => context());
});
await test("Mudança de autonomia interrompe ações subsequentes até publicação/revisão", async () => {
  await claim();
  await as("adminA");
  await save("A", "permissions", {
    allowed_actions: ["price_list"],
    never_change_price: true,
    max_discount_percent: 0,
    reviewed: true,
  });
  await as("agentA");
  await denied(() => quote());
});
await test("Atendente não confirma pagamento preparado nem escreve permissões diretamente", async () => {
  await claim();
  await denied(() => db.exec("update payments set status='paid'"));
  await denied(() =>
    db.exec("update attendant_permissions set max_discount_percent=100"),
  );
  const x = await context();
  assert.equal(x.financial, null);
});
await test("SLA sem configuração não promete prazo; configuração autorizada determina atraso", async () => {
  await as("agentA");
  assert.equal((await queue()).tickets[0].sla, "normal");
  await as("adminA");
  await rpc("central_settings_save", {
    p_org: orgs.A,
    p_revision: 1,
    p_data: { response_minutes: 60, attention_minutes: 30 },
  });
  await db.exec("reset role");
  await db.query(
    "update tickets set waiting_since=now()-interval '2 hours' where public_code=$1",
    [codes.A],
  );
  await as("agentA");
  assert.equal((await queue()).tickets[0].sla, "overdue");
});
await test("Notas administrativas do cliente exigem compartilhamento explícito", async () => {
  await as("adminA");
  await rpc("consumer_customer_context_save", {
    p_code: requests.A,
    p_data: { tags: ["Recorrente"], operational_note: "Privado até autorizar" },
  });
  await as("agentA");
  assert.equal((await context()).customer_context, null);
  await as("adminA");
  await rpc("central_settings_save", {
    p_org: orgs.A,
    p_revision: 1,
    p_data: { share_customer_context: true },
  });
  await as("agentA");
  assert.equal(
    (await context()).customer_context.operational_note,
    "Privado até autorizar",
  );
});
await test("75 tabelas mantêm FORCE RLS, somente SELECT, helpers e motores privados inacessíveis", async () => {
  await db.exec("reset role");
  const rows = (
    await db.query(
      "select relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'",
    )
  ).rows;
  assert.equal(rows.length, 75);
  assert.ok(rows.every((r) => r.relrowsecurity && r.relforcerowsecurity));
  assert.equal(
    await scalar(
      "select count(*) from pg_policies where schemaname='public' and cmd<>'SELECT'",
    ),
    0,
  );
  assert.equal(
    await scalar(
      "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'central_%' and p.proname<>'central_staff' and has_function_privilege('authenticated',p.oid,'execute')",
    ),
    0,
  );
});
await test("Auditoria não duplica conteúdo pessoal, mensagens, tokens ou notas", async () => {
  await claim();
  await act("note", { body: "SEGREDO_INTERNO_123" });
  await as("adminA");
  assert.ok(
    !JSON.stringify((await db.query("select * from audit_logs")).rows).includes(
      "SEGREDO_INTERNO_123",
    ),
  );
});

await test("Cliente aprovou: ticket volta ao atendente com próxima ação de agenda", async () => {
  await claim();
  const r = await quote();
  await as("alice");
  await rpc("consumer_approve_quote", {
    p_code: requests.A,
    p_version: r.code,
    p_key: randomUUID(),
  });
  await as("agentA");
  const x = await context();
  assert.equal(x.ticket.state, "active");
  assert.equal(x.ticket.next_action, "schedule");
});
await test("Link somente leitura não permite mensagem; revogação remove conversa do acesso resgatado", async () => {
  await as("alice");
  const link = await rpc("consumer_create_tracking_link", {
    p_code: requests.A,
    p_manage: false,
  });
  await as("charlie");
  await rpc("consumer_redeem_tracking_link", {
    p_code: requests.A,
    p_secret: link.secret,
  });
  assert.ok(await rpc("central_consumer_thread", { p_request: requests.A }));
  await denied(() =>
    rpc("central_consumer_send", {
      p_request: requests.A,
      p_body: "Sem permissão",
      p_key: randomUUID(),
    }),
  );
  await as("alice");
  await rpc("consumer_revoke_tracking", { p_code: requests.A });
  await as("charlie");
  await denied(() => rpc("central_consumer_thread", { p_request: requests.A }));
});
await test("Configuração operacional não pode ser alterada por atendente ou empresa B", async () => {
  await as("agentA");
  await denied(() =>
    rpc("central_settings_save", {
      p_org: orgs.A,
      p_revision: 1,
      p_data: { quick_reply_edit: true },
    }),
  );
  await as("adminB");
  await denied(() =>
    rpc("central_settings_save", {
      p_org: orgs.A,
      p_revision: 1,
      p_data: { share_customer_context: true },
    }),
  );
});
await test("Suspensão de membro administrador revoga a fila empresarial em claims existentes", async () => {
  await authorizeSupport({as,scalar},orgs.A,"adminA");
  await scalar("select foundation_set_member($1,$2,'admin_empresa','active')", [
    orgs.A,
    users.shared,
  ]);
  await as("shared");
  await scalar(
    "select foundation_set_member($1,$2,'admin_empresa','suspended')",
    [orgs.A, users.adminA],
  );
  await as("adminA");
  await denied(() => context());
  assert.equal((await queue()).tickets.length, 0);
});
await test("Preço a partir de não é convertido em proposta definitiva pelo atendente", async () => {
  await db.exec("reset role");
  const id = await scalar(
    "select id from services where organization_id=$1 and price_mode='from'",
    [orgs.A],
  );
  await db.query(
    "update quote_requests set service_id=$1,service_code=private.consumer_code('s',$1),answers='{}' where public_code=$2",
    [id, requests.A],
  );
  await claim();
  await denied(() => quote());
});
await test("Anexo autorizado da solicitação não pode ser acessado por atendente de B", async () => {
  await db.exec("reset role");
  const q = await scalar(
    "select to_jsonb(q) from quote_requests q where public_code=$1",
    [requests.A],
  );
  const f = await scalar(
    "insert into attachments(organization_id,request_id,uploaded_by,mime,size_bytes,object_path,state,sha256,width,height) values($1,$2,$3,'image/png',100,$4,'ready',$5,10,10) returning public_code",
    [
      orgs.A,
      q.id,
      users.alice,
      orgs.A + "/" + q.id + "/fixture.png",
      "a".repeat(64),
    ],
  );
  await as("agentA");
  const r = await rpc("central_attachment_ticket", {
    p_code: codes.A,
    p_file: f,
  });
  assert.match(r.ticket, /^[a-f0-9]{64}$/);
  await as("agentB");
  await denied(() =>
    rpc("central_attachment_ticket", { p_code: codes.B, p_file: f }),
  );
  await denied(() =>
    rpc("central_attachment_ticket", { p_code: codes.A, p_file: f }),
  );
});
await test("Filtros de data e fila são aplicados no banco sem revelar empresa não vinculada", async () => {
  await as("agentA");
  assert.equal((await queue({ p_date: "2000-01-01" })).tickets.length, 0);
  assert.equal((await queue({ p_view: "general" })).tickets.length, 1);
  await claim();
  assert.equal((await queue({ p_view: "general" })).tickets.length, 0);
  assert.equal((await queue({ p_view: "company" })).tickets.length, 0);
  await denied(() => queue({ p_view: "invalid" }), ["22023"]);
  await act("state", { state: "resolved" });
  assert.equal((await queue({ p_view: "resolved" })).tickets.length, 1);
});
await db.close();
await writeFile(
  "reports/central-results.json",
  JSON.stringify(
    {
      environment:
        "LOCAL PGlite; Auth simulado; concorrência independente não executada",
      tests: results,
      passed: results.filter((x) => x.status === "PASS").length,
      failed: results.filter((x) => x.status === "FAIL").length,
    },
    null,
    2,
  ),
);
if (results.some((x) => x.status === "FAIL")) process.exitCode = 1;
