import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { seedCommercial } from "./fixtures/commercial.mjs";
import { consumerDB, users } from "./support/consumer-db.mjs";
const c = await consumerDB(),
  { db, as, rpc, scalar, orgs, services } = c,
  results = [];
const planData = {
  name: "Plano fictício Software",
  description: "Teste isolado",
  active: true,
  available: true,
  position: 1,
  price_cents: 9900,
  interval_months: 1,
  trial_days: 14,
  human_support: false,
  commercial_followups: true,
  member_limit: 3,
  service_limit: 4,
  request_limit: 5,
  ticket_limit: 5,
  followup_limit: 5,
};
await seedCommercial(c,{supportPlan:false});
let plan, plus;
await db.exec("begin");
await as("root");
for (const k of ["A", "B"])
  await rpc("billing_trial_verify", {
    p_org: orgs[k],
    p_kind: "business",
    p_value: "ZZ:TEST:BILLING" + k,
    p_evidence: "fixture-billing-" + k,
    p_reason: "Verified fictitious identity for billing regression",
    p_verified: true,
  });
plan = await rpc("billing_plan_save", {
  p_id: null,
  p_revision: 0,
  p_data: planData,
});
plus = await rpc("billing_plan_save", {
  p_id: null,
  p_revision: 0,
  p_data: {
    ...planData,
    name: "Plano com atendimento fictício",
    price_cents: 19900,
    human_support: true,
  },
});
await db.exec("commit;reset role");
async function test(name, fn) {
  await db.exec("begin");
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.log("FAIL", name, e.message);
  } finally {
    await db.exec("rollback;reset role");
  }
}
async function deny(fn, codes = ["42501"]) {
  await db.exec("savepoint denied");
  try {
    await fn();
  } catch (e) {
    await db.exec("rollback to savepoint denied");
    assert.ok(codes.includes(e.code), e.code + ": " + e.message);
    return;
  }
  throw Error("Expected rejection");
}
const context = () => rpc("billing_context", { p_org: orgs.A });
async function action(
  action,
  planId = plan,
  revision = null,
  key = randomUUID(),
) {
  if (revision === null)
    revision = (await context()).subscription?.revision || 0;
  return rpc("billing_subscription_action", {
    p_org: orgs.A,
    p_action: action,
    p_plan: planId,
    p_revision: revision,
    p_key: key,
  });
}
async function mock(
  invoice,
  state = "paid",
  amount = 9900,
  event = randomUUID(),
) {
  await db.exec("reset role");
  await db.exec("update private.billing_runtime set mock_enabled=true");
  await as("root");
  return rpc("billing_mock_event", {
    p_invoice: invoice,
    p_state: state,
    p_amount: amount,
    p_event: event,
  });
}
async function active(planId = plan) {
  await as("adminA");
  const x = await action("subscribe", planId);
  await mock(x.invoice_id, "paid", planId === plus ? 19900 : 9900);
  await as("adminA");
  return x.invoice_id;
}
for (const user of ["anon", "alice", "worker", "agentA", "adminB"])
  await test(user + " não lê assinatura A", async () => {
    await as(user);
    await deny(context);
  });
await test("empresa A não consulta B nem visão global", async () => {
  await as("adminA");
  await deny(() => rpc("billing_context", { p_org: orgs.B }));
  await deny(() => rpc("billing_admin_overview"));
});
await test("empresa não publica plano ou simula pagamento", async () => {
  await as("adminA");
  await deny(() =>
    rpc("billing_plan_save", { p_id: null, p_revision: 0, p_data: planData }),
  );
  await deny(() =>
    rpc("billing_mock_event", {
      p_invoice: randomUUID(),
      p_state: "paid",
      p_amount: 0,
      p_event: randomUUID(),
    }),
  );
});
await test("empresa sem adesão explícita preserva acesso e não é cobrada", async () => {
  await as("adminA");
  const x = await context();
  assert.equal(x.subscription, null);
  assert.equal(x.invoices.length, 0);
  assert.equal(x.real_payments_enabled, false);
  assert.equal(x.revenue_cents, null);
  assert.equal(x.usage.services, 3);
});
await test("catálogo somente planos ativos disponíveis", async () => {
  await as("root");
  await rpc("billing_plan_save", {
    p_id: plan,
    p_revision: 1,
    p_data: { ...planData, available: false },
  });
  await as("adminA");
  assert.equal((await context()).catalog.length, 1);
  await deny(() => action("trial"), ["22023"]);
});
await test("edição de plano preserva versão contratada", async () => {
  await active();
  const before = (await context()).subscription.plan;
  await as("root");
  await rpc("billing_plan_save", {
    p_id: plan,
    p_revision: 1,
    p_data: { ...planData, price_cents: 25000, service_limit: 1 },
  });
  await as("adminA");
  const after = (await context()).subscription.plan;
  assert.equal(after.id, before.id);
  assert.equal(after.price_cents, 9900);
  assert.equal(after.service_limit, 4);
});
await test("revisão obsoleta do plano é rejeitada", async () => {
  await as("root");
  await deny(
    () =>
      rpc("billing_plan_save", { p_id: plan, p_revision: 0, p_data: planData }),
    ["40001"],
  );
});
await test("preço negativo e periodicidade inválida recusados por constraints", async () => {
  await as("root");
  for (const patch of [
    { price_cents: -1 },
    { interval_months: 2 },
    { member_limit: 0 },
  ])
    await deny(
      () =>
        rpc("billing_plan_save", {
          p_id: null,
          p_revision: 0,
          p_data: { ...planData, ...patch },
        }),
      ["23514"],
    );
});
await test("campo de valor fraudulento extra rejeitado", async () => {
  await as("root");
  await deny(
    () =>
      rpc("billing_plan_save", {
        p_id: null,
        p_revision: 0,
        p_data: { ...planData, received_cents: 999 },
      }),
    ["22023"],
  );
});
await test("trial configurado não cria cobrança nem permite segunda trial", async () => {
  await as("adminA");
  await action("trial");
  const x = await context();
  assert.equal(x.subscription.effective_state, "trial");
  assert.equal(x.invoices.length, 0);
  await deny(() => action("trial"), ["22023"]);
});
await test("trial zero é indisponível", async () => {
  await as("root");
  await rpc("billing_plan_save", {
    p_id: plan,
    p_revision: 1,
    p_data: { ...planData, trial_days: 0 },
  });
  await as("adminA");
  await deny(() => action("trial"), ["22023"]);
});
await test("assinatura pendente recebe valor do banco, nunca frontend", async () => {
  await as("adminA");
  await action("subscribe");
  const x = await context();
  assert.equal(x.subscription.state, "pending");
  assert.equal(x.invoices[0].amount_cents, 9900);
  assert.equal(x.invoices[0].is_simulation, true);
});
await test("ação repetida devolve mesma cobrança e histórico único", async () => {
  await as("adminA");
  const key = randomUUID(),
    a = await action("subscribe", plan, 0, key),
    b = await action("subscribe", plan, 0, key);
  assert.deepEqual(a, b);
  assert.equal((await context()).invoices.length, 1);
  await deny(() => action("trial", plan, 0, key), ["22023"]);
});
await test("duas ações distintas não geram duas cobranças pendentes", async () => {
  await as("adminA");
  await action("subscribe");
  await deny(() => action("change"), ["22023"]);
  assert.equal((await context()).invoices.length, 1);
});
await test("mock desabilitado por padrão inclusive para superadmin", async () => {
  await as("adminA");
  const x = await action("subscribe");
  await as("root");
  await deny(() =>
    rpc("billing_mock_event", {
      p_invoice: x.invoice_id,
      p_state: "paid",
      p_amount: 9900,
      p_event: randomUUID(),
    }),
  );
});
await test("valor do webhook manipulado é rejeitado", async () => {
  await as("adminA");
  const x = await action("subscribe");
  await deny(() => mock(x.invoice_id, "paid", 1), ["22023"]);
});
await test("pagamento simulado ativa assinatura sem criar receita real", async () => {
  await active();
  const x = await context();
  assert.equal(x.subscription.state, "active");
  assert.equal(x.invoices[0].state, "paid");
  assert.equal(x.revenue_cents, null);
  assert.equal(x.real_payments_enabled, false);
});
await test("repetição de evento e pagamento com outro event_id não renova duas vezes", async () => {
  await as("adminA");
  const x = await action("subscribe"),
    event = randomUUID();
  await mock(x.invoice_id, "paid", 9900, event);
  const first = (await context()).subscription;
  await mock(x.invoice_id, "paid", 9900, event);
  await mock(x.invoice_id, "paid", 9900);
  const second = (await context()).subscription;
  assert.equal(second.revision, first.revision);
  assert.equal(second.period_end, first.period_end);
  await deny(() => mock(x.invoice_id, "refunded", 9900, event), ["22023"]);
});
await test("eventos fora de ordem não revertem pagamento", async () => {
  const invoice = await active();
  await deny(() => mock(invoice, "failed"), ["22023"]);
  assert.equal((await context()).subscription.state, "active");
});
await test("reembolso simulado preserva trilha e não duplica", async () => {
  const invoice = await active();
  await mock(invoice, "refunded");
  await mock(invoice, "refunded");
  assert.equal((await context()).invoices[0].state, "refunded");
});
await test("falha e vencimento não ativam assinatura", async () => {
  await as("adminA");
  const x = await action("subscribe");
  await mock(x.invoice_id, "overdue");
  assert.equal((await context()).subscription.state, "past_due");
});
await test("cancelamento de cobrança impede recebimento atrasado", async () => {
  await as("adminA");
  const x = await action("subscribe");
  await action("cancel_invoice");
  await deny(() => mock(x.invoice_id), ["22023"]);
});
await test("cancelamento ao fim mantém período e reativação antes do fim", async () => {
  await active();
  const before = (await context()).subscription.period_end;
  await action("cancel");
  assert.equal((await context()).subscription.cancel_at_end, true);
  assert.equal((await context()).subscription.effective_state, "active");
  await action("reactivate");
  assert.equal((await context()).subscription.cancel_at_end, false);
  assert.equal((await context()).subscription.period_end, before);
});
await test("downgrade agendado não muda limites correntes", async () => {
  await active(plus);
  const before = (await context()).subscription;
  await action("change", plan);
  const after = (await context()).subscription;
  assert.equal(after.plan_version_id, before.plan_version_id);
  assert.equal(after.pending_plan.price_cents, 9900);
  assert.equal(after.plan.human_support, true);
});
await test("upgrade só vigora após confirmação fictícia", async () => {
  await active();
  const change = await action("change", plus);
  assert.equal((await context()).subscription.plan.price_cents, 9900);
  await mock(change.invoice_id, "paid", 19900);
  assert.equal((await context()).subscription.plan.price_cents, 19900);
});
await test("renovação antecipada rejeitada e expirada permitida", async () => {
  await active();
  await deny(() => action("renew"), ["22023"]);
  await db.exec("reset role");
  await db.query(
    "update billing_subscriptions set period_start=now()-interval '2 months',period_end=now()-interval '1 day' where organization_id=$1",
    [orgs.A],
  );
  await as("adminA");
  assert.equal((await context()).subscription.effective_state, "expired");
  const x = await action("renew");
  await mock(x.invoice_id);
  assert.equal((await context()).subscription.effective_state, "active");
});
await test("suspensão impede confirmação pendente e retirada não concede gratuidade", async () => {
  await as("adminA");
  const x = await action("subscribe");
  await as("root");
  await rpc("billing_admin_state", {
    p_org: orgs.A,
    p_revision: 1,
    p_suspend: true,
    p_reason: "Suspensão fictícia de teste",
  });
  await deny(() => mock(x.invoice_id), ["22023"]);
  await rpc("billing_admin_state", {
    p_org: orgs.A,
    p_revision: 2,
    p_suspend: false,
    p_reason: "Revisão fictícia de teste",
  });
  assert.equal((await context()).subscription.state, "past_due");
});
await test("revogação de membro com sessão anterior impede próxima operação", async () => {
  await active();
  await db.exec("reset role");
  await db.query(
    "update organization_members set status='suspended' where organization_id=$1 and user_id=$2",
    [orgs.A, users.adminA],
  );
  await as("adminA");
  await deny(context);
  await deny(() => action("cancel", plan, 2));
});
await test("revogação de superadmin impede nova alteração", async () => {
  await db.query("update platform_roles set active=false where user_id=$1", [
    users.root,
  ]);
  await as("root");
  await deny(() => rpc("billing_admin_overview"));
});
await test("RLS A não lê invoices B e consumidor não lê billing", async () => {
  await active();
  await as("adminB");
  assert.equal(
    (await db.query("select * from billing_invoices")).rows.length,
    0,
  );
  await as("alice");
  assert.equal(
    (await db.query("select * from billing_subscriptions")).rows.length,
    0,
  );
});
await test("escrita direta de preço/status/uso e RPC do provedor negadas", async () => {
  await active();
  for (const table of [
    "billing_plans",
    "billing_subscriptions",
    "billing_invoices",
    "billing_usage",
  ])
    await deny(() => db.exec(`delete from ${table}`));
  await deny(() =>
    rpc("billing_provider_event", {
      p_event: randomUUID(),
      p_invoice: randomUUID(),
      p_state: "paid",
      p_amount: 1,
    }),
  );
});
await test("históricos, versões e uso são imutáveis inclusive no SQL privilegiado", async () => {
  await active();
  await db.exec("reset role");
  for (const table of [
    "billing_plan_versions",
    "billing_events",
    "billing_commands",
    "billing_webhooks",
  ])
    await deny(() => db.exec(`delete from ${table}`), ["23514"]);
});
await test("limite de serviços ativo no banco, edição e desativação preservadas", async () => {
  await active();
  await db.exec("reset role");
  await db.query(
    "insert into services(organization_id,name,price_mode,price_cents) values($1,'Quarto serviço','fixed',100)",
    [orgs.A],
  );
  await deny(
    () =>
      db.query(
        "insert into services(organization_id,name,price_mode,price_cents) values($1,'Quinto serviço','fixed',100)",
        [orgs.A],
      ),
    ["P0001"],
  );
  await db.query("update services set active=false where id=$1", [
    services.A[0],
  ]);
  await db.query(
    "insert into services(organization_id,name,price_mode,price_cents) values($1,'Novo serviço','fixed',100)",
    [orgs.A],
  );
  await deny(
    () =>
      db.query("update services set active=true where id=$1", [services.A[0]]),
    ["P0001"],
  );
});
await test("plano software não concede atendimento compartilhado, plano com equipe permite", async () => {
  await active();
  await db.exec("reset role");
  assert.equal(await scalar("select private.central_eligible($1,$2)",[orgs.A,users.agentA]),false);
  await as("adminA");
  const x = await action("change", plus);
  await mock(x.invoice_id, "paid", 19900);
  await as("adminA");
  await rpc('operations_support_mode',{p_org:orgs.A,p_mode:'shared',p_revision:await scalar('select revision from company_settings where organization_id=$1',[orgs.A])});
  await as("root");
  await scalar("select foundation_set_attendant($1,$2,'primary','active')",[orgs.A,users.agentA]);
  await as('adminA');
  const rev=()=>scalar('select revision from company_settings where organization_id=$1',[orgs.A]);
  const mid=await scalar('select company_create_manual($1,$2,$3)',[orgs.A,await rev(),'Condições compartilhadas fictícias']);
  await scalar('select company_publish_manual($1,$2,$3)',[orgs.A,mid,await rev()]);
  await scalar('select company_set_activation($1,$2,true,true)',[orgs.A,await rev()]);
  await db.exec("reset role");
  assert.equal(await scalar("select private.central_eligible($1,$2)",[orgs.A,users.agentA]),true);
  await as("agentA");
  await deny(()=>rpc("analytics_central",{p_org:orgs.A,p_from:"2026-01-01",p_to:"2026-12-31"}));

});
await test("todas as 75 tabelas públicas têm FORCE RLS e somente SELECT", async () => {
  await db.exec("reset role");
  const r = await db.query(
    "select relname,relrowsecurity,relforcerowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r'",
  );
  assert.equal(r.rows.length, 75);
  assert.ok(r.rows.every((x) => x.relrowsecurity && x.relforcerowsecurity));
  assert.equal(
    await scalar(
      "select count(*) from pg_policies where schemaname='public' and cmd<>'SELECT'",
    ),
    0,
  );
});
async function draft() {
  await as("alice");
  const p = await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" }),
    s = p.services.find((x) => x.price_mode === "fixed");
  return rpc("consumer_create_request", {
    p_slug: p.slug,
    p_revision: p.revision,
    p_service: s.code,
    p_addons: [],
    p_answers: { [s.questions[0].code]: "Veículo fictício" },
    p_customer: {
      name: "Pessoa fictícia",
      whatsapp: "81999990000",
      notice_version: "consumer-v1",
      accepted_notice: true,
    },
    p_notes: "",
    p_contact: false,
    p_expected_cents: 12000,
    p_key: randomUUID(),
  });
}
async function editLimits(patch) {
  await as("root");
  await rpc("billing_plan_save", {
    p_id: plan,
    p_revision: 1,
    p_data: { ...planData, ...patch },
  });
}
await test("limite mensal de solicitações valida envio e rollback de uso/ticket", async () => {
  await editLimits({ request_limit: 1 });
  await active();
  const q = await draft();
  await deny(
    () =>
      rpc("consumer_submit_request", {
        p_code: q.code,
        p_attachment_count: 0,
        p_key: randomUUID(),
      }),
    ["P0001"],
  );
  await as("adminA");
  assert.equal((await context()).usage.requests, 1);
  await db.exec("reset role");
  assert.equal(
    await scalar("select state from quote_requests where public_code=$1", [
      q.code,
    ]),
    "draft",
  );
});
await test("limite mensal de atendimentos não deixa envio parcialmente confirmado", async () => {
  await editLimits({ ticket_limit: 1 });
  await active();
  const q = await draft();
  await deny(
    () =>
      rpc("consumer_submit_request", {
        p_code: q.code,
        p_attachment_count: 0,
        p_key: randomUUID(),
      }),
    ["P0001"],
  );
  await as("adminA");
  const x = await context();
  assert.equal(x.usage.requests, 1);
  assert.equal(x.usage.tickets, 1);
});
await test("envio repetido não consome duas unidades", async () => {
  await active();
  const q = await draft(),
    key = randomUUID();
  await rpc("consumer_submit_request", {
    p_code: q.code,
    p_attachment_count: 0,
    p_key: key,
  });
  await rpc("consumer_submit_request", {
    p_code: q.code,
    p_attachment_count: 0,
    p_key: key,
  });
  await as("adminA");
  assert.equal((await context()).usage.requests, 2);
  assert.equal((await context()).usage.tickets, 2);
});
await test("limite de membros conta ativo, não concede bypass ao administrador", async () => {
  await editLimits({ member_limit: 2 });
  await active();
  await as("adminA");
  await deny(
    () =>
      scalar(
        "select foundation_set_member($1,$2,'colaborador_empresa','active')",
        [orgs.A, users.charlie],
      ),
    ["22023"],
  );
  await deny(
    () =>
      scalar(
        "select foundation_set_member($1,$2,'colaborador_empresa','active')",
        [orgs.A, users.adminB],
      ),
    ["P0001"],
  );
});
await test("assinatura expirada bloqueia interesse novo, preserva consulta e organização B", async () => {
  await active();
  await db.exec("reset role");
  await db.query(
    "update billing_subscriptions set period_start=now()-interval '2 months',period_end=now()-interval '1 day' where organization_id=$1",
    [orgs.A],
  );
  await as("adminA");
  assert.equal((await context()).subscription.effective_state, "expired");
  await deny(draft);
  await as("adminB");
  assert.equal(
    (await rpc("billing_context", { p_org: orgs.B })).subscription,
    null,
  );
});
await test("estado suspenso da empresa nega contexto sem aguardar fim de sessão", async () => {
  await active();
  await db.exec("reset role");
  await db.query("update organizations set status='suspended' where id=$1", [
    orgs.A,
  ]);
  await as("adminA");
  await deny(context);
});
await test("quota follow-up zero rejeita tentativa", async () => {
  await editLimits({ followup_limit: 0 });
  await active();
  await db.exec("reset role");
  const task = await scalar(
    "select id from commercial_tasks where organization_id=$1 limit 1",
    [orgs.A],
  );
  await deny(
    () =>
      db.query(
        "insert into commercial_attempts(organization_id,task_id,actor_id,outcome) values($1,$2,$3,'no_response')",
        [orgs.A, task, users.adminA],
      ),
    ["P0001"],
  );
});
await test("uso é isolado por empresa e não pode migrar por troca de parâmetros", async () => {
  await active();
  const q = await draft();
  await rpc("consumer_submit_request", {
    p_code: q.code,
    p_attachment_count: 0,
    p_key: randomUUID(),
  });
  await as("adminB");
  const b = await rpc("billing_context", { p_org: orgs.B });
  assert.equal(b.usage.requests, 1);
  assert.equal(b.invoices.length, 0);
  await deny(context);
});

await test("recurso de follow-up desabilitado bloqueia tentativa server-side", async () => {
  await editLimits({ commercial_followups: false });
  await active();
  await db.exec("reset role");
  const task = await scalar(
    "select id from commercial_tasks where organization_id=$1 limit 1",
    [orgs.A],
  );
  await deny(() =>
    db.query(
      "insert into commercial_attempts(organization_id,task_id,actor_id,outcome) values($1,$2,$3,'no_response')",
      [orgs.A, task, users.adminA],
    ),
  );
});
await test("uso do mês anterior não consome quota atual e ledger não duplica entidade", async () => {
  await active();
  await db.exec("reset role");
  const id = randomUUID();
  await db.query(
    "insert into billing_usage(organization_id,metric,entity_id,month,created_at) values($1,'requests',$2,(date_trunc('month',now() at time zone 'America/Recife')-interval '1 month')::date,now()-interval '1 month')",
    [orgs.A, id],
  );
  await deny(
    () =>
      db.query(
        "insert into billing_usage(organization_id,metric,entity_id,month) values($1,'requests',$2,current_date)",
        [orgs.A, id],
      ),
    ["23505"],
  );
  await as("adminA");
  assert.equal((await context()).usage.requests, 1);
});
await test("pagamento SaaS fictício não altera domínio financeiro do consumidor", async () => {
  await db.exec("reset role");
  const before = await scalar(
    "select coalesce(jsonb_agg(to_jsonb(x)),'[]') from payment_plans x",
  );
  await active();
  await db.exec("reset role");
  assert.deepEqual(
    await scalar(
      "select coalesce(jsonb_agg(to_jsonb(x)),'[]') from payment_plans x",
    ),
    before,
  );
});

await writeFile(
  "reports/billing-results.json",
  JSON.stringify(
    {
      environment:
        "LOCAL PGlite; simulated Auth/payment; NOT external homologation",
      results,
    },
    null,
    2,
  ),
);
await db.close();
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
