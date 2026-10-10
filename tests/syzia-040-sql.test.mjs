import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { seedCommercial } from "./fixtures/commercial.mjs";
const c = await consumerDB({ through: "202609250039_commercial_plans.sql" }),
  { db, as, rpc, scalar, orgs, services, save } = c;
const legacy = await seedCommercial(c),
  results = [],
  sessions = new Map();
const tables = (
  await db.query(
    "select schemaname,tablename from pg_tables where schemaname in('public','private')order by schemaname,tablename",
  )
).rows;
async function snapshot() {
  await db.exec("reset role");
  const out = {};
  for (const t of tables) {
    out[t.schemaname + "." + t.tablename] = await scalar(
      `select coalesce(jsonb_agg(j order by j::text),'[]')from(select to_jsonb(x)${t.tablename === "billing_plans" ? "-'featured'-'featured_label'" : ""} j from ${t.schemaname}.${t.tablename} x)q`,
    );
  }
  return out;
}
const before = await snapshot();
await db.exec(
  await readFile(
    "supabase/migrations/202609260040_post_homologation.sql",
    "utf8",
  ),
);
async function test(name, fn) {
  await db.exec("begin");
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS", name);
  } catch (e) {
    results.push({
      name,
      status: "FAIL",
      error: e.message,
      detail: e.detail,
      where: e.where,
    });
    console.error("FAIL", name, e.message, e.detail || "", e.where || "");
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
async function actor(name) {
  await as(name);
  if (sessions.has(name))
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({
        sub: users[name] || name,
        session_id: sessions.get(name),
        is_anonymous: false,
      }),
    ]);
}
async function service(fn, args) {
  await db.exec("reset role;set local role service_role");
  return rpc(fn, args);
}
async function person() {
  await db.exec("reset role");
  const id = randomUUID();
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())",
    [id, id + "@example.invalid"],
  );
  const account = await service("access_selfservice_identity", {
    p_user: id,
    p_name: "Titular Fictício",
    p_username: "titular." + id.replaceAll("-", "").slice(0, 14),
  });
  const sid = randomUUID();
  sessions.set(id, sid);
  assert.equal(
    await service("access_register_session", {
      p_user: id,
      p_session: sid,
      p_account: account.id,
      p_generation: account.generation,
    }),
    true,
  );
  await actor(id);
  return { ...account, id, account_id: account.id };
}
const base = {
  name: "Oferta configurada 040",
  description: "Plano fictício para testes locais",
  price_cents: 17900,
  interval_months: 1,
  trial_days: 7,
  active: true,
  available: true,
  site_visible: true,
  self_service: true,
  self_service_trial: true,
  position: 12,
  member_limit: null,
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
    human_support: false,
  },
};
async function plan(patch = {}) {
  await as("root");
  const id = await rpc("billing_plan_save", {
    p_id: null,
    p_revision: 0,
    p_data: {
      ...base,
      ...patch,
      capabilities: { ...base.capabilities, ...patch.capabilities },
    },
  });
  await db.exec("reset role");
  return (
    await db.query(
      "select v.*,p.name from billing_plan_versions v join billing_plans p on p.id=v.plan_id where p.id=$1",
      [id],
    )
  ).rows[0];
}
async function hom(v, org = orgs.A) {
  await as("root");
  const current = (await rpc("billing_context", { p_org: org })).homologation;
  return rpc("billing_homologation_set", {
    p_org: org,
    p_version: v?.id || null,
    p_expected: current?.id || null,
    p_reason: "Verificação local autorizada 040",
    p_key: randomUUID(),
  });
}
async function grants(user, actions, org = orgs.A) {
  await as(org === orgs.A ? "adminA" : "adminB");
  const team = await rpc("permissions_team", { p_org: org }),
    member = team.members.find((x) => x.user_id === users[user]);
  return rpc("permissions_save", {
    p_org: org,
    p_user: users[user],
    p_revision: member.revision,
    p_grants: actions.map((action) => ({
      action,
      scope: "organization",
      granted: true,
    })),
    p_key: randomUUID(),
  });
}
async function draft(v, user, doc = "52998224725") {
  await actor(user);
  return rpc("selfservice_save", {
    p_id: null,
    p_revision: 0,
    p_name: "Negócio Fictício 040",
    p_slug: "teste040-" + randomUUID().slice(0, 8),
    p_phone: "11999990000",
    p_kind: "CPF",
    p_document: doc,
    p_plan: v.plan_id,
    p_key: randomUUID(),
  });
}
async function finish(d) {
  return rpc("selfservice_complete", {
    p_id: d.id,
    p_revision: d.revision,
    p_consent: true,
    p_conditions: "selfservice-040",
  });
}
await test("01 Upgrade 039→040 preserva todas as linhas anteriores em banco populado", async () =>
  assert.deepEqual(await snapshot(), before));
await test("02 Trial novo automático: 7 dias configurados, consentimento, sem pagamento, onboarding existente e idempotência", async () => {
  const v = await plan(),
    u = await person();
  const d = await draft(v, u.id);
  assert.equal(d.state, "ready");
  await denied(
    () =>
      rpc("selfservice_complete", {
        p_id: d.id,
        p_revision: d.revision,
        p_consent: false,
        p_conditions: "selfservice-040",
      }),
    /consent/,
  );
  const x = await finish(d);
  assert.equal(x.state, "completed");
  assert.deepEqual(await finish(d), x);
  await db.exec("reset role");
  assert.equal(
    await scalar("select count(*)::int from private.selfservice_payments"),
    0,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from private.trial_grants where organization_id=$1",
      [x.organization_id],
    ),
    1,
  );
  assert.equal(
    await scalar(
      "select round(extract(epoch from(period_end-period_start))/86400)::int from billing_subscriptions where organization_id=$1",
      [x.organization_id],
    ),
    7,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from organization_members where organization_id=$1 and user_id=$2",
      [x.organization_id, u.id],
    ),
    1,
  );
  assert.ok(
    await scalar(
      "select to_regprocedure('public.onboarding_context(uuid)')is not null",
    ),
  );
  assert.deepEqual(
    await scalar(
      "select jsonb_build_array(payment_reference,simulation,conditions_version)from private.selfservice_consents where draft_id=$1",
      [d.id],
    ),
    [null, false, "selfservice-040"],
  );
});
await test("03 Trial consumido por mesma identidade/documento não gera novo trial nem análise", async () => {
  const v = await plan(),
    u = await person(),
    d = await draft(v, u.id);
  await finish(d);
  const repeat = await draft(v, u.id, "11144477735");
  assert.equal(repeat.eligibility, "previous_identity");
  const other = await person();
  const duplicate = await draft(v, other.id);
  assert.equal(duplicate.eligibility, "previous_identity");
  const deniedDraft = await finish(duplicate);
  assert.equal(deniedDraft.eligibility, "previous_identity");
  await db.exec("reset role");
  assert.equal(
    await scalar("select count(*)::int from private.trial_requests"),
    0,
  );
  assert.equal(
    await scalar("select count(*)::int from private.trial_grants"),
    1,
  );
});
await test("04 Fallback inconclusivo respeita política manual, sem ativar trial", async () => {
  const v = await plan(),
    u = await person();
  await db.exec(
    "reset role;update private.trial_policy set auto_enabled=false",
  );
  const d = await draft(v, u.id);
  assert.equal(d.eligibility, "manual_policy");
  assert.equal((await finish(d)).state, "review");
});
await test("05 Empresa existente confirma documento e ativa trial automaticamente sem fatura", async () => {
  const v = await plan();
  await db.exec("reset role");
  await db.query("delete from billing_subscriptions where organization_id=$1", [
    orgs.A,
  ]);
  await as("adminA");
  const x = await rpc("billing_trial_confirm", {
    p_org: orgs.A,
    p_kind: "CPF",
    p_document: "52998224725",
    p_plan: v.plan_id,
    p_revision: 0,
    p_key: randomUUID(),
  });
  assert.ok(x);
  assert.equal(
    (await rpc("billing_context", { p_org: orgs.A })).subscription.state,
    "trial",
  );
  await db.exec("reset role");
  assert.equal(await scalar("select count(*)::int from billing_invoices"), 0);
  assert.equal(
    await scalar(
      "select count(*)::int from private.trial_grants where organization_id=$1",
      [orgs.A],
    ),
    1,
  );
});
await test("06 Trial configurado usa duração efetiva sem nome nem preço hardcoded", async () => {
  const v = await plan({
      name: "Nome alternativo",
      price_cents: 22345,
      trial_days: 11,
    }),
    u = await person(),
    d = await draft(v, u.id);
  const x = await finish(d);
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select round(extract(epoch from(period_end-period_start))/86400)::int from billing_subscriptions where organization_id=$1",
      [x.organization_id],
    ),
    11,
  );
});
await test("07 Homologação aplica, troca e remove sem tocar assinatura, trial, pagamento ou dados operacionais", async () => {
  const v = await plan(),
    w = await plan({
      capabilities: {
        finance: false,
        analytics: false,
        commercial_followups: false,
      },
    });
  const stable = await snapshot();
  await hom(v);
  await as("adminA");
  assert.equal(
    (await rpc("permissions_context", { p_org: orgs.A })).homologation.name,
    v.name,
  );
  await denied(
    () =>
      rpc("billing_subscription_action", {
        p_org: orgs.A,
        p_action: "trial",
        p_plan: v.plan_id,
        p_revision: 1,
        p_key: randomUUID(),
      }),
    /homologation_trial/,
  );
  await hom(w);
  await hom(null);
  const after = await snapshot();
  for (const t of [
    "public.billing_subscriptions",
    "private.trial_grants",
    "public.billing_invoices",
    "public.financial_accounts",
    "public.quote_requests",
    "public.quote_versions",
    "public.appointments",
    "private.organization_exemptions",
  ])
    assert.deepEqual(after[t], stable[t], t);
  await as("adminA");
  assert.equal(
    (await rpc("billing_context", { p_org: orgs.A })).homologation,
    null,
  );
});
await test("08 Homologação é exclusiva SuperAdmin, auditada, com concorrência e replay", async () => {
  const v = await plan();
  await as("adminA");
  await denied(() =>
    rpc("billing_homologation_set", {
      p_org: orgs.A,
      p_version: v.id,
      p_expected: null,
      p_reason: "Teste de autorização global",
      p_key: randomUUID(),
    }),
  );
  await as("root");
  const args = {
      p_org: orgs.A,
      p_version: v.id,
      p_expected: null,
      p_reason: "Teste de idempotência global",
      p_key: randomUUID(),
    },
    x = await rpc("billing_homologation_set", args);
  assert.deepEqual(await rpc("billing_homologation_set", args), x);
  await denied(
    () => rpc("billing_homologation_set", { ...args, p_key: randomUUID() }),
    /homologation_conflict/,
  );
  await db.exec("reset role");
  assert.ok(
    await scalar(
      "select count(*)::int from audit_logs where action='plan_homologation_applied'",
    ),
  );
});
for (const [name, limit, advanced, human] of [
  ["Essencial", 1, false, false],
  ["Profissional", 3, true, false],
  ["Equipe", 8, true, false],
  ["Assistido", 5, true, true],
])
  await test(
    "09 Matriz " + name + ": capabilities por RPC/RLS e limites reais",
    async () => {
      const v = await plan({
        name,
        member_limit: limit,
        capabilities: {
          finance: advanced,
          analytics: advanced,
          commercial_followups: advanced,
          human_support: human,
        },
      });
      await hom(v);
      await as("adminA");
      const cap = await rpc("billing_capabilities", { p_org: orgs.A }),
        p = await rpc("permissions_context", { p_org: orgs.A });
      for (const k of ["finance", "analytics", "commercial_followups"])
        assert.equal(cap[k], advanced);
      assert.equal(cap.human_support, human);
      for (const k of [
        "home.read",
        "clients.read",
        "central.read",
        "quotes.read",
        "agenda.read",
        "services.read",
        "page.read",
        "people.manage",
      ])
        assert.equal(p.actions[k].allowed, true, k);
      assert.equal(p.actions["followup.read"].allowed, advanced);
      const finance = () =>
          rpc("financial_summary", {
            p_org: orgs.A,
            p_from: "2026-09-01",
            p_to: "2026-09-26",
          }),
        analytics = () =>
          rpc("analytics_company", {
            p_org: orgs.A,
            p_from: "2026-09-01",
            p_to: "2026-09-26",
          });
      if (advanced) {
        assert.ok(await finance());
        assert.ok(await analytics());
      } else {
        await denied(finance);
        await denied(analytics);
        assert.equal(
          await scalar("select count(*)::int from financial_accounts"),
          0,
        );
      }
      await db.exec("reset role");
      assert.equal(
        await scalar(
          "select member_limit from private.billing_effective_version($1)",
          [orgs.A],
        ),
        limit,
      );
    },
  );
await test("10 Limite de membro real bloqueia inclusão sem apagar membros no downgrade", async () => {
  const v = await plan({ member_limit: 1 });
  await hom(v);
  await db.exec("reset role");
  const n = await scalar(
    "select count(*)::int from organization_members where organization_id=$1",
    [orgs.A],
  );
  await denied(
    () =>
      scalar("select private.billing_assert_capacity($1,'members')", [orgs.A]),
    /billing_limit_reached/,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from organization_members where organization_id=$1",
      [orgs.A],
    ),
    n,
  );
});
await test("11 Destaque troca exclusivamente a apresentação, sem nova versão/capacidade/preço", async () => {
  const a = await plan(),
    b = await plan({ name: "Outro plano" });
  const old = await scalar(
    "select jsonb_agg(to_jsonb(x)order by id)from billing_plan_versions x",
  );
  await as("root");
  await rpc("billing_plan_feature", {
    p_plan: a.plan_id,
    p_label: "Mais recomendado",
    p_previous: null,
  });
  await denied(
    () =>
      rpc("billing_plan_feature", {
        p_plan: b.plan_id,
        p_label: "Equipe recomenda",
        p_previous: null,
      }),
    /featured_plan_changed/,
  );
  await rpc("billing_plan_feature", {
    p_plan: b.plan_id,
    p_label: "Equipe recomenda",
    p_previous: a.plan_id,
  });
  await as("anon");
  const plans = await rpc("acquisition_plans");
  assert.equal(plans.filter((p) => p.featured).length, 1);
  assert.equal(
    plans.find((p) => p.featured).featured_label,
    "Equipe recomenda",
  );
  await db.exec("reset role");
  assert.deepEqual(
    await scalar(
      "select jsonb_agg(to_jsonb(x)order by id)from billing_plan_versions x",
    ),
    old,
  );
  await as("adminA");
  await denied(() =>
    rpc("billing_plan_feature", {
      p_plan: null,
      p_label: "-",
      p_previous: b.plan_id,
    }),
  );
});
await test("12 Sem grant colaborador não assume; grant explícito permite fila geral→Minha fila", async () => {
  await grants("worker", ["central.read"]);
  await as("worker");
  let ctx = await rpc("central_context", { p_code: legacy.codes.A });
  assert.equal(ctx.claim_eligible, false);
  await denied(
    () =>
      rpc("central_act", {
        p_code: legacy.codes.A,
        p_revision: ctx.ticket.revision,
        p_action: "claim",
        p_data: {},
        p_key: randomUUID(),
      }),
    /central_claim_permission_required/,
  );
  await grants("worker", ["central.read", "central.manage", "central.reply"]);
  await as("worker");
  await rpc("central_presence", { p_state: "available" });
  ctx = await rpc("central_context", { p_code: legacy.codes.A });
  assert.equal(ctx.claim_eligible, true);
  await rpc("central_act", {
    p_code: legacy.codes.A,
    p_revision: ctx.ticket.revision,
    p_action: "claim",
    p_data: {},
    p_key: randomUUID(),
  });
  assert.ok(
    (
      await rpc("central_queue", {
        p_org: orgs.A,
        p_search: "",
        p_state: null,
        p_mine: true,
      })
    ).tickets.some((t) => t.code === legacy.codes.A),
  );
  assert.ok(
    !(
      await rpc("central_queue", {
        p_org: orgs.A,
        p_search: "",
        p_state: null,
        p_mine: false,
        p_view: "general",
      })
    ).tickets.some((t) => t.code === legacy.codes.A),
  );
});
await test("13 Revogação de grant em sessão aberta impede próxima resposta", async () => {
  await grants("worker", ["central.read", "central.manage", "central.reply"]);
  await as("worker");
  await rpc("central_presence", { p_state: "available" });
  let ctx = await rpc("central_context", { p_code: legacy.codes.A });
  await rpc("central_act", {
    p_code: legacy.codes.A,
    p_revision: ctx.ticket.revision,
    p_action: "claim",
    p_data: {},
    p_key: randomUUID(),
  });
  await grants("worker", ["central.read"]);
  await as("worker");
  ctx = await rpc("central_context", { p_code: legacy.codes.A });
  await denied(() =>
    rpc("central_act", {
      p_code: legacy.codes.A,
      p_revision: ctx.ticket.revision,
      p_action: "message",
      p_data: { body: "Bloqueada" },
      p_key: randomUUID(),
    }),
  );
});
await test("14 Presença ausente retorna causa específica sem falso unauthorized", async () => {
  await grants("worker", ["central.read", "central.manage", "central.reply"]);
  await as("worker");
  const ctx = await rpc("central_context", { p_code: legacy.codes.A });
  await denied(
    () =>
      rpc("central_act", {
        p_code: legacy.codes.A,
        p_revision: ctx.ticket.revision,
        p_action: "claim",
        p_data: {},
        p_key: randomUUID(),
      }),
    /central_presence_required/,
  );
});
await test("15 Upgrade/downgrade e human_support revogam compartilhado sem apagar operação", async () => {
  const no = await plan(),
    yes = await plan({ capabilities: { human_support: true } });
  await hom(yes);
  await as("agentA");
  assert.ok(await rpc("central_context", { p_code: legacy.codes.A }));
  await hom(no);
  await as("agentA");
  await denied(() => rpc("central_context", { p_code: legacy.codes.A }));
  await as("root");
  await denied(
    () =>
      rpc("foundation_set_attendant", {
        p_org: orgs.A,
        p_user: users.agentA,
        p_kind: "primary",
        p_status: "active",
      }),
    /human_support_required/,
  );
  await hom(yes);
  await as("agentA");
  await denied(() => rpc("central_context", { p_code: legacy.codes.A }));
  await as("root");
  await rpc("foundation_set_attendant", {
    p_org: orgs.A,
    p_user: users.agentA,
    p_kind: "primary",
    p_status: "active",
  });
  await as("agentA");
  assert.ok(await rpc("central_context", { p_code: legacy.codes.A }));
});
await test("16 Identidade publicada acompanha contexto seguro sem expor rascunho ou outro tenant", async () => {
  await as("adminA");
  const old = await rpc("consumer_presence_context", { p_org: orgs.A });
  const branding = { ...old.branding, primary_color: "#C52831", theme: "dark" };
  await rpc("consumer_branding_save", {
    p_org: orgs.A,
    p_revision: old.revision,
    p_data: branding,
  });
  const preview = await rpc("consumer_page_draft", {
    p_org: orgs.A,
    p_show_prices: true,
  });
  await rpc("consumer_publish_draft", {
    p_org: orgs.A,
    p_token: preview.token,
    p_show_prices: true,
    p_expected_revision: preview.page_revision,
  });
  const published = (
    await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" })
  ).branding;
  await as("alice");
  assert.deepEqual(
    (await rpc("consumer_request_context", { p_code: legacy.requests.A }))
      .branding,
    published,
  );
  await as("bob");
  await denied(() =>
    rpc("consumer_request_context", { p_code: legacy.requests.A }),
  );
  await as("adminB");
  await denied(() =>
    rpc("operations_directory", { p_org: orgs.A, p_search: "", p_offset: 0 }),
  );
});
await test("17 Agenda pendente de proposta, aprovada libera, erro e dia sem horários distinguíveis por RPC", async () => {
  await as("alice");
  let ctx = await rpc("consumer_request_context", {
    p_code: legacy.requests.A,
  });
  assert.equal(ctx.booking.ready, false);
  assert.equal(ctx.booking.reason, "proposal_required");
  await rpc("consumer_approve_quote", {
    p_code: ctx.code,
    p_version: ctx.current_version,
    p_key: randomUUID(),
  });
  ctx = await rpc("consumer_request_context", { p_code: ctx.code });
  assert.equal(ctx.booking.ready, true);
  assert.deepEqual(
    await rpc("consumer_request_slots", {
      p_code: ctx.code,
      p_day: "2000-01-01",
    }),
    [],
  );
  await denied(
    () =>
      rpc("consumer_request_slots", { p_code: ctx.code, p_day: "not-a-date" }),
    /date|syntax/,
  );
});
await test("18 Engines, tabelas de homologação e edição global não são acessíveis diretamente", async () => {
  await as("adminA");
  await denied(
    () => db.query("select * from private.billing_plan_homologations"),
    /permission denied/,
  );
  await denied(() =>
    rpc("people_staff_edit", {
      p_user: users.agentA,
      p_name: "Não permitido",
      p_username: "nao.permitido",
      p_email: "teste@example.invalid",
      p_phone: "",
    }),
  );
  for (const f of [
    "private.billing_effective_version(uuid)",
    "private.billing_homologation(uuid)",
    "private.consumer_booking_status(quote_requests)",
  ])
    assert.equal(
      await scalar(
        "select has_function_privilege('authenticated',$1,'EXECUTE')",
        [f],
      ),
      false,
    );
});
await test("19 Atendente próprio: papel explícito e grants permitem assumir sem human_support", async () => {
  await as("adminA");
  await rpc("operations_set_attendant", {
    p_org: orgs.A,
    p_user: users.worker,
    p_enabled: true,
  });
  await grants("worker", ["central.read", "central.manage", "central.reply"]);
  const v = await plan({ capabilities: { human_support: false } });
  await hom(v);
  await as("worker");
  await rpc("central_presence", { p_state: "available" });
  const ctx = await rpc("central_context", { p_code: legacy.codes.A });
  assert.equal(ctx.claim_eligible, true);
  await rpc("central_act", {
    p_code: legacy.codes.A,
    p_revision: ctx.ticket.revision,
    p_action: "claim",
    p_data: {},
    p_key: randomUUID(),
  });
});
await test("20 Dois atendentes não assumem o mesmo ticket; transferência move a responsabilidade", async () => {
  await as("agentA");
  const ctx = await rpc("central_context", { p_code: legacy.codes.A });
  await rpc("central_act", {
    p_code: legacy.codes.A,
    p_revision: ctx.ticket.revision,
    p_action: "claim",
    p_data: {},
    p_key: randomUUID(),
  });
  await as("backup");
  await denied(
    () =>
      rpc("central_act", {
        p_code: legacy.codes.A,
        p_revision: ctx.ticket.revision,
        p_action: "claim",
        p_data: {},
        p_key: randomUUID(),
      }),
    /conflict|claimed|owned/,
  );
  await as("agentA");
  const current = await rpc("central_context", { p_code: legacy.codes.A });
  await rpc("central_act", {
    p_code: legacy.codes.A,
    p_revision: current.ticket.revision,
    p_action: "transfer",
    p_data: { user_id: users.backup },
    p_key: randomUUID(),
  });
  await as("backup");
  assert.ok(
    (await rpc("central_queue", { p_org: orgs.A, p_mine: true })).tickets.some(
      (t) => t.code === legacy.codes.A,
    ),
  );
});
async function staff() {
  await as("root");
  const x = await rpc("people_reserve", {
    p_display: "Atendente Global Fictício",
    p_username: "atendente." + randomUUID().replaceAll("-", "").slice(0, 12),
    p_email: randomUUID() + "@example.invalid",
    p_phone: "",
    p_role: "syzia_staff",
    p_key: randomUUID(),
  });
  await db.exec("reset role");
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())",
    [x.user_id, "staff-" + x.user_id + "@example.invalid"],
  );
  await service("access_finish_provision_link", {
    p_id: x.id,
    p_actor: users.root,
    p_hash: "a".repeat(64),
    p_link_hash: "b".repeat(64),
  });
  return x;
}
await test("21 Equipe SYZIA provisionada globalmente sem membership; ADM não altera identidade nem credenciais", async () => {
  const x = await staff();
  await as("root");
  const p = (await rpc("people_directory")).find((p) => p.id === x.user_id);
  assert.equal(p.kind, "syzia_staff");
  assert.equal(p.state, "pending");
  assert.equal(p.links.length, 0);
  await rpc("people_staff_edit", {
    p_user: x.user_id,
    p_name: "Nome Global Editado",
    p_username: p.username,
    p_email: "contato040@example.invalid",
    p_phone: "11999990000",
  });
  assert.equal(
    (await rpc("people_directory")).find((p) => p.id === x.user_id).name,
    "Nome Global Editado",
  );
  await denied(
    () =>
      rpc("people_link", {
        p_user: x.user_id,
        p_org: orgs.A,
        p_role: "colaborador_empresa",
        p_active: true,
      }),
    /platform_staff_requires_assignment|access_denied/,
  );
  await as("adminA");
  await denied(() =>
    rpc("people_staff_edit", {
      p_user: x.user_id,
      p_name: "Alteração indevida",
      p_username: p.username,
      p_email: "contato040@example.invalid",
      p_phone: "",
    }),
  );
  await denied(() =>
    rpc("people_staff_state", { p_user: x.user_id, p_active: false }),
  );
  await denied(
    () => rpc("access_manage", { p_id: x.id, p_action: "disable" }),
    /shared_identity_requires_superadmin/,
  );
});
await test("22 Equipe SYZIA suspende, desativa e reativa sem criar membership ou reativar atribuições automaticamente", async () => {
  const x = await staff();
  await as("root");
  await rpc("people_permissions", {
    p_user: x.user_id,
    p_permissions: ["shared.attend"],
  });
  await rpc("foundation_set_attendant", {
    p_org: orgs.A,
    p_user: x.user_id,
    p_kind: "backup",
    p_status: "active",
  });
  await rpc("foundation_set_attendant", {
    p_org: orgs.B,
    p_user: x.user_id,
    p_kind: "backup",
    p_status: "active",
  });
  await rpc("people_staff_state", { p_user: x.user_id, p_active: false });
  const disabled = (await rpc("people_directory")).find(
    (p) => p.id === x.user_id,
  );
  assert.equal(disabled.state, "disabled");
  assert.ok(disabled.assignments.every((a) => a.status === "suspended"));
  await rpc("people_staff_state", { p_user: x.user_id, p_active: true });
  const active = (await rpc("people_directory")).find(
    (p) => p.id === x.user_id,
  );
  assert.equal(active.state, "pending");
  assert.equal(active.status, "active");
  assert.equal(active.links.length, 0);
  assert.ok(active.assignments.every((a) => a.status === "suspended"));
});
await test("23 Atribuições A e B são independentes; suspender A conserva B e nega A", async () => {
  await as("root");
  await rpc("foundation_set_attendant", {
    p_org: orgs.A,
    p_user: users.shared,
    p_kind: "backup",
    p_status: "suspended",
  });
  await as("shared");
  await denied(() => rpc("central_context", { p_code: legacy.codes.A }));
  assert.ok(await rpc("central_context", { p_code: legacy.codes.B }));
});
await test("24 ADM ajusta grants locais da equipe sem ultrapassar teto global ou liberar financeiro irrestrito", async () => {
  await as("adminA");
  const t = await rpc("permissions_team", { p_org: orgs.A }),
    m = t.members.find((x) => x.user_id === users.agentA);
  assert.equal(m.role, "shared_attendant");
  await denied(
    () =>
      rpc("permissions_save", {
        p_org: orgs.A,
        p_user: users.agentA,
        p_revision: m.revision,
        p_grants: [
          {
            action: "finance.accounts.read",
            scope: "organization",
            granted: true,
          },
        ],
        p_key: randomUUID(),
      }),
    /permission_role_ceiling/,
  );
  await denied(() =>
    rpc("people_permissions", {
      p_user: users.agentA,
      p_permissions: ["people.read"],
    }),
  );
});
await test("25 Clientes existem antes da proposta/claim e leitura requer clients.read", async () => {
  await as("adminA");
  const p = await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" }),
    s = p.services.find((x) => x.price_mode === "fixed");
  async function request() {
    await as("charlie");
    const q = await rpc("consumer_create_request", {
      p_slug: p.slug,
      p_revision: p.revision,
      p_service: s.code,
      p_addons: [],
      p_answers: Object.fromEntries(
        s.questions
          .filter((x) => x.required)
          .map((x) => [x.code, "Resposta fictícia"]),
      ),
      p_customer: {
        name: "Cliente Novo Fictício",
        whatsapp: "81999991111",
        accepted_notice: true,
        notice_version: "consumer-v1",
      },
      p_notes: "Solicitação inicial",
      p_contact: false,
      p_expected_cents: 12000,
      p_key: randomUUID(),
    });
    await rpc("consumer_submit_request", {
      p_code: q.code,
      p_attachment_count: 0,
      p_key: randomUUID(),
    });
    return q;
  }
  const a = await request(),
    b = await request();
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(distinct customer_id)::int from quote_requests where public_code=any($1)",
      [[a.code, b.code]],
    ),
    1,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from quote_versions where request_id in(select id from quote_requests where public_code=any($1))and kind='final'",
      [[a.code, b.code]],
    ),
    0,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from tickets where request_id in(select id from quote_requests where public_code=any($1))",
      [[a.code, b.code]],
    ),
    2,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from tickets where request_id in(select id from quote_requests where public_code=any($1))and assignee_id is not null",
      [[a.code, b.code]],
    ),
    0,
  );
  await grants("worker", []);
  await as("worker");
  await denied(() =>
    rpc("operations_directory", { p_org: orgs.A, p_search: "", p_offset: 0 }),
  );
  await grants("worker", ["clients.read"]);
  await as("worker");
  assert.match(
    JSON.stringify(
      await rpc("operations_directory", {
        p_org: orgs.A,
        p_search: "Cliente Novo",
        p_offset: 0,
      }),
    ),
    /Cliente Novo/,
  );
});
await test("26 Revogar sessão global invalida RPC subsequente sem logout do navegador", async () => {
  const u = await person();
  await as("root");
  await rpc("people_revoke", { p_user: u.id });
  await actor(u.id);
  await denied(() => rpc("selfservice_context"));
});
await test("27 Homologação restaura isenção legítima e conserva evidência de concessão", async () => {
  await as("root");
  await rpc("billing_exemption_set", {
    p_org: orgs.A,
    p_kind: "internal",
    p_capabilities: {
      software: true,
      human_support: true,
      commercial_followups: true,
    },
    p_reason: "Concessão interna anterior à homologação",
    p_key: randomUUID(),
  });
  const old = (await rpc("billing_context", { p_org: orgs.A })).exemption;
  const v = await plan({
    capabilities: {
      finance: false,
      analytics: false,
      commercial_followups: false,
      human_support: false,
    },
  });
  await hom(v);
  await as("adminA");
  assert.equal(
    (await rpc("billing_capabilities", { p_org: orgs.A })).human_support,
    false,
  );
  await hom(null);
  await as("adminA");
  assert.equal(
    (await rpc("billing_capabilities", { p_org: orgs.A })).human_support,
    true,
  );
  assert.deepEqual(
    (await rpc("billing_context", { p_org: orgs.A })).exemption,
    old,
  );
});
await test("28 Limites e dados sobrevivem à retirada de plano em empresa sem assinatura", async () => {
  await db.exec("reset role");
  await db.query("delete from billing_subscriptions where organization_id=$1", [
    orgs.A,
  ]);
  const n = await scalar(
      "select count(*)::int from quote_requests where organization_id=$1",
      [orgs.A],
    ),
    v = await plan();
  await hom(v);
  await as("adminA");
  assert.equal(
    (await rpc("billing_capabilities", { p_org: orgs.A })).finance,
    true,
  );
  await hom(null);
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*)::int from quote_requests where organization_id=$1",
      [orgs.A],
    ),
    n,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from billing_subscriptions where organization_id=$1",
      [orgs.A],
    ),
    0,
  );
});

await test("29 Fallback de empresa existente permite concessão manual e extensão auditadas", async () => {
  const v = await plan();
  await db.exec(
    "reset role;update private.trial_policy set auto_enabled=false",
  );
  await db.query("delete from billing_subscriptions where organization_id=$1", [
    orgs.A,
  ]);
  await as("adminA");
  const review = await rpc("billing_trial_confirm", {
    p_org: orgs.A,
    p_kind: "CPF",
    p_document: "52998224725",
    p_plan: v.plan_id,
    p_revision: 0,
    p_key: randomUUID(),
  });
  assert.equal(review.review_required, true);
  await as("root");
  await rpc("billing_trial_admin", {
    p_org: orgs.A,
    p_action: "approve",
    p_request: review.request_id,
    p_revision: 0,
    p_days: 9,
    p_reason: "Concessão administrativa de teste preservada",
    p_override: true,
    p_key: randomUUID(),
  });
  await db.exec("reset role");
  let sub = (
    await db.query(
      "select *from billing_subscriptions where organization_id=$1",
      [orgs.A],
    )
  ).rows[0];
  await as("root");
  await rpc("billing_trial_admin", {
    p_org: orgs.A,
    p_action: "extend",
    p_request: null,
    p_revision: sub.revision,
    p_days: 2,
    p_reason: "Extensão administrativa preservada na rodada",
    p_override: true,
    p_key: randomUUID(),
  });
  await db.exec("reset role");
  assert.equal(
    await scalar("select count(*)::int from private.trial_extensions"),
    1,
  );
  assert.equal(await scalar("select count(*)::int from billing_invoices"), 0);
  assert.equal(
    await scalar(
      "select count(*)::int from private.trial_audit where action in('approve','extend')and organization_id=$1",
      [orgs.A],
    ),
    2,
  );
});
await test("30 Trial usado em empresa existente é conclusivo e mantém todos os identificadores", async () => {
  const v = await plan();
  await db.exec("reset role");
  await db.query("delete from billing_subscriptions where organization_id=$1", [
    orgs.A,
  ]);
  await as("adminA");
  const args = {
    p_org: orgs.A,
    p_kind: "CPF",
    p_document: "52998224725",
    p_plan: v.plan_id,
    p_revision: 0,
    p_key: randomUUID(),
  };
  await rpc("billing_trial_confirm", args);
  await db.exec("reset role");
  await db.query("delete from billing_subscriptions where organization_id=$1", [
    orgs.A,
  ]);
  await as("adminA");
  const used = await rpc("billing_trial_confirm", {
    ...args,
    p_document: "11144477735",
    p_key: randomUUID(),
  });
  assert.equal(used.eligible, false);
  assert.equal(used.review_required, false);
  await db.exec("reset role");
  assert.equal(
    await scalar("select count(*)::int from private.trial_requests"),
    0,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from private.trial_identifiers where organization_id=$1 and kind='business'",
      [orgs.A],
    ),
    2,
  );
});
await test("31 Financeiro por RLS: acesso permitido vê registro; downgrade na sessão oculta sem apagar", async () => {
  const yes = await plan(),
    no = await plan({
      capabilities: {
        finance: false,
        analytics: false,
        commercial_followups: false,
      },
    });
  await hom(yes);
  await as("adminA");
  const account = await rpc("financial_account_save", {
    p_org: orgs.A,
    p_id: null,
    p_revision: 0,
    p_data: {
      description: "Conta operacional fictícia 040",
      total_cents: 17000,
    },
    p_key: randomUUID(),
  });
  assert.ok(
    await scalar(
      "select count(*)::int from financial_accounts where organization_id=$1",
      [orgs.A],
    ),
  );
  await hom(no);
  await as("adminA");
  assert.equal(
    await scalar(
      "select count(*)::int from financial_accounts where organization_id=$1",
      [orgs.A],
    ),
    0,
  );
  await hom(yes);
  await as("adminA");
  assert.ok(
    await scalar(
      "select count(*)::int from financial_accounts where organization_id=$1",
      [orgs.A],
    ),
  );
});
await test("32 Reemissão de credencial global exclusiva SuperAdmin invalida hash/link e preserva histórico", async () => {
  const x = await staff();
  await denied(
    () =>
      service("access_reset_link", {
        p_id: x.id,
        p_actor: users.adminA,
        p_hash: "c".repeat(64),
        p_link_hash: "d".repeat(64),
      }),
    /access_denied/,
  );
  await service("access_reset_link", {
    p_id: x.id,
    p_actor: users.root,
    p_hash: "c".repeat(64),
    p_link_hash: "d".repeat(64),
  });
  await db.exec("reset role");
  const row = (
    await db.query(
      "select code_hash,activation_link_hash,generation from private.enterprise_accounts where id=$1",
      [x.id],
    )
  ).rows[0];
  assert.equal(row.code_hash, "c".repeat(64));
  assert.equal(row.activation_link_hash, "d".repeat(64));
  assert.ok(row.generation > 1);
  assert.ok(
    await scalar(
      "select count(*)::int from audit_logs where action='access_reset'",
    ),
  );
});
await writeFile(
  "reports/syzia-040/sql.json",
  JSON.stringify(
    {
      engine: process.env.FOUNDATION_NATIVE_SOCKET
        ? "PostgreSQL local + fixture Auth, sem serviços externos"
        : "PGlite local + fixture Auth, sem serviços externos",
      tablesPreserved: tables.length,
      results,
    },
    null,
    2,
  ),
);
await db.close();
if (results.some((x) => x.status === "FAIL")) process.exitCode = 1;
