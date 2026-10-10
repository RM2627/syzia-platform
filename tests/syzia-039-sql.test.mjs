import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { seedCommercial } from "./fixtures/commercial.mjs";
const c = await consumerDB({
    through: "202609250038_multiservice_requests.sql",
  }),
  { db, as, rpc, scalar, orgs } = c;
const legacy = await seedCommercial(c),
  results = [];
await db.query(
  "update billing_subscriptions set state='trial',trial_used=true where organization_id=$1",
  [orgs.B],
);
await db.query(
  "insert into private.trial_grants(organization_id,plan_version_id,starts_at,ends_at,mode,actor_id,reason)select organization_id,plan_version_id,period_start,period_end,'administrative',$2,'Registro de trial para upgrade local'from billing_subscriptions where organization_id=$1",
  [orgs.B, users.root],
);
await db.exec("begin");
const internalOrg = await scalar("insert into organizations(name,slug)values('Concessão interna preservada','internal-upgrade-039')returning id");
await as("root");
await rpc("billing_exemption_set", {p_org:internalOrg,p_kind:"internal",p_capabilities:{software:true,human_support:false,commercial_followups:true},p_reason:"Concessão anterior para teste de upgrade",p_key:randomUUID()});
await db.exec("commit;reset role");
const snap = () =>
  scalar(
    "select jsonb_build_object('plans',(select jsonb_agg(to_jsonb(t)order by id)from billing_plans t),'versions',(select jsonb_agg(to_jsonb(t)-'quota_semantics' order by id)from billing_plan_versions t),'subscriptions',(select jsonb_agg(to_jsonb(t)order by organization_id)from billing_subscriptions t),'usage',(select jsonb_agg(to_jsonb(t)order by id)from billing_usage t),'grants',(select jsonb_agg(to_jsonb(t)order by id)from private.trial_grants t),'exemptions',(select jsonb_agg(to_jsonb(t)order by id)from private.organization_exemptions t),'history',(select jsonb_agg(to_jsonb(t)order by id)from billing_events t))",
  );
const before = await snap();
await db.exec(
  await readFile(
    "supabase/migrations/202609250039_commercial_plans.sql",
    "utf8",
  ),
);
const base = {
  name: "Plano configurável 039",
  description: "Oferta de teste local",
  price_cents: 17900,
  interval_months: 1,
  trial_days: 0,
  active: true,
  available: true,
  site_visible: false,
  self_service: false,
  self_service_trial: false,
  position: 4,
  member_limit: 3,
  service_limit: null,
  request_limit: null,
  ticket_limit: null,
  followup_limit: null,
  quota_semantics: 2,
  capabilities: {
    software: true,
    finance: true,
    analytics: true,
    commercial_followups: true,
    human_support: true,
  },
};
const data = (patch) => ({
  ...base,
  ...patch,
  capabilities: { ...base.capabilities, ...patch?.capabilities },
});
async function test(name, fn) {
  await db.exec("begin");
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.error("FAIL", name, e.message);
  } finally {
    await db.exec("rollback;reset role");
  }
}
async function denied(fn, re = /denied|required|unavailable/) {
  await db.exec("savepoint denied");
  try {
    await fn();
  } catch (e) {
    await db.exec("rollback to savepoint denied");
    assert.match(e.message, re);
    return e;
  }
  throw Error("Expected rejection");
}
async function plan(patch = {}) {
  await as("root");
  const p = await rpc("billing_plan_save", {
    p_id: null,
    p_revision: 0,
    p_data: data(patch),
  });
  await db.exec("reset role");
  return (
    await db.query("select * from billing_plan_versions where plan_id=$1", [p])
  ).rows[0];
}
async function contract(patch = {}, org = orgs.A) {
  const v = await plan(patch);
  await db.query(
    "update billing_subscriptions set plan_version_id=$2,state='active',period_start=now(),period_end=now()+interval '1 year',revision=revision+1 where organization_id=$1",
    [org, v.id],
  );
  return v;
}
await test("Upgrade populado preserva planos, versões, assinaturas, trial, uso e histórico", async () =>
  assert.deepEqual(await snap(), before));
await test("Criar plano interno, ilimitado, sem trial e público com self-service/trial", async () => {
  const internal = await plan({
    available: false,
    member_limit: null,
    capabilities: { human_support: false },
  });
  assert.equal(internal.member_limit, null);
  assert.equal(internal.quota_semantics, 2);
  await as("anon");
  assert.equal(
    (await rpc("acquisition_plans")).some((x) => x.id === internal.plan_id),
    false,
  );
  const pub = await plan({
    site_visible: true,
    self_service: true,
    self_service_trial: true,
    trial_days: 15,
  });
  await as("anon");
  const item = (await rpc("acquisition_plans")).find(
    (x) => x.id === pub.plan_id,
  );
  assert.equal(item.version.trial_days, 15);
  assert.equal(item.self_service, true);
});
await test("Validação rejeita capacidade inexistente, divergência e oferta incoerente sem salvar", async () => {
  await as("root");
  for (const p of [
    data({ capabilities: { telepathy: true } }),
    { ...data(), human_support: false },
    data({ self_service: true }),
    data({ self_service_trial: true }),
    data({ capabilities: { software: false } }),
  ]) {
    assert.equal(
      (await rpc("billing_plan_validate", { p_data: p })).consistent,
      false,
    );
    await denied(
      () => rpc("billing_plan_save", { p_id: null, p_revision: 0, p_data: p }),
      /inconsistent/,
    );
  }
});
await test("Financeiro excluído nega RPC e RLS; empresa não pode reescrever o contrato", async () => {
  await contract({ capabilities: { finance: false } });
  await as("adminA");
  await denied(() =>
    rpc("financial_summary", {
      p_org: orgs.A,
      p_from: "2026-09-01",
      p_to: "2026-09-25",
    }),
  );
  assert.equal(await scalar("select count(*)::int from financial_accounts"), 0);
  await denied(
    () => db.query("update billing_plan_versions set capabilities='{}'"),
    /permission denied/,
  );
});
await test("Financeiro e métricas incluídos usam RPCs existentes", async () => {
  await contract();
  await as("adminA");
  assert.ok(
    await rpc("financial_summary", {
      p_org: orgs.A,
      p_from: "2026-09-01",
      p_to: "2026-09-25",
    }),
  );
  assert.ok(
    await rpc("analytics_company", {
      p_org: orgs.A,
      p_from: "2026-09-01",
      p_to: "2026-09-25",
    }),
  );
});
await test("Métricas excluídas negam analytics sem apagar dados", async () => {
  await contract({ capabilities: { analytics: false } });
  await as("adminA");
  await denied(() =>
    rpc("analytics_company", {
      p_org: orgs.A,
      p_from: "2026-09-01",
      p_to: "2026-09-25",
    }),
  );
  assert.ok(
    await rpc("operations_directory", {
      p_org: orgs.A,
      p_search: "",
      p_offset: 0,
    }),
  );
});
await test("Follow-up excluído e atendimento compartilhado excluído negados no servidor", async () => {
  await contract({
    capabilities: { human_support: false, commercial_followups: false },
  });
  await as("adminA");
  const caps = await rpc("billing_capabilities", { p_org: orgs.A });
  assert.equal(caps.human_support, false);
  assert.equal(caps.commercial_followups, false);
  const perms = await rpc("permissions_context", { p_org: orgs.A });
  assert.equal(perms.actions["followup.manage"].allowed, false);
  await as("agentA");
  await denied(() => rpc("central_context", { p_code: legacy.codes.A }));
});
await test("3 membros permitidos; quarto bloqueado; compartilhados e Super Admin não ocupam vagas", async () => {
  await contract();
  await as("adminA");
  await rpc("operations_member", {
    p_org: orgs.A,
    p_user: users.backup,
    p_role: "colaborador_empresa",
    p_status: "active",
  });
  await denied(
    () =>
      rpc("operations_member", {
        p_org: orgs.A,
        p_user: users.agentB,
        p_role: "colaborador_empresa",
        p_status: "active",
      }),
    /limit_reached/,
  );
  await db.exec("reset role");
  await db.query(
    "insert into organization_members(organization_id,user_id,role)values($1,$2,'colaborador_empresa')",
    [orgs.A, users.root],
  );
  assert.equal(
    (await scalar("select private.billing_usage_snapshot($1)", [orgs.A]))
      .members,
    3,
  );
});
await test("Editar cria nova versão sem alterar assinatura antiga ou permitir reescrita", async () => {
  const old = await contract();
  await as("root");
  await rpc("billing_plan_save", {
    p_id: old.plan_id,
    p_revision: 1,
    p_data: data({
      price_cents: 22900,
      capabilities: { finance: false },
      member_limit: 5,
    }),
  });
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select plan_version_id from billing_subscriptions where organization_id=$1",
      [orgs.A],
    ),
    old.id,
  );
  assert.equal(
    (
      await scalar(
        "select capabilities from billing_plan_versions where id=$1",
        [old.id],
      )
    ).finance,
    true,
  );
  const latest = await scalar(
    "select id from billing_plan_versions where plan_id=$1 and version=2",
    [old.plan_id],
  );
  assert.notEqual(latest, old.id);
  await denied(
    () =>
      db.query("update billing_plan_versions set price_cents=1 where id=$1", [
        old.id,
      ]),
    /immutable/,
  );
});
await test("Sem provedor: configura planos, nega cobrança e não cria assinatura substituta", async () => {
  const v = await plan();
  await as("root");
  const status = await rpc("billing_provider_status");
  assert.equal(status.provider, null);
  assert.equal(status.checkout_available, false);
  await as("adminA");
  const ctx = await rpc("billing_context", { p_org: orgs.A });
  await denied(
    () =>
      rpc("billing_subscription_action", {
        p_org: orgs.A,
        p_action: "change",
        p_plan: v.plan_id,
        p_revision: ctx.subscription.revision,
        p_key: randomUUID(),
      }),
    /provider_not_configured/,
  );
  assert.deepEqual(
    (await rpc("billing_context", { p_org: orgs.A })).subscription,
    ctx.subscription,
  );
});
await test("Suspensão bloqueia novas operações, conserva histórico e regularização", async () => {
  await contract();
  await db.query(
    "update billing_subscriptions set state='suspended'where organization_id=$1",
    [orgs.A],
  );
  await as("adminA");
  await denied(() =>
    rpc("operations_customer", {
      p_org: orgs.A,
      p_data: { name: "Contato temporário", phone: "81999990000" },
      p_key: randomUUID(),
    }),
  );
  const ctx = await rpc("billing_context", { p_org: orgs.A });
  assert.equal(ctx.subscription.effective_state, "suspended");
  await db.exec("reset role");
  await denied(() =>
    scalar("select private.billing_assert_capacity($1,'software')", [orgs.A]),
  );
});
await test("Plano antigo mantém recursos implícitos e limites; capabilities novas não alteram legacy", async () => {
  await as("adminB");
  const perms = await rpc("permissions_context", { p_org: orgs.B });
  assert.equal(perms.actions["finance.accounts.read"].allowed, true);
  assert.equal(perms.actions["analytics.operational"].allowed, true);
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select v.quota_semantics from billing_subscriptions s join billing_plan_versions v on v.id=s.plan_version_id where s.organization_id=$1",
      [orgs.B],
    ),
    1,
  );
});
await test("Usuário empresarial não altera nem testa plano global, nem vê estado administrativo de cobrança", async () => {
  await as("adminA");
  for (const [name, args] of [
    ["billing_plan_save", { p_id: null, p_revision: 0, p_data: base }],
    ["billing_plan_validate", { p_data: base }],
    ["billing_plan_test", { p_data: base }],
    ["billing_provider_status", {}],
  ])
    await denied(() => rpc(name, args));
});
await test("A/B negado em financeiro, operações e assinatura; editar plano não libera operação ao root", async () => {
  await contract();
  await as("adminB");
  await denied(() =>
    rpc("financial_summary", {
      p_org: orgs.A,
      p_from: "2026-09-01",
      p_to: "2026-09-25",
    }),
  );
  await denied(() =>
    rpc("operations_directory", { p_org: orgs.A, p_search: "", p_offset: 0 }),
  );
  await denied(() => rpc("billing_context", { p_org: orgs.A }));
  await as("root");
  await denied(() =>
    rpc("operations_directory", { p_org: orgs.A, p_search: "", p_offset: 0 }),
  );
});
await test("Testar atribuições usa autorizações reais e descarta contratos, identidades e empresas temporárias", async () => {
  await as("root");
  await db.exec("reset role");
  const counts = await scalar(
    "select jsonb_build_array((select count(*)from organizations),(select count(*)from auth.users),(select count(*)from billing_plans),(select count(*)from audit_logs))",
  );
  await as("root");
  const r = await rpc("billing_plan_test", {
    p_data: data({ capabilities: { finance: false, human_support: false } }),
  });
  assert.equal(r.consistent, true, JSON.stringify(r));
  assert.equal(r.rolled_back, true);
  for (const label of [
    "Financeiro",
    "4º membro",
    "Acesso da empresa A à empresa B",
    "Operação com assinatura suspensa",
  ])
    assert.equal(r.checks.find((x) => x.label === label).status, "Bloqueado");
  await db.exec("reset role");
  assert.deepEqual(
    await scalar(
      "select jsonb_build_array((select count(*)from organizations),(select count(*)from auth.users),(select count(*)from billing_plans),(select count(*)from audit_logs))",
    ),
    counts,
  );
});
await test("Ticket não consome ao assumir ou anotar; resposta humana SYZIA consome uma vez", async () => {
  await contract({ ticket_limit: 1 });
  await as("agentA");
  let ctx = await rpc("central_context", { p_code: legacy.codes.A });
  await rpc("central_act", {
    p_code: legacy.codes.A,
    p_revision: ctx.ticket.revision,
    p_action: "claim",
    p_data: {},
    p_key: randomUUID(),
  });
  await as("adminA");
  assert.equal(
    (await rpc("billing_context", { p_org: orgs.A })).usage.tickets,
    0,
  );
  await as("agentA");
  ctx = await rpc("central_context", { p_code: legacy.codes.A });
  await rpc("central_act", {
    p_code: legacy.codes.A,
    p_revision: ctx.ticket.revision,
    p_action: "note",
    p_data: { body: "Anotação interna." },
    p_key: randomUUID(),
  });
  ctx = await rpc("central_context", { p_code: legacy.codes.A });
  await rpc("central_act", {
    p_code: legacy.codes.A,
    p_revision: ctx.ticket.revision,
    p_action: "message",
    p_data: { body: "Vamos analisar sua solicitação." },
    p_key: randomUUID(),
  });
  ctx = await rpc("central_context", { p_code: legacy.codes.A });
  await rpc("central_act", {
    p_code: legacy.codes.A,
    p_revision: ctx.ticket.revision,
    p_action: "message",
    p_data: { body: "Complemento da mesma conversa." },
    p_key: randomUUID(),
  });
  await as("adminA");
  assert.equal(
    (await rpc("billing_context", { p_org: orgs.A })).usage.tickets,
    1,
  );
});
await test("Atendimento próprio continua ilimitado quando cota humana SYZIA é zero", async () => {
  await contract({ ticket_limit: 0 });
  await as("adminA");
  let ctx = await rpc("central_context", { p_code: legacy.codes.A });
  await rpc("central_act", {
    p_code: legacy.codes.A,
    p_revision: ctx.ticket.revision,
    p_action: "message",
    p_data: { body: "A própria empresa responde." },
    p_key: randomUUID(),
  });
  assert.equal(
    (await rpc("billing_context", { p_org: orgs.A })).usage.tickets,
    0,
  );
});
await test("Cota humana zerada bloqueia primeira resposta compartilhada sem gravar mensagem", async () => {
  await contract({ ticket_limit: 0 });
  await as("agentA");
  let ctx = await rpc("central_context", { p_code: legacy.codes.A });
  await rpc("central_act", {
    p_code: legacy.codes.A,
    p_revision: ctx.ticket.revision,
    p_action: "claim",
    p_data: {},
    p_key: randomUUID(),
  });
  ctx = await rpc("central_context", { p_code: legacy.codes.A });
  await denied(
    () =>
      rpc("central_act", {
        p_code: legacy.codes.A,
        p_revision: ctx.ticket.revision,
        p_action: "message",
        p_data: { body: "Resposta que não deve ser persistida." },
        p_key: randomUUID(),
      }),
    /limit_reached/,
  );
  assert.equal(
    (await rpc("central_context", { p_code: legacy.codes.A })).messages.some(
      (m) => m.body === "Resposta que não deve ser persistida.",
    ),
    false,
  );
});
await test("Funções privadas e novas RPCs não ampliam grants públicos", async () => {
  for (const sig of [
    "private.billing_assert_capacity(uuid,text)",
    "private.billing_ticket_service()",
    "private.billing_shared_actor(uuid,uuid)",
    "private.entitlement(uuid,text)",
  ])
    assert.equal(
      await scalar(
        "select has_function_privilege('authenticated',$1,'execute')",
        [sig],
      ),
      false,
    );
  for (const name of [
    "billing_plan_test(jsonb)",
    "billing_plan_validate(jsonb)",
    "billing_provider_status()",
  ])
    assert.equal(
      await scalar("select has_function_privilege('anon',$1,'execute')", [
        "public." + name,
      ]),
      false,
    );
});
await test("Multisserviço continua sendo uma solicitação e é idempotente", async () => {
  await contract({ request_limit: 2 });
  await as("alice");
  const p = await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" });
  const items = p.services
    .filter((s) => ["fixed", "quote"].includes(s.price_mode))
    .slice(0, 2)
    .map((s) => ({
      service: s.code,
      addons: [],
      answers: Object.fromEntries(
        s.questions
          .filter((q) => q.required)
          .map((q) => [q.code, "Informação do cenário"]),
      ),
      notes: "",
    }));
  const q = await rpc("consumer_create_multi_request", {
    p_slug: p.slug,
    p_revision: p.revision,
    p_items: items,
    p_customer: {
      name: "Cliente de validação",
      whatsapp: "81999990000",
      email: "scenario@example.invalid",
      accepted_notice: true,
      notice_version: "consumer-v1",
    },
    p_notes: "Um pedido com dois serviços",
    p_contact: false,
    p_expected_cents: null,
    p_key: randomUUID(),
  });
  const args = { p_code: q.code, p_attachment_count: 0, p_key: randomUUID() };
  await rpc("consumer_submit_request", args);
  await rpc("consumer_submit_request", args);
  await as("adminA");
  assert.equal(
    (await rpc("billing_context", { p_org: orgs.A })).usage.requests,
    2,
  );
});
await test("Criar/ver/assumir retorno não consome; registrar resultado humano consome uma tentativa", async () => {
  await contract({ followup_limit: 1 });
  await as("agentA");
  let context = await rpc("commercial_context", {
    p_code: legacy.opportunities.A,
  });
  const task = context.tasks.find(
    (t) => !["completed", "cancelled"].includes(t.state),
  );
  assert.ok(task);
  await rpc("commercial_task_act", {
    p_code: task.public_code,
    p_revision: task.revision,
    p_action: "claim",
    p_data: {},
    p_key: randomUUID(),
  });
  await as("adminA");
  assert.equal(
    (await rpc("billing_context", { p_org: orgs.A })).usage.followups,
    0,
  );
  await as("agentA");
  context = await rpc("commercial_context", { p_code: legacy.opportunities.A });
  let t = context.tasks.find((t) => t.public_code === task.public_code);
  await rpc("commercial_task_act", {
    p_code: t.public_code,
    p_revision: t.revision,
    p_action: "start",
    p_data: {},
    p_key: randomUUID(),
  });
  context = await rpc("commercial_context", { p_code: legacy.opportunities.A });
  t = context.tasks.find((t) => t.public_code === task.public_code);
  const args = {
    p_code: t.public_code,
    p_revision: t.revision,
    p_action: "result",
    p_data: { outcome: "responded", note: "Contato efetivamente realizado." },
    p_key: randomUUID(),
  };
  await rpc("commercial_task_act", args);
  await rpc("commercial_task_act", args);
  await as("adminA");
  assert.equal(
    (await rpc("billing_context", { p_org: orgs.A })).usage.followups,
    1,
  );
});
await test("Retorno da própria empresa não consome capacidade humana SYZIA", async () => {
  await contract({ followup_limit: 0 });
  await as("adminA");
  let context = await rpc("commercial_context", {
    p_code: legacy.opportunities.A,
  });
  let t = context.tasks.find(
    (t) => !["completed", "cancelled"].includes(t.state),
  );
  await rpc("commercial_task_act", {
    p_code: t.public_code,
    p_revision: t.revision,
    p_action: "start",
    p_data: {},
    p_key: randomUUID(),
  });
  context = await rpc("commercial_context", { p_code: legacy.opportunities.A });
  t = context.tasks.find((x) => x.public_code === t.public_code);
  await rpc("commercial_task_act", {
    p_code: t.public_code,
    p_revision: t.revision,
    p_action: "result",
    p_data: {
      outcome: "responded",
      note: "Contato feito pela própria empresa.",
    },
    p_key: randomUUID(),
  });
  assert.equal(
    (await rpc("billing_context", { p_org: orgs.A })).usage.followups,
    0,
  );
});
await test("Ação substantiva de orçamento/agenda registra um atendimento; transferência e reabertura não duplicam", async () => {
  await contract({ ticket_limit: 1 });
  const ticket = await scalar("select id from tickets where public_code=$1", [
    legacy.codes.A,
  ]);
  for (const event of [
    "assigned",
    "quote",
    "message",
    "transferred",
    "reopened",
    "booking",
  ])
    await db.query(
      "insert into ticket_events(organization_id,ticket_id,actor_id,event)values($1,$2,$3,$4)",
      [orgs.A, ticket, users.agentA, event],
    );
  assert.equal(
    (await scalar("select private.billing_usage_snapshot($1)", [orgs.A]))
      .tickets,
    1,
  );
});
await test("Validação detecta vínculo de enforcement ausente e impede a oferta", async () => {
  await db.exec(
    "update private.permission_catalog set capability='software'where action='finance.accounts.read'",
  );
  await as("root");
  const r = await rpc("billing_plan_validate", { p_data: base });
  assert.equal(r.consistent, false);
  assert.equal(
    r.mappings.find((x) => x.capability === "finance").enforced,
    false,
  );
  await denied(
    () => rpc("billing_plan_save", { p_id: null, p_revision: 0, p_data: base }),
    /inconsistent/,
  );
});
await test("Upgrade confirmado muda versão; downgrade é explícito e só vale na renovação", async () => {
  const first = await contract({ price_cents: 10000 });
  const up = await plan({
    price_cents: 20000,
    capabilities: { finance: false },
  });
  await db.exec("update private.billing_runtime set mock_enabled=true");
  await as("adminA");
  let ctx = await rpc("billing_context", { p_org: orgs.A });
  const result = await rpc("billing_subscription_action", {
    p_org: orgs.A,
    p_action: "change",
    p_plan: up.plan_id,
    p_revision: ctx.subscription.revision,
    p_key: randomUUID(),
  });
  assert.ok(result.invoice_id);
  ctx = await rpc("billing_context", { p_org: orgs.A });
  assert.equal(ctx.subscription.plan.id, first.id);
  await as("root");
  const event = {
    p_event: randomUUID(),
    p_invoice: result.invoice_id,
    p_state: "paid",
    p_amount: 20000,
  };
  await rpc("billing_mock_event", event);
  await rpc("billing_mock_event", event);
  await as("adminA");
  ctx = await rpc("billing_context", { p_org: orgs.A });
  assert.equal(ctx.subscription.plan.id, up.id);
  assert.equal(ctx.subscription.plan.capabilities.finance, false);
  const down = await plan({
    price_cents: 5000,
    capabilities: { finance: true },
  });
  await as("adminA");
  const change = await rpc("billing_subscription_action", {
    p_org: orgs.A,
    p_action: "change",
    p_plan: down.plan_id,
    p_revision: ctx.subscription.revision,
    p_key: randomUUID(),
  });
  assert.equal(change.scheduled, true);
  ctx = await rpc("billing_context", { p_org: orgs.A });
  assert.equal(ctx.subscription.plan.id, up.id);
  assert.equal(ctx.subscription.pending_plan.id, down.id);
  await db.exec("reset role");
  await db.query(
    "update billing_subscriptions set period_start=now()-interval '2 months',period_end=now()-interval '1 day'where organization_id=$1",
    [orgs.A],
  );
  await as("adminA");
  ctx = await rpc("billing_context", { p_org: orgs.A });
  const renew = await rpc("billing_subscription_action", {
    p_org: orgs.A,
    p_action: "renew",
    p_plan: null,
    p_revision: ctx.subscription.revision,
    p_key: randomUUID(),
  });
  await as("root");
  await rpc("billing_mock_event", {
    p_event: randomUUID(),
    p_invoice: renew.invoice_id,
    p_state: "paid",
    p_amount: 5000,
  });
  await as("adminA");
  assert.equal(
    (await rpc("billing_context", { p_org: orgs.A })).subscription.plan.id,
    down.id,
  );
});
await test("Nova empresa adere à versão atual; pendência e falha não liberam acesso", async () => {
  const v = await plan({ capabilities: { finance: false } });
  await db.exec("reset role");
  const o = await scalar(
    "insert into organizations(name,slug)values($1,$2)returning id",
    ["Cenário de nova adesão", "adesao-" + randomUUID()],
  );
  await db.exec("update private.billing_runtime set mock_enabled=true");
  await as("root");
  const result = await rpc("billing_subscription_action", {
    p_org: o,
    p_action: "subscribe",
    p_plan: v.plan_id,
    p_revision: 0,
    p_key: randomUUID(),
  });
  let ctx = await rpc("billing_context", { p_org: o });
  assert.equal(ctx.subscription.plan.id, v.id);
  assert.equal(
    (await rpc("billing_capabilities", { p_org: o })).software,
    false,
  );
  await rpc("billing_mock_event", {
    p_event: randomUUID(),
    p_invoice: result.invoice_id,
    p_state: "failed",
    p_amount: v.price_cents,
  });
  assert.equal(
    (await rpc("billing_capabilities", { p_org: o })).software,
    false,
  );
});
await writeFile(
  "reports/syzia-039/sql.json",
  JSON.stringify(
    {
      engine: "PGlite local; dados sintéticos; sem homologação externa",
      results,
    },
    null,
    2,
  ),
);
await db.close();
if (results.some((x) => x.status === "FAIL")) process.exitCode = 1;
