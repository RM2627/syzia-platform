import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { seedCentral } from "./fixtures/central.mjs";
const c = await consumerDB({
    through: "202609260041_self_service_journeys.sql",
  }),
  { db, rpc, as, scalar, orgs, services, save } = c;
const legacy = await seedCentral(c),
  results = [];
const columns = (
  await db.query(
    "select table_schema,table_name,column_name from information_schema.columns where table_schema in('public','private')order by 1,2,ordinal_position",
  )
).rows;
async function snapshot() {
  await db.exec("reset role");
  const out = {};
  for (const table of new Set(
    columns.map((c) => c.table_schema + "." + c.table_name),
  )) {
    const cs = columns
      .filter((c) => c.table_schema + "." + c.table_name === table)
      .map((c) => '"' + c.column_name + '"');
    out[table] = await scalar(
      `select coalesce(jsonb_agg(j order by j::text),'[]')from(select to_jsonb(x)j from(select ${cs.join(",")}from ${table})x)q`,
    );
  }
  return out;
}
const before = await snapshot();
await db.exec(
  await readFile(
    "supabase/migrations/202609260042_operational_refinements.sql",
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
async function denied(
  fn,
  re = /denied|required|unavailable|invalid|permission/,
) {
  await db.exec("savepoint rejection");
  try {
    await fn();
  } catch (e) {
    await db.exec("rollback to savepoint rejection");
    assert.match(e.message, re);
    return;
  }
  throw Error("Expected rejection");
}
const tomorrow = () =>
    new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  expiry = () => new Date(Date.now() + 7 * 86400000).toISOString();
const customer = {
  name: "Consumidor fictício 041",
  whatsapp: "81999990000",
  email: "fixture041@example.invalid",
  accepted_notice: true,
  notice_version: "consumer-v1",
};
const empty = (s) => ({
  service: s.code,
  addons: [],
  answers: Object.fromEntries(
    s.questions
      .filter((f) => f.required && f.kind !== "photo" && !f.condition_field)
      .map((f) => [
        f.code,
        f.kind === "boolean"
          ? false
          : f.kind === "number"
            ? 1
            : f.kind === "choice"
              ? f.options[0]
              : "Resposta fictícia",
      ]),
  ),
  notes: "",
});
const cost = (p, items) => {
  let total = 0;
  for (const i of items) {
    const s = p.services.find((s) => s.code === i.service);
    for (const x of [s, ...s.addons.filter((a) => i.addons.includes(a.code))]) {
      if (x.price_mode === "quote") return null;
      total += x.price_cents;
    }
  }
  return total;
};
async function publish() {
  await as("adminA");
  const d = await rpc("consumer_page_draft", {
    p_org: orgs.A,
    p_show_prices: true,
  });
  await rpc("consumer_publish_draft", {
    p_org: orgs.A,
    p_token: d.token,
    p_show_prices: true,
    p_expected_revision: d.page_revision,
  });
  return rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" });
}
let serviceSequence = 0;
async function setup({
  mode = "fixed",
  photos = "none",
  duration = 45,
  contract = "immediate",
  execution = "continuous",
  max = null,
  priceMax = null,
} = {}) {
  await as("adminA");
  const name = "Serviço 042 fictício " + ++serviceSequence;
  const id = await save("A", "service", {
    name,
    price_mode: mode,
    price_cents: mode === "quote" ? null : 10000,
    duration_minutes: duration,
    contract_mode: contract,
    execution_mode: execution,
    execution_max_periods: max,
    price_max_cents: priceMax,
    photo_policy: photos,
    photo_instructions: "Mostre a superfície e os detalhes.",
    quotes_allowed: true,
  });
  const p = await publish();
  return { p, s: p.services.find((s) => s.name === name), id };
}
async function draft(p, items, user = "alice") {
  await as(user);
  return rpc("consumer_create_multi_request", {
    p_slug: p.slug,
    p_revision: p.revision,
    p_items: items,
    p_customer: customer,
    p_notes: "Detalhes fictícios",
    p_contact: false,
    p_expected_cents: cost(p, items),
    p_key: randomUUID(),
  });
}
async function slots(p, items) {
  await as("alice");
  return (
    await rpc("consumer_journey_slots", {
      p_slug: p.slug,
      p_revision: p.revision,
      p_items: items,
      p_day: tomorrow(),
    })
  ).slots;
}
async function complete(q, start, count = 0, key = randomUUID()) {
  await as("alice");
  return rpc("consumer_complete_journey", {
    p_code: q.code,
    p_start: start,
    p_attachment_count: count,
    p_key: key,
  });
}
const ctx = (code) => rpc("consumer_request_context", { p_code: code });
async function review() {
  const { p, s, id } = await setup({ mode: "quote", contract: "evaluation" });
  const items = [empty(s)],
    q = await draft(p, items),
    start = (await slots(p, items))[0];
  await complete(q, start);
  return { p, s, id, q, start };
}
const line = (patch = {}) => ({
  kind: "original",
  position: 0,
  name: "Ignorar nome fornecido",
  quantity: 1,
  unit_cents: 12000,
  duration_minutes: 60,
  discount_cents: 0,
  note: "",
  ...patch,
});
const discount = { mode: "none", value: 0 };
async function proposal(q, items = [line()], disc = discount, user = "adminA") {
  await as(user);
  const context = await rpc("operations_quote_context", {
    p_org: orgs.A,
    p_code: q.code,
  });
  const args = {
    p_org: orgs.A,
    p_code: q.code,
    p_items: items,
    p_discount: disc,
    p_expires: expiry(),
    p_expected_revision: context.revision,
    p_explanation: "Valor confirmado após avaliação da empresa.",
    p_key: randomUUID(),
  };
  return { r: await rpc("operations_send_calculated_quote", args), args };
}
async function approve(q, v) {
  await as("alice");
  return rpc("consumer_approve_quote", {
    p_code: q.code,
    p_version: v.code,
    p_key: randomUUID(),
  });
}
async function block(start, minutes = 60) {
  await db.exec("reset role");
  await db.query(
    "insert into appointments(organization_id,resource_id,kind,starts_at,ends_at)select $1,id,'block',$2::timestamptz,$2::timestamptz+make_interval(mins=>$3)from schedule_resources where organization_id=$1",
    [orgs.A, start, minutes],
  );
}
async function grantWorker(actions, own = true) {
  await as("adminA");
  if (own)
    await rpc("operations_set_attendant", {
      p_org: orgs.A,
      p_user: users.worker,
      p_enabled: true,
    });
  const team = await rpc("permissions_team", { p_org: orgs.A });
  const m = team.members.find((m) => m.user_id === users.worker);
  await rpc("permissions_save", {
    p_org: orgs.A,
    p_user: users.worker,
    p_revision: m.revision,
    p_grants: actions.map((action) => ({
      action,
      scope: "organization",
      granted: true,
    })),
    p_key: randomUUID(),
  });
}
const quoteGrants = ["quotes.read", "quotes.manage", "quotes.values"],
  centralGrants = ["central.read", "central.manage", "central.reply"];
async function service(fn, args) {
  await db.exec("reset role;set local role service_role");
  return rpc(fn, args);
}
async function grants(user, actions, org = orgs.A) {
  await as(org === orgs.A ? "adminA" : "adminB");
  const t = await rpc("permissions_team", { p_org: org }),
    m = t.members.find((m) => m.user_id === users[user]);
  return rpc("permissions_save", {
    p_org: org,
    p_user: users[user],
    p_revision: m.revision,
    p_grants: actions.map((action) => ({
      action,
      scope: "organization",
      granted: true,
    })),
    p_key: randomUUID(),
  });
}
const allGrants = [
  ...centralGrants,
  ...quoteGrants,
  "agenda.read",
  "agenda.manage",
  "followup.read",
  "followup.manage",
];
async function autonomy(actions, cap = 10, pub = true) {
  await as("adminA");
  await save("A", "permissions", {
    allowed_actions: actions,
    reviewed: true,
    never_change_price: !actions.includes("discount"),
    max_discount_percent: actions.includes("discount") ? cap : 0,
  });
  if (pub) {
    const rev = () =>
      scalar("select revision from company_settings where organization_id=$1", [
        orgs.A,
      ]);
    const m = await rpc("company_create_manual", {
      p_org: orgs.A,
      p_expected_revision: await rev(),
      p_title: "Manual fictício 042",
    });
    await rpc("company_publish_manual", {
      p_org: orgs.A,
      p_manual: m,
      p_expected_revision: await rev(),
    });
    await rpc("company_set_activation", {
      p_org: orgs.A,
      p_expected_revision: await rev(),
      p_human: true,
      p_public_faq: true,
    });
  }
}
async function permission(action, discount = 0, actor = "shared") {
  await as(actor);
  return rpc("company_attendant_permission", {
    p_org: orgs.A,
    p_action: action,
    p_discount: discount,
  });
}
async function legacyAccount() {
  await db.exec("reset role");
  await db.query(
    "insert into organization_members(organization_id,user_id,role,status)values($1,$2,'colaborador_empresa','active')on conflict do nothing",
    [orgs.A, users.shared],
  );
  return scalar(
    "insert into private.enterprise_accounts(organization_id,user_id,username,display_name,contact_email,role,state,requested_by,request_key)values($1,$2,'global.legacy','Equipe Fictícia','global@example.invalid','colaborador_empresa','active',$3,$4)returning id",
    [orgs.A, users.shared, users.root, randomUUID()],
  );
}
async function hours({ close = "15:00", buffer = 0 } = {}) {
  await db.exec("reset role");
  await db.query(
    "update company_settings set business_hours=$2 where organization_id=$1",
    [
      orgs.A,
      JSON.stringify(
        Array.from({ length: 7 }, (_, day) => ({ day, open: "08:00", close })),
      ),
    ],
  );
  await db.query(
    "update schedule_resources set buffer_minutes=$2,lead_minutes=0,horizon_days=15 where organization_id=$1",
    [orgs.A, buffer],
  );
}
async function options(p, items, day = tomorrow(), next = false) {
  await as("alice");
  return rpc("consumer_journey_options", {
    p_slug: p.slug,
    p_revision: p.revision,
    p_items: items,
    p_day: day,
    p_next: next,
  });
}
async function divided({ duration = 600, max = 3, buffer = 0 } = {}) {
  await hours({ buffer });
  const { p, s, id } = await setup({ execution: "split", duration, max });
  const items = [empty(s)],
    q = await draft(p, items),
    o = await options(p, items);
  assert.ok(o.plans.length);
  return { p, s, id, items, q, o, plan: o.plans[0] };
}
async function completePlan(x, key = randomUUID()) {
  await as("alice");
  return rpc("consumer_complete_execution", {
    p_code: x.q.code,
    p_start: x.plan.start,
    p_attachment_count: 0,
    p_periods: x.plan.periods,
    p_key: key,
  });
}
async function records(q) {
  await db.exec("reset role");
  return (
    await db.query(
      "select *from appointments where request_id=(select id from quote_requests where public_code=$1)and state='confirmed'order by part_number",
      [q.code],
    )
  ).rows;
}
await test("01 Upgrade populado 041→042 preserva linhas e colunas anteriores", async () =>
  assert.deepEqual(await snapshot(), before));
await test("02 Identidade compartilhada com membership legado sai de accounts/legacy e não vaza credenciais", async () => {
  await legacyAccount();
  await as("adminA");
  for (const api of ["access_team"]) {
    const d =
      api === "access_team_026"
        ? await scalar("select public.access_team_026($1)", [orgs.A])
        : await rpc(api, { p_org: orgs.A });
    assert.ok(!d.accounts.some((x) => x.user_id === users.shared));
    assert.ok(!d.legacy.some((x) => x.user_id === users.shared));
    if (api === "access_team") {
      const x = d.shared.find((x) => x.user_id === users.shared);
      assert.equal(x.identity_kind, "syzia_staff");
      assert.ok(!("username" in x));
      assert.ok(!("email" in x));
    }
  }
  const d = await rpc("permissions_team", { p_org: orgs.A });
  assert.equal(d.members.filter((x) => x.user_id === users.shared).length, 1);
  assert.equal(
    d.members.find((x) => x.user_id === users.shared).role,
    "shared_attendant",
  );
});
await test("03 ADM não edita/desativa acesso compartilhado por RPC", async () => {
  const id = await legacyAccount();
  await as("adminA");
  for (const action of ["disable", "enable", "edit"])
    await denied(
      () =>
        rpc("access_manage", {
          p_id: id,
          p_action: action,
          p_data: { username: "indevido.alterado" },
        }),
      /shared_identity_requires_superadmin/,
    );
  await denied(
    () => rpc("access_resume", { p_id: id }),
    /shared_identity_requires_superadmin/,
  );
});
await test("04 Gateway service_role recusa reset e reemissão pelo ADM", async () => {
  const id = await legacyAccount();
  await denied(
    () =>
      service("access_reset", {
        p_id: id,
        p_actor: users.adminA,
        p_hash: "a".repeat(64),
      }),
    /shared_identity_requires_superadmin/,
  );
  await denied(
    () =>
      service("access_delivery_prepare", {
        p_id: id,
        p_actor: users.adminA,
        p_rotate: true,
        p_hash: "a".repeat(64),
      }),
    /shared_identity_requires_superadmin/,
  );
});
await test("05 Vínculo empresarial não permite mudar papel global ou cadastro legado", async () => {
  await legacyAccount();
  await as("adminA");
  await denied(
    () =>
      rpc("foundation_set_member", {
        p_org: orgs.A,
        p_user: users.shared,
        p_role: "admin_empresa",
        p_status: "active",
      }),
    /shared_identity_requires_superadmin/,
  );
  await denied(
    () =>
      rpc("operations_set_attendant", {
        p_org: orgs.A,
        p_user: users.shared,
        p_enabled: false,
      }),
    /shared_identity_requires_superadmin/,
  );
  await denied(() =>
    rpc("people_staff_state", { p_user: users.shared, p_active: false }),
  );
});
await test("06 Super Admin preserva administração global e funcionário próprio mantém edição", async () => {
  await as("root");
  await rpc("foundation_set_global_role", {
    p_user: users.shared,
    p_role: "atendente",
    p_active: false,
  });
  await rpc("foundation_set_global_role", {
    p_user: users.shared,
    p_role: "atendente",
    p_active: true,
  });
  await as("adminA");
  await rpc("operations_set_attendant", {
    p_org: orgs.A,
    p_user: users.worker,
    p_enabled: true,
  });
  const t = await rpc("permissions_team", { p_org: orgs.A });
  assert.equal(
    t.members.find((x) => x.user_id === users.worker).role,
    "own_attendant",
  );
});
await test("07 Permissões da Empresa A não alteram B", async () => {
  await db.exec("reset role");
  const beforeB = await scalar(
    "select jsonb_agg(to_jsonb(x)order by action)from private.organization_permissions x where organization_id=$1 and user_id=$2",
    [orgs.B, users.shared],
  );
  await grants("shared", ["central.read"]);
  await db.exec("reset role");
  assert.deepEqual(
    await scalar(
      "select jsonb_agg(to_jsonb(x)order by action)from private.organization_permissions x where organization_id=$1 and user_id=$2",
      [orgs.B, users.shared],
    ),
    beforeB,
  );
});
await test("08 Autonomia SIM + grants SIM permite preço fixo e agendar", async () => {
  await grants("shared", allGrants);
  assert.equal(await permission("price_list"), true);
  assert.equal(await permission("schedule"), true);
});
await test("09 Autonomia SIM sem grant bloqueia", async () => {
  await grants("shared", centralGrants);
  assert.equal(await permission("price_list"), false);
  assert.equal(await permission("schedule"), false);
});
await test("10 Revogar autonomia bloqueia antes de nova publicação", async () => {
  await grants("shared", allGrants);
  await autonomy(["price_list"], 10, false);
  assert.equal(await permission("schedule"), false);
});
await test("11 Autonomia ainda não publicada não amplia poderes", async () => {
  await grants("shared", allGrants);
  await autonomy(["price_list", "fit_in"], 10, false);
  assert.equal(await permission("fit_in"), false);
});
await test("12 Plano sem atendimento compartilhado bloqueia apesar de legado empresarial", async () => {
  await legacyAccount();
  await grants("shared", allGrants);
  await db.exec("reset role");
  await db.query(
    "update billing_subscriptions set state='suspended'where organization_id=$1",
    [orgs.A],
  );
  assert.equal(await permission("schedule"), false);
});
await test("13 Vínculo revogado em sessão aberta não volta ao membership legado", async () => {
  await legacyAccount();
  await grants("shared", allGrants);
  assert.equal(await permission("schedule"), true);
  await as("root");
  await rpc("foundation_set_attendant", {
    p_org: orgs.A,
    p_user: users.shared,
    p_kind: "backup",
    p_status: "suspended",
  });
  assert.equal(await permission("schedule"), false);
  await denied(() =>
    rpc("operations_home_section", { p_org: orgs.A, p_section: "header" }),
  );
});
await test("14 Faixa não é inferida de a partir de; faixa explícita publicada é permitida", async () => {
  await setup({ mode: "from", contract: "evaluation" });
  await grants("shared", allGrants);
  await autonomy(["price_range"]);
  assert.equal(await permission("price_range"), false);
  await setup({ mode: "from", contract: "evaluation", priceMax: 20000 });
  await autonomy(["price_range"]);
  assert.equal(await permission("price_range"), true);
});
await test("15 Desconto explícito dentro e fora do teto publicado/atual", async () => {
  await grants("shared", allGrants);
  assert.equal(await permission("discount", 10), true);
  assert.equal(await permission("discount", 11), false);
  await autonomy(["discount"], 5, false);
  assert.equal(await permission("discount", 6), false);
});
await test("16 Compartilhado não usa calculadora variável mesmo com grants", async () => {
  const { q } = await review();
  await grants("shared", allGrants);
  await as("shared");
  await denied(
    () =>
      rpc("operations_quote_calculate", {
        p_org: orgs.A,
        p_code: q.code,
        p_items: [line()],
        p_discount: discount,
      }),
    /company_quote_permission_required/,
  );
});
await test("17 Encaixe e condições publicados continuam sujeitos a grants e capacidade", async () => {
  await grants("shared", allGrants);
  await autonomy(["fit_in", "negotiate"]);
  assert.equal(await permission("fit_in"), true);
  assert.equal(await permission("negotiate"), true);
  await grants("shared", centralGrants);
  assert.equal(await permission("fit_in"), false);
});
await test("18 Home é VOLATILE, carregamento normal e seções independentes", async () => {
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select provolatile from pg_proc where oid='public.operations_home(uuid)'::regprocedure",
    ),
    "v",
  );
  await as("adminA");
  assert.ok(await rpc("operations_home", { p_org: orgs.A }));
  for (const p_section of ["header", "agenda", "attention", "updates"])
    assert.ok(
      await rpc("operations_home_section", { p_org: orgs.A, p_section }),
    );
  await denied(
    () =>
      rpc("operations_home_section", { p_org: orgs.A, p_section: "invalid" }),
    /invalid_home_section/,
  );
  assert.ok(
    await rpc("operations_home_section", {
      p_org: orgs.A,
      p_section: "header",
    }),
  );
});
await test("19 Home mostra solicitação real e link para pedido", async () => {
  await as("adminA");
  const d = await rpc("operations_home_section", {
    p_org: orgs.A,
    p_section: "attention",
  });
  assert.ok(
    d.items.some((x) => x.href.endsWith("?pedido=" + legacy.requests.A)),
  );
});
await test("20 Home mostra proposta aprovada aguardando agenda, preservando aprovação", async () => {
  const { q, start } = await review();
  const { r } = await proposal(q);
  await block(start);
  await approve(q, r);
  await as("adminA");
  const d = await rpc("operations_home_section", {
    p_org: orgs.A,
    p_section: "attention",
  });
  assert.ok(
    d.items.some(
      (x) => x.reason.includes("falta agendar") && x.href.endsWith(q.code),
    ),
  );
});
await test("21 Home respeita isolamento e não expõe agenda sem grant", async () => {
  await grantWorker(["home.read"], false);
  await as("worker");
  const d = await rpc("operations_home_section", {
    p_org: orgs.A,
    p_section: "agenda",
  });
  assert.equal(d.available, false);
  assert.deepEqual(d.appointments, []);
  await denied(() =>
    rpc("operations_home_section", { p_org: orgs.B, p_section: "header" }),
  );
});
await test("22 Proposta fixa sem mudança aceita explicação vazia", async () => {
  const { p, s } = await setup({ contract: "evaluation" });
  const items = [empty(s)],
    q = await draft(p, items);
  await complete(q, (await slots(p, items))[0]);
  await as("adminA");
  const c = await rpc("operations_quote_context", {
    p_org: orgs.A,
    p_code: q.code,
  });
  const args = {
    p_org: orgs.A,
    p_code: q.code,
    p_items: [line({ unit_cents: 10000, duration_minutes: 45 })],
    p_discount: discount,
  };
  assert.equal(
    (await rpc("operations_quote_calculate", args)).explanation_required,
    false,
  );
  const r = await rpc("operations_send_calculated_quote", {
    ...args,
    p_expires: expiry(),
    p_expected_revision: c.revision,
    p_explanation: "",
    p_key: randomUUID(),
  });
  assert.ok(r.code);
});
await test("23 Mudança de preço exige explicação server-side", async () => {
  const { q } = await review();
  await as("adminA");
  const d = await rpc("operations_quote_context", {
    p_org: orgs.A,
    p_code: q.code,
  });
  await denied(
    () =>
      rpc("operations_send_calculated_quote", {
        p_org: orgs.A,
        p_code: q.code,
        p_items: [line()],
        p_discount: discount,
        p_expires: expiry(),
        p_expected_revision: d.revision,
        p_explanation: "",
        p_key: randomUUID(),
      }),
    /quote_explanation_required/,
  );
});
await test("24 Desconto, item extra e condição explícita exigem explicação", async () => {
  const { p, s } = await setup({ contract: "evaluation" }),
    items = [empty(s)],
    q = await draft(p, items);
  await complete(q, (await slots(p, items))[0]);
  await as("adminA");
  for (const [is, d] of [
    [
      [
        line({
          unit_cents: 10000,
          duration_minutes: 45,
          note: "Condição especial",
        }),
      ],
      discount,
    ],
    [
      [line({ unit_cents: 10000, duration_minutes: 45 })],
      { mode: "percent", value: 5 },
    ],
    [
      [
        line(),
        line({ kind: "manual", position: undefined, name: "Complemento" }),
      ],
      discount,
    ],
  ])
    assert.equal(
      (
        await rpc("operations_quote_calculate", {
          p_org: orgs.A,
          p_code: q.code,
          p_items: is,
          p_discount: d,
        })
      ).explanation_required,
      true,
    );
});
await test("25 Serviço contínuo de 10h não é dividido e informa does_not_fit", async () => {
  await hours();
  const { p, s } = await setup({ duration: 600 }),
    o = await options(p, [empty(s)]);
  assert.equal(o.duration_minutes, 600);
  assert.deepEqual(o.plans, []);
  assert.equal(o.reason, "does_not_fit");
});
await test("26 Divisível de 10h gera combinação automática de 2 dias", async () => {
  const x = await divided();
  assert.equal(x.plan.periods.length, 2);
  assert.equal(
    x.plan.periods.reduce((n, p) => n + p.minutes, 0),
    600,
  );
  assert.notEqual(
    x.plan.periods[0].start.slice(0, 10),
    x.plan.periods[1].start.slice(0, 10),
  );
});
await test("27 Combinação respeita bloqueios e buffer por período", async () => {
  const x = await divided({ buffer: 15 });
  await block(x.plan.periods[1].start, 120);
  const o = await options(x.p, x.items);
  const parts = o.plans[0].periods;
  assert.ok(
    Date.parse(parts[1].start) >=
      Date.parse(x.plan.periods[1].start) + 120 * 60000,
  );
  for (const p of parts)
    assert.equal(
      (Date.parse(p.reserved_until) - Date.parse(p.end)) / 60000,
      15,
    );
});
await test("28 Todos os períodos reservados uma vez, um pedido e um cliente", async () => {
  const x = await divided(),
    key = randomUUID();
  const r = await completePlan(x, key);
  assert.deepEqual(await completePlan(x, key), r);
  const rows = await records(x.q);
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((x) => x.execution_group)).size, 1);
  assert.equal(new Set(rows.map((x) => x.request_id)).size, 1);
  assert.equal(new Set(rows.map((x) => x.customer_id)).size, 1);
  assert.equal(
    rows.reduce((n, x) => n + x.service_minutes, 0),
    600,
  );
});
await test("29 Conflito no segundo período recusa plano obsoleto sem reserva parcial", async () => {
  const x = await divided();
  await block(x.plan.periods[1].start, 30);
  await denied(() => completePlan(x), /execution_plan_changed/);
  assert.equal((await records(x.q)).length, 0);
  await as("alice");
  assert.equal((await ctx(x.q.code)).state, "draft");
});
await test("30 Consumidor vê partes agrupadas e apenas o próprio pedido", async () => {
  const x = await divided();
  await completePlan(x);
  const d = await ctx(x.q.code);
  assert.equal(d.appointments.length, 2);
  assert.equal(
    d.appointments[0].execution_group,
    d.appointments[1].execution_group,
  );
  assert.ok(d.appointments.every((a) => a.service_minutes && a.part_number));
  await as("bob");
  await denied(() => ctx(x.q.code));
});
await test("31 Agenda empresarial e ficha mostram períodos vinculados e histórico", async () => {
  const x = await divided();
  await completePlan(x);
  const rows = await records(x.q);
  await as("adminA");
  const d = await rpc("operations_detail", { p_org: orgs.A, p_id: rows[0].id });
  assert.equal(d.periods.length, 2);
  assert.equal(d.history.filter((x) => x.event === "booked").length, 2);
  await denied(() =>
    rpc("operations_detail", { p_org: orgs.B, p_id: rows[0].id }),
  );
});
await test("32 Remarcar um período preserva outro e duração", async () => {
  const x = await divided();
  await completePlan(x);
  const rows = await records(x.q);
  const target = new Date(
    Date.parse(rows[1].starts_at) + 86400000,
  ).toISOString();
  await as("adminA");
  await rpc("operations_appointment_act", {
    p_org: orgs.A,
    p_id: rows[1].id,
    p_revision: rows[1].revision,
    p_action: "reschedule",
    p_data: { start: target },
    p_key: randomUUID(),
  });
  const after = await records(x.q);
  assert.equal(String(after[0].starts_at), String(rows[0].starts_at));
  assert.equal(Date.parse(after[1].starts_at), Date.parse(target));
  assert.equal(after[1].service_minutes, rows[1].service_minutes);
});
await test("33 Replanejamento integral substitui períodos juntos sem apagar histórico", async () => {
  const x = await divided();
  await completePlan(x);
  const rows = await records(x.q);
  await as("alice");
  const day = new Date(Date.parse(x.plan.start) + 2 * 86400000)
    .toISOString()
    .slice(0, 10);
  const o = await rpc("consumer_execution_options", {
    p_code: x.q.code,
    p_day: day,
    p_next: false,
  });
  const plan = o.plans[0];
  await rpc("consumer_book_execution", {
    p_code: x.q.code,
    p_start: plan.start,
    p_previous: rows[0].public_code,
    p_periods: plan.periods,
    p_key: randomUUID(),
  });
  const after = await records(x.q);
  assert.equal(after.length, 2);
  assert.ok(after.every((x) => !rows.some((y) => y.id === x.id)));
  assert.equal(
    await scalar(
      "select count(*)::int from appointments where request_id=$1 and state='cancelled'",
      [rows[0].request_id],
    ),
    2,
  );
});
await test("34 Conflito ao replanejar preserva todos os períodos anteriores", async () => {
  const x = await divided();
  await completePlan(x);
  const rows = await records(x.q);
  await as("alice");
  const o = await rpc("consumer_execution_options", {
    p_code: x.q.code,
    p_day: new Date(Date.parse(x.plan.start) + 3 * 86400000)
      .toISOString()
      .slice(0, 10),
    p_next: false,
  });
  const plan = o.plans[0];
  await block(plan.periods[1].start, 30);
  await as("alice");
  await denied(
    () =>
      rpc("consumer_book_execution", {
        p_code: x.q.code,
        p_start: plan.start,
        p_previous: rows[0].public_code,
        p_periods: plan.periods,
        p_key: randomUUID(),
      }),
    /execution_plan_changed/,
  );
  assert.deepEqual(await records(x.q), rows);
});
await test("35 Cancelamento integral não deixa órfãos", async () => {
  const x = await divided();
  await completePlan(x);
  const d = await ctx(x.q.code);
  await rpc("consumer_cancel_booking", {
    p_code: x.q.code,
    p_appointment: d.appointments[0].code,
    p_key: randomUUID(),
  });
  assert.equal((await records(x.q)).length, 0);
});
await test("36 Cancelamento empresarial integral mantém histórico de cada parte", async () => {
  const x = await divided();
  await completePlan(x);
  const rows = await records(x.q);
  await as("adminA");
  await rpc("operations_appointment_act", {
    p_org: orgs.A,
    p_id: rows[0].id,
    p_revision: rows[0].revision,
    p_action: "cancel",
    p_data: {},
    p_key: randomUUID(),
  });
  assert.equal((await records(x.q)).length, 0);
  assert.equal(
    await scalar(
      "select count(*)::int from appointment_events where appointment_id=any($1::uuid[])and event='cancelled'",
      [rows.map((x) => x.id)],
    ),
    2,
  );
});
await test("37 Máximo de períodos é respeitado sem plano parcial", async () => {
  const x = await divided({ duration: 1000, max: 3 });
  await as("adminA");
  await save("A", "service", { execution_max_periods: 2 }, x.id);
  const p = await publish();
  const o = await options(p, x.items);
  assert.equal(o.plans.length, 0);
});
await test("38 Multisserviço divisível distribui duração; item contínuo impede divisão", async () => {
  await hours();
  const a = await setup({ duration: 360, execution: "split" }),
    b = await setup({ duration: 360, execution: "split" });
  let p = b.p,
    items = [empty(p.services.find((x) => x.code === a.s.code)), empty(b.s)],
    o = await options(p, items);
  assert.ok(o.plans.length);
  assert.equal(o.duration_minutes, 720);
  await as("adminA");
  await save("A", "service", { execution_mode: "continuous" }, a.id);
  p = await publish();
  o = await options(p, items);
  assert.equal(o.plans.length, 0);
  assert.equal(o.execution_mode, "continuous");
});
await test("39 Busca próximos horários compatíveis evita dia ocupado", async () => {
  await hours();
  const { p, s } = await setup({ duration: 60 });
  const o = await options(p, [empty(s)]);
  await block(o.plans[0].start, 420);
  const none = await options(p, [empty(s)]);
  assert.equal(none.reason, "occupied");
  const next = await options(p, [empty(s)], tomorrow(), true);
  assert.ok(next.plans.length);
  assert.notEqual(next.day, tomorrow());
});
await test("40 Proposta aprovada mantém horário desejado e congela modo de execução", async () => {
  await hours();
  const { p, s } = await setup({
      duration: 600,
      execution: "split",
      contract: "evaluation",
    }),
    items = [empty(s)],
    q = await draft(p, items),
    o = await options(p, items);
  const x = { q, plan: o.plans[0] };
  await completePlan(x);
  const { r } = await proposal(q, [
    line({ unit_cents: 10000, duration_minutes: 600 }),
  ]);
  await approve(q, r);
  const d = await ctx(q.code);
  assert.equal(d.accepted_version, r.code);
  assert.equal(Date.parse(d.desired_start), Date.parse(x.plan.start));
  assert.equal(d.appointments.length, 2);
  assert.equal(
    d.versions.find((v) => v.code === r.code).execution_mode,
    "split",
  );
});
await test("41 Aprovação não reserva combinação diferente da apresentada", async () => {
  await hours();
  const { p, s } = await setup({
      duration: 600,
      execution: "split",
      contract: "evaluation",
    }),
    items = [empty(s)],
    q = await draft(p, items),
    o = await options(p, items);
  await completePlan({ q, plan: o.plans[0] });
  const { r } = await proposal(q, [
    line({ unit_cents: 10000, duration_minutes: 660 }),
  ]);
  const approved = await approve(q, r);
  assert.equal(approved.booking_state, "choose_another_time");
  assert.equal((await ctx(q.code)).state, "approved");
  assert.equal((await records(q)).length, 0);
});
await test("42 Concluir parte não conclui atendimento nem duplica valor realizado", async () => {
  const x = await divided();
  await completePlan(x);
  const rows = await records(x.q);
  await db.exec("reset role");
  await db.query(
    "update appointments set execution_state='in_progress',started_at=now()where id=$1",
    [rows[0].id],
  );
  await db.query(
    "update appointments set execution_state='completed',completed_at=now()where id=$1",
    [rows[0].id],
  );
  assert.equal(
    await scalar(
      "select count(*)::int from request_events where request_id=$1 and event='service_completed'",
      [rows[0].request_id],
    ),
    0,
  );
  await db.query(
    "update appointments set execution_state='in_progress',started_at=now()where id=$1",
    [rows[1].id],
  );
  await db.query(
    "update appointments set execution_state='completed',completed_at=now()where id=$1",
    [rows[1].id],
  );
  assert.equal(
    await scalar(
      "select count(*)::int from request_events where request_id=$1 and event='service_completed'",
      [rows[0].request_id],
    ),
    1,
  );
});
await test("43 RPCs e RLS negam cross-tenant e helpers privados permanecem fechados", async () => {
  const x = await divided();
  await completePlan(x);
  await as("adminB");
  await denied(() =>
    rpc("operations_execution_options", {
      p_org: orgs.A,
      p_code: x.q.code,
      p_day: tomorrow(),
    }),
  );
  assert.equal(
    await scalar(
      "select count(*)::int from appointments where organization_id=$1",
      [orgs.A],
    ),
    0,
  );
  await denied(
    () =>
      scalar("select private.execution_request_options($1,$2,false)", [
        x.q.code,
        tomorrow(),
      ]),
    /permission denied/,
  );
  await denied(
    () =>
      db.query(
        "update appointments set service_minutes=1 where organization_id=$1",
        [orgs.A],
      ),
    /permission denied/,
  );
});
await test("44 Duração/partes adulteradas não reservam nem mudam total", async () => {
  const x = await divided();
  x.plan.periods[1].minutes = 1;
  await denied(() => completePlan(x), /execution_plan_changed/);
  assert.equal((await records(x.q)).length, 0);
});
await test("45 UI empresarial agenda pedido aprovado pelo mesmo contexto comercial", async () => {
  const { q, start } = await review();
  const { r } = await proposal(q);
  await block(start);
  await approve(q, r);
  await as("adminA");
  const o = await rpc("operations_execution_options", {
      p_org: orgs.A,
      p_code: q.code,
      p_day: tomorrow(),
      p_next: false,
    }),
    p = o.plans[0];
  const res = await rpc("operations_book_execution", {
    p_org: orgs.A,
    p_code: q.code,
    p_start: p.start,
    p_previous: null,
    p_revision: null,
    p_periods: p.periods,
    p_key: randomUUID(),
  });
  assert.ok(res.id);
  assert.equal((await records(q)).length, 1);
});
await test("46 Métricas e valor realizado contam uma contratação somente após a última parte", async () => {
  await hours();
  const { p, s } = await setup({
      duration: 600,
      execution: "split",
      contract: "evaluation",
    }),
    items = [empty(s)],
    q = await draft(p, items),
    o = await options(p, items);
  await completePlan({ q, plan: o.plans[0] });
  const { r } = await proposal(q, [
    line({ unit_cents: 10000, duration_minutes: 600 }),
  ]);
  await approve(q, r);
  const rows = await records(q);
  const today = new Date().toISOString().slice(0, 10);
  const stats = async () => {
    await as("adminA");
    return rpc("analytics_company", {
      p_org: orgs.A,
      p_from: today,
      p_to: today,
      p_service: null,
      p_source: null,
    });
  };
  const initial = await stats();
  for (let i = 0; i < rows.length; i++) {
    await db.exec("reset role");
    await db.query(
      "update appointments set execution_state='in_progress',started_at=now()where id=$1",
      [rows[i].id],
    );
    await db.query(
      "update appointments set execution_state='completed',completed_at=now()where id=$1",
      [rows[i].id],
    );
    const d = await stats();
    assert.equal(
      d.execution.completed,
      initial.execution.completed + (i === rows.length - 1 ? 1 : 0),
    );
    assert.equal(
      d.financial.performed_cents,
      initial.financial.performed_cents + (i === rows.length - 1 ? 10000 : 0),
    );
    assert.equal(d.financial.received_cents, initial.financial.received_cents);
  }
});
await test("47 Falha injetada na segunda gravação reverte primeira parte e submissão", async () => {
  const x = await divided();
  await db.exec("reset role");
  await db.exec(
    "create function public.fixture042_second_period()returns trigger language plpgsql as $$begin if new.part_number=2 then raise exception 'fixture_second_period_conflict'using errcode='23P01';end if;return new;end;$$;create trigger fixture042_second_period before insert on public.appointments for each row execute function public.fixture042_second_period()",
  );
  await denied(() => completePlan(x), /fixture_second_period_conflict/);
  assert.equal((await records(x.q)).length, 0);
  await as("alice");
  assert.equal((await ctx(x.q.code)).state, "draft");
});
await writeFile(
  "reports/syzia-042/sql.json",
  JSON.stringify(
    {
      engine: "PGlite local + Auth fixture; no external homologation",
      tablesPreserved: Object.keys(before).length,
      results,
    },
    null,
    2,
  ),
);
await db.close();
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
