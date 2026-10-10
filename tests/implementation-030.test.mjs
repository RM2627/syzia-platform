import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { seedCommercial } from "./fixtures/commercial.mjs";
const c = await consumerDB({ through: "202609200029_authorized_support.sql" }),
  { db, as, rpc, scalar, orgs } = c;
const fixture = await seedCommercial(c);
const results = [];
// Populate progress and trial history before the incremental upgrade; null snapshots
// would not prove preservation of these two persistent product paths.
await db.exec("begin");
await as("adminA");
let legacyGuide = await rpc("onboarding_act", {
  p_org: orgs.A,
  p_action: "start",
  p_revision: 0,
  p_key: randomUUID(),
});
legacyGuide = await rpc("onboarding_act", {
  p_org: orgs.A,
  p_action: "next",
  p_revision: legacyGuide.guide.revision,
  p_key: randomUUID(),
});
assert.equal(legacyGuide.guide.step, 1);
await db.exec("reset role");
const upgradeAdmin = randomUUID();
await db.query(
  "insert into auth.users(id,email_confirmed_at,is_anonymous)values($1,now(),false)",
  [upgradeAdmin],
);
await as("root");
const upgradeOrg = await scalar(
  "select foundation_create_organization($1,$2,$3)",
  [
    "Histórico de upgrade • Fictício",
    "historico-upgrade-ficticio",
    upgradeAdmin,
  ],
);
const upgradePlan = await rpc("billing_plan_save", {
  p_id: null,
  p_revision: 0,
  p_data: {
    name: "Trial de upgrade • Fictício",
    price_cents: 1000,
    interval_months: 1,
    trial_days: 15,
    active: true,
    available: true,
    human_support: false,
  },
});
await rpc("billing_trial_verify", {
  p_org: upgradeOrg,
  p_kind: "business",
  p_value: "ZZ:DEMO:UPGRADE030",
  p_evidence: "fixture-upgrade-030",
  p_reason: "Identidade exclusivamente fictícia do teste de upgrade",
  p_verified: true,
});
await as(upgradeAdmin);
const legacyTrial = await rpc("billing_subscription_action", {
  p_org: upgradeOrg,
  p_action: "trial",
  p_plan: upgradePlan,
  p_revision: 0,
  p_key: randomUUID(),
});
assert.equal(legacyTrial.trial, true);
await db.exec("commit;reset role");
const snap = () =>
  scalar(
    `select jsonb_build_object('orgs',(select jsonb_agg(to_jsonb(x)order by id)from organizations x),'members',(select jsonb_agg(to_jsonb(x)order by organization_id,user_id)from organization_members x),'quotes',(select jsonb_agg(to_jsonb(x)order by id)from quote_versions x),'requests',(select jsonb_agg(to_jsonb(x)order by id)from quote_requests x),'guides',(select jsonb_agg(to_jsonb(x)order by organization_id,user_id)from organization_user_guides x),'trial',(select jsonb_agg(to_jsonb(x)order by id)from private.trial_grants x))`,
  );
const before = await snap();
assert.ok(before.guides.length > 0);
assert.ok(before.trial.length > 0);
await db.exec(
  await readFile(
    "supabase/migrations/202609210030_business_finance_permissions.sql",
    "utf8",
  ),
);
assert.deepEqual(await snap(), before);
results.push({
  name: "Upgrade 029→030 preserva organizações, membros, solicitações, orçamentos, tutorial e trial",
  status: "PASS",
});
const hashes = JSON.parse(
  await readFile("docs/implementation-030/migrations-001-029.json", "utf8"),
);
for (const h of hashes)
  assert.equal(
    createHash("sha256")
      .update(await readFile("supabase/migrations/" + h.path))
      .digest("hex"),
    h.sha256,
    h.path,
  );
await writeFile(
  "reports/implementation-030/upgrade.json",
  JSON.stringify(
    {
      migration: "029→030",
      reset: false,
      old_migrations_unchanged: hashes.length,
      snapshot_before: before,
      snapshot_after: await snap(),
    },
    null,
    2,
  ),
);
results.push({
  name: "001–029 permanecem byte a byte iguais (29 SHA-256)",
  status: "PASS",
});

const call = async (name, args = []) =>
  scalar(
    `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")})`,
    args.map((x) =>
      typeof x === "object" && x !== null ? JSON.stringify(x) : x,
    ),
  );
async function test(name, fn) {
  await db.exec("begin");
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message, where: e.where });
    console.error("FAIL", name, e.message, e.where || "");
  } finally {
    await db.exec("rollback;reset role");
  }
}
async function deny(fn, pattern) {
  await db.exec("savepoint denial");
  try {
    await fn();
  } catch (e) {
    await db.exec("rollback to savepoint denial");
    if (pattern) assert.match(e.message, pattern);
    return e;
  }
  throw Error("Expected denial");
}
const account = (o = orgs.A, extra = {}) =>
  call("financial_account_save", [
    o,
    null,
    0,
    { description: "Serviço fictício", total_cents: 17000, ...extra },
    randomUUID(),
  ]);
const detail = (id) => call("financial_account", [orgs.A, id]);
const today = new Date().toISOString().slice(0, 10);
const rec = (id, amount = 5000, key = randomUUID()) =>
  call("financial_receipt_record", [
    orgs.A,
    id,
    amount,
    today,
    "pix",
    "Registro fictício",
    key,
  ]);
async function grant(user, actions, scope = "organization", org = orgs.A) {
  await as(org === orgs.A ? "adminA" : "adminB");
  const team = await call("permissions_team", [org]);
  const m = team.members.find((m) => m.user_id === users[user]);
  return call("permissions_save", [
    org,
    users[user],
    m.revision,
    actions.map((action) => ({ action, scope, granted: true })),
    randomUUID(),
  ]);
}
await test("RLS/FORCE RLS e negação de acesso direto aos helpers privados", async () => {
  await db.exec("reset role");
  assert.equal(
    await scalar(
      `select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('private','public')and c.relkind='r'and(not relrowsecurity or not relforcerowsecurity)`,
    ),
    0,
  );
  for (const role of ["anon", "authenticated"])
    assert.equal(
      await scalar(
        `select count(*)::int from pg_proc p where pronamespace='private'::regnamespace and(proname like 'v029_%'or proname in('permission_enter','financial_totals','financial_received'))and has_function_privilege($1,p.oid,'execute')`,
        [role],
      ),
      0,
    );
});
await test("R$170 de cobrança, R$50 recebido, R$120 pendente; aprovação não é pagamento", async () => {
  await as("adminA");
  const a = await account();
  const r = await rec(a.id);
  assert.equal(r.account.received_cents, 5000);
  assert.equal(r.account.balance_cents, 12000);
  assert.equal((await detail(a.id)).account.status, "partial");
  const sum = await call("financial_summary", [orgs.A, today, today]);
  assert.equal(sum.received_cents, 5000);
  assert.equal(sum.approved_cents, 0);
});
await test("Recebimentos múltiplos, baixa integral e sobrepagamento rejeitado", async () => {
  await as("adminA");
  const a = await account();
  await rec(a.id);
  await rec(a.id, 12000);
  assert.equal((await detail(a.id)).account.status, "paid");
  await deny(() => rec(a.id, 1), /financial_receipt_invalid/);
});
await test("Idempotência não duplica recebimento nem aceita payload diferente", async () => {
  await as("adminA");
  const a = await account();
  const key = randomUUID();
  assert.deepEqual(await rec(a.id, 5000, key), await rec(a.id, 5000, key));
  assert.equal((await detail(a.id)).receipts.length, 1);
  await deny(() => rec(a.id, 4000, key), /idempotency/);
});
await test("Estorno imutável com original, razão, autor e efeito negativo", async () => {
  await as("adminA");
  const a = await account();
  const r = await rec(a.id);
  await call("financial_receipt_reverse", [
    orgs.A,
    r.id,
    "Correção de lançamento fictício",
    randomUUID(),
  ]);
  const d = await detail(a.id);
  assert.equal(d.account.received_cents, 0);
  assert.equal(d.receipts.length, 2);
  assert.equal(d.receipts[1].original_id, r.id);
  assert.equal(d.receipts[1].actor_id, users.adminA);
  await db.exec("reset role");
  await deny(
    () =>
      db.query("update financial_receipts set amount_cents=1 where id=$1", [
        r.id,
      ]),
    /immutable/,
  );
});
await test("Despesa e caixa usam lançamentos explícitos e cancelamento auditado", async () => {
  await as("adminA");
  const a = await account();
  await rec(a.id);
  const e = await call("financial_expense_save", [
    orgs.A,
    {
      description: "Materiais fictícios",
      category: "Insumos",
      amount_cents: 2000,
      date: today,
      method: "cash",
    },
    randomUUID(),
  ]);
  let sum = await call("financial_summary", [orgs.A, today, today]);
  assert.equal(sum.result_cents, 3000);
  await call("financial_expense_cancel", [
    orgs.A,
    e.id,
    "Lançamento duplicado fictício",
    randomUUID(),
  ]);
  sum = await call("financial_summary", [orgs.A, today, today]);
  assert.equal(sum.expenses_cents, 0);
});
await test("Escopo individual permite cobrança atribuída e bloqueia consolidados e outra cobrança", async () => {
  await as("adminA");
  const a = await account(orgs.A, { assigned_to: users.worker }),
    b = await account();
  await grant(
    "worker",
    [
      "finance.accounts.read",
      "finance.history.read",
      "finance.receipts.record",
    ],
    "assigned",
  );
  await as("worker");
  await rec(a.id);
  assert.equal((await detail(a.id)).account.balance_cents, 12000);
  await deny(() => detail(b.id), /permission/);
  await deny(
    () => call("financial_summary", [orgs.A, today, today]),
    /permission/,
  );
  await deny(
    () => call("financial_expenses", [orgs.A, today, today]),
    /permission/,
  );
  assert.equal(await scalar("select count(*)::int from financial_accounts"), 1);
  assert.equal(await scalar("select count(*)::int from financial_receipts"), 1);
  await deny(
    async () =>
      call("financial_receipt_reverse", [
        orgs.A,
        (await detail(a.id)).receipts[0].id,
        "Sem permissão de estorno",
        randomUUID(),
      ]),
    /permission/,
  );
});
await test("Revogação de permissão vale com o mesmo JWT e não depende de sair", async () => {
  await as("adminA");
  const a = await account(orgs.A, { assigned_to: users.worker });
  await grant("worker", ["finance.accounts.read"], "assigned");
  await as("worker");
  assert.ok(await detail(a.id));
  await grant("worker", []);
  await as("worker");
  await deny(() => detail(a.id), /permission/);
  assert.equal(await scalar("select count(*)::int from financial_accounts"), 0);
});
await test("Empresa B, consumidor e anônimo não leem nem alteram financeiro A", async () => {
  await as("adminA");
  const a = await account();
  for (const user of ["adminB", "alice", "anon"]) {
    await as(user);
    await deny(() => detail(a.id));
    await deny(() => rec(a.id));
    if (user !== "anon")
      assert.equal(
        await scalar(
          "select count(*)::int from financial_accounts where organization_id=$1",
          [orgs.A],
        ),
        0,
      );
  }
});
await test("Categorias migradas são reutilizadas, renomeadas e não excluídas enquanto usadas", async () => {
  await as("adminA");
  let cats = await call("company_categories", [orgs.A]);
  assert.equal(cats.length, 3);
  const cat = cats[0];
  await deny(
    () =>
      call("company_category_save", [
        orgs.A,
        cat.id,
        cat.revision,
        { delete: true },
        randomUUID(),
      ]),
    /use/,
  );
  await call("company_category_save", [
    orgs.A,
    cat.id,
    cat.revision,
    { name: "Categoria revisada", position: 2 },
    randomUUID(),
  ]);
  assert.equal(
    await scalar(
      "select count(*)::int from services where organization_id=$1 and category=$2",
      [orgs.A, "Categoria revisada"],
    ),
    1,
  );
  await as("adminB");
  await deny(
    () =>
      call("company_category_save", [
        orgs.A,
        cat.id,
        cat.revision,
        { name: "Inválida" },
        randomUUID(),
      ]),
    /permission/,
  );
});
await test("Sem plano adequado, Super Admin não atribui atendimento compartilhado", async () => {
  await as("root");
  await deny(
    () =>
      scalar("select foundation_set_attendant($1,$2,'backup','active')", [
        orgs.A,
        users.shared,
      ]),
    /shared_support_plan_required/,
  );
});
await test("Empresa interna isenta tem capacidades explícitas, sem trial ou assinatura", async () => {
  await as("root");
  const ex = await call("billing_exemption_set", [
    orgs.A,
    "internal",
    { software: true, human_support: true, commercial_followups: true },
    "Empresa interna fictícia autorizada",
    randomUUID(),
  ]);
  await scalar("select foundation_set_attendant($1,$2,'backup','active')", [
    orgs.A,
    users.shared,
  ]);
  const caps = await call("billing_capabilities", [orgs.A]);
  assert.equal(caps.human_support, true);
  assert.equal(caps.commercial_state, "internal_exempt");
  await call("billing_exemption_revoke", [
    orgs.A,
    ex.id,
    "Encerramento da isenção fictícia",
  ]);
  assert.equal(
    (await call("billing_capabilities", [orgs.A])).human_support,
    false,
  );
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*)::int from attendant_organizations where organization_id=$1 and status=$2",
      [orgs.A, "active"],
    ),
    0,
  );
});
await test("Colaborador com grants opera módulo; sem grants chamada direta e RLS negam", async () => {
  await grant("worker", [
    "home.read",
    "clients.read",
    "clients.manage",
    "agenda.read",
    "quotes.read",
  ]);
  await as("worker");
  assert.ok(await call("operations_directory", [orgs.A, "", 0]));
  assert.ok(await call("operations_home", [orgs.A]));
  await deny(
    () => call("analytics_company", [orgs.A, today, today, null, null]),
    /permission/,
  );
  await deny(
    () =>
      call("company_save", [
        orgs.A,
        "service",
        null,
        1,
        { name: "Não permitido" },
      ]),
    /permission/,
  );
  assert.equal(await scalar("select count(*)::int from quote_versions"), 0);
});
await test("Métricas operacionais não revelam valores financeiros sem permissão", async () => {
  await grant("worker", ["analytics.operational"]);
  await as("worker");
  const m = await call("analytics_company", [orgs.A, today, today, null, null]);
  assert.equal(m.values, undefined);
  assert.equal(m.financial, undefined);
});
await test("ADM mantém módulos anteriores: onboarding, Home, agenda, serviços, página, métricas", async () => {
  await as("adminA");
  for (const [n, args] of [
    ["company_context", [orgs.A]],
    ["onboarding_context", [orgs.A]],
    ["operations_home", [orgs.A]],
    ["operations_agenda", [orgs.A, today, today]],
    ["consumer_admin_context", [orgs.A]],
    ["consumer_presence_context", [orgs.A]],
    ["analytics_company", [orgs.A, today, today, null, null]],
  ])
    assert.ok(await call(n, args), n);
});
await test("Super Admin revalida sessão global e configura nova empresa sem membership artificial", async () => {
  await as("root");
  const o = await rpc("access_create_organization", {
    p_name: "Nova organização fictícia",
    p_slug: "nova-" + randomUUID(),
    p_key: randomUUID(),
  });
  const sid = randomUUID();
  await db.exec("reset role");
  await db.query(
    "insert into private.access_enforced_users(user_id)values($1)on conflict do nothing",
    [users.root],
  );
  await rpc("access_register_session", {
    p_user: users.root,
    p_session: sid,
    p_account: null,
    p_generation: null,
  });
  await as("root");
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: users.root, session_id: sid, is_anonymous: false }),
  ]);
  assert.equal(
    (await rpc("access_session", { p_activity: true })).organization_id,
    null,
  );
  assert.ok(await call("onboarding_context", [o.organization_id]));
  await scalar("select company_initialize($1)", [o.organization_id]);
  const cc = await call("company_context", [o.organization_id]);
  await call("company_save", [
    o.organization_id,
    "settings",
    null,
    cc.settings.revision,
    { description: "Empresa fictícia configurada pelo Super Admin" },
  ]);
  assert.equal(
    (await rpc("access_session", { p_activity: true })).organization_id,
    null,
  );
  assert.ok(await call("onboarding_context", [o.organization_id]));
  assert.equal(
    await scalar(
      "select count(*)::int from organization_members where organization_id=$1",
      [o.organization_id],
    ),
    0,
  );
});
await test("CPF/CNPJ: dígitos verificadores, formato normalizado, rejeição de repetidos e máscara", async () => {
  await db.exec("reset role");
  assert.equal(
    await scalar("select private.document_normalize('CPF','111.111.111-11')"),
    null,
  );
  assert.equal(
    await scalar("select private.document_normalize('CPF','529.982.247-25')"),
    "52998224725",
  );
  assert.equal(
    await scalar(
      "select private.document_normalize('CNPJ','12.345.678/0001-95')",
    ),
    "12345678000195",
  );
  assert.equal(
    await scalar("select private.document_normalize('CPF','52998224724')"),
    null,
  );
});
await test("Empresa vazia continua excluível, e empresa suspensa informa causa correta ao global", async () => {
  await as("root");
  const o = await rpc("access_create_organization", {
    p_name: "Vazia fictícia 030",
    p_slug: "vazia-" + randomUUID(),
    p_key: randomUUID(),
  });
  const deleted = await rpc("access_delete_organization", {
    p_org: o.organization_id,
    p_confirmation: "Vazia fictícia 030",
  });
  assert.equal(deleted.deleted, true);
  await db.exec("reset role");
  await db.query("update organizations set status='suspended'where id=$1", [
    orgs.A,
  ]);
  await as("root");
  await deny(
    () => rpc("support_context", { p_org: orgs.A }),
    /organization_suspended/,
  );
});
await test("CNPJ alfanumérico mantém cálculo oficial e rejeita dígito errado", async () => {
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select private.document_normalize('CNPJ','12.ABC.345/01DE-35')",
    ),
    "12ABC34501DE35",
  );
  assert.equal(
    await scalar("select private.document_normalize('CNPJ','12ABC34501DE36')"),
    null,
  );
});
await test("Leitura da página não concede dados de solicitações, agenda ou rascunhos de portfólio", async () => {
  await grant("worker", ["page.read"]);
  await as("worker");
  const x = await call("consumer_admin_context", [orgs.A]);
  assert.deepEqual(x.requests, []);
  assert.deepEqual(x.blocks, []);
  assert.equal(x.schedule, null);
  const p = await call("consumer_presence_context", [orgs.A]);
  assert.deepEqual(p.portfolio_all, []);
  await deny(() => call("consumer_set_page_enabled", [orgs.A, false, 1]));
});
await test("Comercial global permite consulta e concilia somente organizações autorizadas", async () => {
  await as("adminA");
  const list = await rpc("commercial_list", { p_filters: {}, p_offset: 0 });
  assert.ok(list.organizations.every((o) => o.id === orgs.A));
  assert.ok(await rpc("commercial_refresh", { p_org: null, p_after: null }));
  await deny(() => rpc("commercial_refresh", { p_org: orgs.B, p_after: null }));
});
await test("Novo ADM deve verificar documento; armazenamento é hash e máscara, sem texto integral", async () => {
  await as("root");
  const o = await scalar("select foundation_create_organization($1,$2,$3)", [
    "Empresa de teste nova",
    "verificacao-" + randomUUID(),
    users.adminA,
  ]);
  await as("adminA");
  await deny(() => call("company_initialize", [o]), /permission/);
  const ctx = await call("access_verification_context", [o]);
  assert.equal(ctx.required, true);
  const doc = "529.982.247-25",
    key = randomUUID();
  const verified = await call("access_verify_document", [
    o,
    "CPF",
    doc,
    ctx.revision,
    key,
  ]);
  assert.equal(verified.state, "verified");
  assert.equal(verified.masked, "***.***.***-25");
  assert.deepEqual(
    await call("access_verify_document", [o, "CPF", doc, ctx.revision, key]),
    verified,
  );
  assert.ok(await call("permissions_context", [o]));
  await db.exec("reset role");
  const stored = JSON.stringify(
    await scalar(
      "select to_jsonb(v)from private.organization_verifications v where organization_id=$1",
      [o],
    ),
  );
  assert.ok(!stored.includes("52998224725"));
  assert.ok(!stored.includes(doc));
  assert.equal(
    await scalar(
      "select octet_length(fingerprint)from private.organization_verifications where organization_id=$1",
      [o],
    ),
    32,
  );
});
await test("Aprovação cria somente conta a receber e preserva recebimento zero", async () => {
  await as("alice");
  const q = await call("consumer_request_context", [fixture.requests.A]);
  const version = q.versions?.find((v) => v.kind === "final") || q.quote;
  await db.exec("reset role");
  const code = await scalar(
    "select v.public_code from quote_versions v join quote_requests q on q.id=v.request_id where q.public_code=$1 and v.kind='final'order by version desc limit 1",
    [fixture.requests.A],
  );
  await as("alice");
  await call("consumer_approve_quote", [
    fixture.requests.A,
    code,
    randomUUID(),
  ]);
  await as("adminA");
  const a = (await call("financial_accounts", [orgs.A, null, "", 0])).accounts;
  assert.equal(a.length, 1);
  assert.equal(a[0].total_cents, 12000);
  assert.equal(a[0].received_cents, 0);
  assert.equal(
    (await call("financial_summary", [orgs.A, today, today])).approved_cents,
    12000,
  );
});
await test("Atendente próprio recebe permissão individual e não ganha estorno ou caixa", async () => {
  await as("adminA");
  await call("operations_set_attendant", [orgs.A, users.worker, true]);
  const a = await account(orgs.A, { assigned_to: users.worker });
  await grant(
    "worker",
    [
      "finance.accounts.read",
      "finance.history.read",
      "finance.receipts.record",
    ],
    "assigned",
  );
  await as("worker");
  await rec(a.id, 17000);
  assert.equal((await detail(a.id)).account.status, "paid");
  await deny(
    () => call("financial_summary", [orgs.A, today, today]),
    /permission/,
  );
});
await test("ADM define autonomia individual do compartilhado sem conceder consolidados", async () => {
  await as("root");
  await call("billing_exemption_set", [
    orgs.A,
    "internal",
    { software: true, human_support: true, commercial_followups: true },
    "Ambiente fictício compartilhado",
    randomUUID(),
  ]);
  await scalar("select foundation_set_attendant($1,$2,'backup','active')", [
    orgs.A,
    users.shared,
  ]);
  await as("adminA");
  const a = await account(orgs.A, { assigned_to: users.shared });
  await grant(
    "shared",
    [
      "finance.accounts.read",
      "finance.history.read",
      "finance.receipts.record",
    ],
    "assigned",
  );
  await as("shared");
  await rec(a.id);
  await deny(
    () => call("financial_summary", [orgs.A, today, today]),
    /permission/,
  );
  await as("adminA");
  const team = await call("permissions_team", [orgs.A]),
    m = team.members.find((m) => m.user_id === users.shared);
  await deny(
    () =>
      call("permissions_save", [
        orgs.A,
        users.shared,
        m.revision,
        [{ action: "finance.cash.read", scope: "organization", granted: true }],
        randomUUID(),
      ]),
    /ceiling/,
  );
});
await test("Categorias desativadas preservam vínculos e recusam novos serviços", async () => {
  await as("adminA");
  const cat = (await call("company_categories", [orgs.A]))[0];
  await call("company_category_save", [
    orgs.A,
    cat.id,
    cat.revision,
    { active: false },
    randomUUID(),
  ]);
  const revision = await scalar(
    "select revision from company_settings where organization_id=$1",
    [orgs.A],
  );
  await deny(
    () =>
      call("company_save", [
        orgs.A,
        "service",
        null,
        revision,
        {
          name: "Novo serviço fictício",
          category_id: cat.id,
          price_mode: "quote",
        },
      ]),
    /category_unavailable/,
  );
  assert.equal(
    await scalar("select count(*)::int from services where category_id=$1", [
      cat.id,
    ]),
    1,
  );
});
await test("Capacidade é definida por versão e downgrade suspende vínculos sem apagar histórico", async () => {
  await as("root");
  const base = {
    description: "Plano exclusivamente fictício",
    active: true,
    available: true,
    position: 1,
    price_cents: 100,
    interval_months: 1,
    trial_days: 0,
    human_support: true,
    commercial_followups: true,
    member_limit: null,
    service_limit: null,
    request_limit: null,
    ticket_limit: null,
    followup_limit: null,
  };
  const plan = await call("billing_plan_save", [
    null,
    0,
    {
      ...base,
      name: "Nome sem semântica comercial",
      capabilities: {
        software: true,
        human_support: true,
        commercial_followups: true,
      },
    },
  ]);
  const plain = await call("billing_plan_save", [
    null,
    0,
    {
      ...base,
      name: "Mesmo produto sem capacidade",
      capabilities: {
        software: true,
        human_support: false,
        commercial_followups: true,
      },
    },
  ]);
  await db.exec("reset role");
  await db.query(
    "insert into billing_subscriptions(organization_id,plan_version_id,state,period_start,period_end)select $1,id,'active',now(),now()+interval '1 month'from billing_plan_versions where plan_id=$2 order by version desc limit 1",
    [orgs.A, plan],
  );
  await as("root");
  await scalar("select foundation_set_attendant($1,$2,'backup','active')", [
    orgs.A,
    users.shared,
  ]);
  await db.exec("reset role");
  const count = await scalar(
    "select count(*)::int from tickets where organization_id=$1",
    [orgs.A],
  );
  await db.query(
    "update billing_subscriptions set plan_version_id=(select id from billing_plan_versions where plan_id=$2 order by version desc limit 1)where organization_id=$1",
    [orgs.A, plain],
  );
  assert.equal(
    await scalar(
      "select count(*)::int from attendant_organizations where organization_id=$1 and status='active'",
      [orgs.A],
    ),
    0,
  );
  assert.equal(
    await scalar("select count(*)::int from tickets where organization_id=$1", [
      orgs.A,
    ]),
    count,
  );
  await as("shared");
  await deny(() => call("central_context", [fixture.codes.A]), /permission/);
});
await test("Vencimento, cancelamento e datas inválidas não criam recebimentos fictícios", async () => {
  await as("adminA");
  const a = await account(orgs.A, { due_date: "2000-01-01" });
  assert.equal((await detail(a.id)).account.status, "overdue");
  await deny(
    () =>
      call("financial_receipt_record", [
        orgs.A,
        a.id,
        5000,
        "-infinity",
        "pix",
        "",
        randomUUID(),
      ]),
    /invalid/,
  );
  await call("financial_account_save", [
    orgs.A,
    a.id,
    a.revision,
    { cancel: true, reason: "Cancelamento fictício autorizado" },
    randomUUID(),
  ]);
  assert.equal((await detail(a.id)).account.status, "cancelled");
  await deny(() => rec(a.id), /invalid/);
});
await writeFile(
  "reports/implementation-030/backend.json",
  JSON.stringify(
    { environment: "local PGlite PostgreSQL, fictitious fixtures", results },
    null,
    2,
  ),
);
await db.close();
if (results.some((x) => x.status === "FAIL")) process.exitCode = 1;
console.log(
  results.filter((x) => x.status === "PASS").length + "/" + results.length,
  "passed",
);
