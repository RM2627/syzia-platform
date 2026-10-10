import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { seedCommercial } from "./fixtures/commercial.mjs";
import { randomUUID } from "node:crypto";
const c = await consumerDB(),
  { db, as, rpc, scalar, orgs, services } = c,
  f = await seedCommercial(c),
  results = [];
const day = new Date().toISOString().slice(0, 10),
  year = day.slice(0, 4),
  args = { p_org: orgs.A, p_from: year + "-01-01", p_to: year + "-12-31" };
const company = (extra = {}) => rpc("analytics_company", { ...args, ...extra });
const central = (extra = {}) => rpc("analytics_central", { ...args, ...extra });
async function test(name, fn) {
  await db.exec("begin");
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS " + name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.log("FAIL " + name + ": " + e.message);
  } finally {
    await db.exec("rollback;reset role");
  }
}
async function denied(fn, codes = ["42501"]) {
  await db.exec("savepoint deny");
  try {
    await fn();
  } catch (e) {
    await db.exec("rollback to savepoint deny");
    assert.ok(codes.includes(e.code), e.message);
    return;
  }
  throw Error("Expected denial");
}
async function book() {
  const p = await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" });
  const slots = await rpc("consumer_slots", {
    p_slug: p.slug,
    p_service: p.services.find((s) => s.price_mode === "fixed").code,
    p_addons: [],
    p_day: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  });
  await rpc("consumer_book", {
    p_code: f.requests.A,
    p_start: slots[0],
    p_previous: null,
    p_key: randomUUID(),
  });
}
await test("agregado A contém apenas oportunidade A e nenhum dado pessoal", async () => {
  await as("adminA");
  const x = await company();
  assert.equal(x.totals.opportunities, 1);
  assert.equal(x.values.quoted_cents, 12000);
  assert.ok(!JSON.stringify(x).includes("SECRETO"));
  for (const s of [
    "customer",
    "whatsapp",
    "author",
    "Ana",
    "Bia",
    "example.invalid",
    orgs.B,
  ])
    assert.ok(!JSON.stringify(x).includes(s), s);
});
for (const user of ["anon", "alice", "bob", "worker", "agentA", "adminB"])
  await test(user + " não acessa métricas comerciais A", async () => {
    await as(user);
    await denied(() => company());
  });
await test("filtro com serviço B não revela agregados ou nome", async () => {
  await as("adminA");
  await denied(() => company({ p_service: services.B[0] }));
});
await test("admin B só consulta métricas B", async () => {
  await as("adminB");
  assert.equal((await company({ p_org: orgs.B })).totals.opportunities, 1);
});
await test("atendente não consulta métricas gerenciais de A nem B", async () => {
  await as("agentA");
  await denied(() => central());
  await denied(() => central({ p_org: orgs.B }));
});
await test("revogação de papel nega próxima consulta central", async () => {
  await db.query(
    "update platform_roles set active=false where user_id=$1 and role='atendente'",
    [users.agentA],
  );
  await as("agentA");
  await denied(() => central());
});
await test("revogação de vínculo nega próxima consulta central", async () => {
  await db.query(
    "update attendant_organizations set status='suspended' where user_id=$1",
    [users.agentA],
  );
  await as("agentA");
  await denied(() => central());
});
await test("admin suspenso perde acesso aos agregados", async () => {
  await db.query("update profiles set status='suspended' where id=$1", [
    users.adminA,
  ]);
  await as("adminA");
  await denied(() => company());
});
await test("empresa suspensa não disponibiliza indicadores", async () => {
  await db.query("update organizations set status='suspended' where id=$1", [
    orgs.A,
  ]);
  await as("adminA");
  await denied(() => company());
  await denied(() => central());
});
await test("acesso plataforma exclusivo de superadmin ativo", async () => {
  await as("adminA");
  await denied(() => rpc("analytics_platform", args));
  await as("root");
  const x = await rpc("analytics_platform", args);
  assert.equal(x.organizations, 2);
  assert.equal(x.revenue_cents, null);
  await db.exec("reset role");
  await db.query("update platform_roles set active=false where user_id=$1", [
    users.root,
  ]);
  await as("root");
  await denied(() => rpc("analytics_platform", args));
});
await test("períodos invertidos, nulos, longos e infinitos rejeitados", async () => {
  await as("adminA");
  for (const change of [
    { p_from: day, p_to: "2020-01-01" },
    { p_from: null },
    { p_from: "2020-01-01", p_to: day },
    { p_from: "infinity", p_to: "infinity" },
  ])
    await denied(() => company(change), ["22023", "22008"]);
});
await test("dataset vazio sem divisão por zero ou receita fabricada", async () => {
  await as("adminA");
  const x = await company({ p_from: "2020-01-01", p_to: "2020-01-02" });
  assert.equal(x.totals.opportunities, 0);
  assert.equal(x.totals.conversion_percent, 0);
  assert.equal(x.values.revenue_cents, null);
  assert.equal(x.trend.length, 2);
  assert.equal(x.values.quoted_cents, 0);
});
await test("timezone Recife respeita meia-noite e fim exclusivo", async () => {
  await db.query(
    "update opportunities set created_at='2026-03-02T02:59:59Z' where organization_id=$1",
    [orgs.A],
  );
  await as("adminA");
  assert.equal(
    (await company({ p_from: "2026-03-01", p_to: "2026-03-01" })).totals
      .opportunities,
    1,
  );
  assert.equal(
    (await company({ p_from: "2026-03-02", p_to: "2026-03-02" })).totals
      .opportunities,
    0,
  );
});
await test("constraint de timezone aprovada é preservada", async () => {
  await denied(
    () =>
      db.query(
        "update organizations set timezone='America/New_York' where id=$1",
        [orgs.A],
      ),
    ["23514"],
  );
});
await test("filtros de origem e serviço e origem ausente unknown", async () => {
  await as("adminA");
  assert.equal(
    (await company({ p_source: "instagram" })).totals.opportunities,
    0,
  );
  assert.equal(
    (await company({ p_source: "unknown" })).totals.opportunities,
    1,
  );
  assert.equal(
    (await company({ p_service: services.A[1] })).totals.opportunities,
    0,
  );
  await denied(() => company({ p_source: "sql injection" }), ["22023"]);
});
await test("propostas finais revisadas não somam versões antigas", async () => {
  await as("adminA");
  const q = await rpc("consumer_request_context", { p_code: f.requests.A });
  await rpc("consumer_send_quote", {
    p_code: f.requests.A,
    p_items: [{ name: "Teste revisão", quantity: 1, unit_cents: 24000 }],
    p_duration: 60,
    p_expires: new Date(Date.now() + 86400000).toISOString(),
    p_expected_revision: q.revision,
    p_key: randomUUID(),
  });
  assert.equal((await company()).values.quoted_cents, 24000);
});
await test("aprovação e conversão não viram receita e clique repetido não duplica", async () => {
  await as("adminA");
  const cfg = await rpc("commercial_config", { p_org: orgs.A });
  await rpc("commercial_config_save", {
    p_org: orgs.A,
    p_revision: cfg.settings.revision,
    p_data: { conversion_criterion: "approval" },
  });
  await as("alice");
  const q = await rpc("consumer_request_context", { p_code: f.requests.A });
  const a = {
    p_code: f.requests.A,
    p_version: q.current_version,
    p_key: randomUUID(),
  };
  await rpc("consumer_approve_quote", a);
  await rpc("consumer_approve_quote", a);
  await book();
  await as("adminA");
  const x = await company();
  assert.equal(x.totals.approvals, 1);
  assert.equal(x.totals.conversions, 1);
  assert.equal(x.values.approved_cents, 12000);
  assert.equal(x.values.revenue_cents, null);
});
await test("SLA vazio é indisponível e fila atual separada do período", async () => {
  await as("adminA");
  const x = await central({ p_from: "2020-01-01", p_to: "2020-01-01" });
  assert.equal(x.tickets, 0);
  assert.equal(x.first_response_seconds, null);
  assert.equal(x.sla.within, null);
  assert.equal(x.live.queued, 1);
});
await test("tempo de resposta e SLA calculados de mensagens sem conteúdo privado", async () => {
  const t = await scalar("select id from tickets where organization_id=$1", [
    orgs.A,
  ]);
  await db.query(
    "insert into central_settings(organization_id,response_minutes) values($1,5) on conflict(organization_id) do update set response_minutes=5",
    [orgs.A],
  );
  await db.query(
    "insert into ticket_messages(organization_id,ticket_id,author_id,author_name,kind,body,created_at) values($1,$2,$3,'Fictício','company','SEGREDO RESPOSTA',now()+interval '6 minutes')",
    [orgs.A, t, users.adminA],
  );
  await as("adminA");
  const x = await central();
  assert.equal(x.answered, 1);
  assert.equal(x.sla.breached, 1);
  assert.ok(x.first_response_seconds >= 360);
  assert.ok(!JSON.stringify(x).includes("SEGREDO"));
});
await test("tentativa real seguida de conversão conta recuperação uma vez", async () => {
  await as("adminA");
  const cfg = await rpc("commercial_config", { p_org: orgs.A });
  await rpc("commercial_config_save", {
    p_org: orgs.A,
    p_revision: cfg.settings.revision,
    p_data: { conversion_criterion: "approval" },
  });
  await as("agentA");
  async function act(action, data = {}) {
    const x = await rpc("commercial_context", { p_code: f.opportunities.A });
    const t = x.tasks.find(
      (t) => !["completed", "cancelled"].includes(t.state),
    );
    return rpc("commercial_task_act", {
      p_code: t.public_code,
      p_revision: t.revision,
      p_action: action,
      p_data: data,
      p_key: randomUUID(),
    });
  }
  await act("claim");
  await act("start");
  await act("result", { outcome: "responded", note: "" });
  await as("alice");
  const q = await rpc("consumer_request_context", { p_code: f.requests.A });
  await rpc("consumer_approve_quote", {
    p_code: f.requests.A,
    p_version: q.current_version,
    p_key: randomUUID(),
  });
  await book();
  await as("adminA");
  const x = await company();
  assert.equal(x.followups.attempts, 1);
  assert.equal(x.totals.recoveries, 1);
  assert.equal(x.totals.conversions, 1);
});
await test("perda comercial conta sem inventar conversão ou receita", async () => {
  await as("adminA");
  const x = await rpc("commercial_context", { p_code: f.opportunities.A });
  await rpc("commercial_op_act", {
    p_code: x.code,
    p_revision: x.revision,
    p_action: "lose",
    p_data: { reason: "price" },
    p_key: randomUUID(),
  });
  const a = await company();
  assert.equal(a.totals.losses, 1);
  assert.equal(a.totals.conversions, 0);
  assert.equal(a.values.revenue_cents, null);
});
await test("RLS FORCE continua em todas as tabelas e RPCs não concedem escrita", async () => {
  assert.equal(
    await scalar(
      "select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r' and(not relrowsecurity or not relforcerowsecurity)",
    ),
    0,
  );
  assert.equal(
    await scalar(
      "select count(*) from pg_proc where proname like 'analytics_%' and pronamespace='public'::regnamespace and (not prosecdef or not ('search_path=\"\"'=any(proconfig)))",
    ),
    0,
  );
  await as("adminA");
  await denied(() =>
    db.exec(
      "update commercial_opportunity_state set commercial_state='converted'",
    ),
  );
});
await db.close();
await writeFile(
  "reports/analytics-results.json",
  JSON.stringify(
    { environment: "LOCAL PGlite with simulated Auth claims", results },
    null,
    2,
  ),
);
if (results.some((x) => x.status === "FAIL")) process.exitCode = 1;
