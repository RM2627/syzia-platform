import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
const c = await consumerDB(),
  { db, as, rpc, scalar, orgs, manuals } = c,
  results = [];
const page = await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" }),
  svc = page.services.find((s) => s.price_mode === "fixed");
async function denied(fn, codes = ["42501"]) {
  await db.exec("savepoint rejection");
  try {
    await fn();
  } catch (e) {
    await db.exec("rollback to savepoint rejection");
    assert.ok(codes.includes(e.code), `${e.code}: ${e.message}`);
    return;
  }
  throw Error("Expected rejection");
}
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
const publish = () =>
  rpc("consumer_publish_page", {
    p_org: orgs.A,
    p_manual: manuals.A,
    p_enabled: true,
    p_show_prices: true,
    p_expected_revision: 1,
  });
async function media(org = "A") {
  await as("admin" + org);
  const f = await rpc("consumer_reserve_company_media", {
    p_org: orgs[org],
    p_mime: "image/png",
    p_size: 100,
    p_key: randomUUID(),
  });
  await db.exec("reset role;set local role service_role");
  await rpc("consumer_finalize_company_media", {
    p_code: f.code,
    p_user: users["admin" + org],
    p_sha256: "b".repeat(64),
    p_size: 90,
    p_width: 10,
    p_height: 10,
  });
  await as("admin" + org);
  return f.code;
}
async function request(who = "alice", submit = true) {
  await as(who);
  const q = await rpc("consumer_create_request", {
    p_slug: page.slug,
    p_revision: page.revision,
    p_service: svc.code,
    p_addons: [],
    p_answers: { [svc.questions[0].code]: "Carro fictício" },
    p_customer: {
      name: who + " fictício",
      whatsapp: "81999990000",
      email: null,
      notice_version: "consumer-v1",
      accepted_notice: true,
    },
    p_notes: "Teste",
    p_contact: false,
    p_expected_cents: 12000,
    p_key: randomUUID(),
  });
  if (submit)
    await rpc("consumer_submit_request", {
      p_code: q.code,
      p_attachment_count: 0,
      p_key: randomUUID(),
    });
  return q.code;
}
async function quote(q) {
  await as("adminA");
  const current = await rpc("consumer_request_context", { p_code: q });
  return rpc("consumer_send_quote", {
    p_code: q,
    p_items: [{ name: "Proposta fictícia", quantity: 1, unit_cents: 30000 }],
    p_duration: 60,
    p_expires: new Date(Date.now() + 86400000).toISOString(),
    p_expected_revision: current.revision,
    p_key: randomUUID(),
  });
}
async function approved() {
  const code = await request(),
    v = await quote(code);
  await as("alice");
  await rpc("consumer_approve_quote", {
    p_code: code,
    p_version: v.code,
    p_key: randomUUID(),
  });
  await as("adminA");
  return { code, version: v.code };
}
const rule = (data, service = null, revision = 0) =>
  rpc("consumer_payment_rule_save", {
    p_org: orgs.A,
    p_service: service,
    p_revision: revision,
    p_data: data,
  });
const preview = (q, kind = "deposit", origin = "external") =>
  rpc("consumer_preview_payment_plan", {
    p_code: q.code,
    p_version: q.version,
    p_kind: kind,
    p_origin: origin,
  });
const plan = (q, cents = 9000) =>
  rpc("consumer_prepare_payment_plan", {
    p_code: q.code,
    p_version: q.version,
    p_kind: "deposit",
    p_origin: "external",
    p_expected_cents: cents,
    p_key: randomUUID(),
  });
await test("Personalização controlada recusa CSS/HTML/JS e cor fora da paleta", async () => {
  await as("adminA");
  await denied(
    () =>
      rpc("consumer_branding_save", {
        p_org: orgs.A,
        p_revision: 0,
        p_data: { css: "body{display:none}" },
      }),
    ["22023"],
  );
  await denied(
    () =>
      rpc("consumer_branding_save", {
        p_org: orgs.A,
        p_revision: 0,
        p_data: { primary_color: "url(javascript:alert(1))" },
      }),
    ["23514"],
  );
  await denied(
    () =>
      rpc("consumer_branding_save", {
        p_org: orgs.A,
        p_revision: 0,
        p_data: { html: "<script>alert(1)</script>" },
      }),
    ["22023"],
  );
});
await test("Empresa A não altera identidade nem portfólio de B", async () => {
  await as("adminA");
  await denied(() =>
    rpc("consumer_branding_save", {
      p_org: orgs.B,
      p_revision: 0,
      p_data: { primary_color: "#183c62" },
    }),
  );
  await denied(() =>
    rpc("consumer_portfolio_save", {
      p_org: orgs.B,
      p_code: null,
      p_data: { title: "Teste", images: [] },
    }),
  );
});
await test("Logo empresarial permanece privada até publicação explícita", async () => {
  const code = await media();
  await rpc("consumer_branding_save", {
    p_org: orgs.A,
    p_revision: 0,
    p_data: {
      logo: code,
      primary_color: "#183c62",
      category_order: ["Essenciais"],
      service_order: [svc.code],
    },
  });
  assert.equal(
    (await rpc("consumer_public_page", { p_slug: page.slug })).branding
      .primary_color,
    "#193e35",
  );
  await db.exec("reset role;set local role service_role");
  await denied(() => rpc("consumer_gateway_public_media", { p_code: code }));
  await as("adminA");
  await publish();
  assert.equal(
    (await rpc("consumer_public_page", { p_slug: page.slug })).branding.logo,
    code,
  );
  await db.exec("reset role;set local role service_role");
  assert.ok(
    (await rpc("consumer_gateway_public_media", { p_code: code })).path,
  );
});
await test("Troca de ID não transforma anexo privado em mídia pública", async () => {
  const q = await request("alice", false),
    f = await rpc("consumer_reserve_attachment", {
      p_code: q,
      p_mime: "image/png",
      p_size: 100,
      p_key: randomUUID(),
    });
  await as("adminA");
  await denied(
    () =>
      rpc("consumer_branding_save", {
        p_org: orgs.A,
        p_revision: 0,
        p_data: { logo: f.code },
      }),
    ["22023"],
  );
  await db.exec("reset role;set local role service_role");
  await denied(() => rpc("consumer_gateway_public_media", { p_code: f.code }));
});
await test("Portfólio não aceita mídia de outra empresa; antes/depois exige duas", async () => {
  const b = await media("B");
  await as("adminA");
  await denied(
    () =>
      rpc("consumer_portfolio_save", {
        p_org: orgs.A,
        p_code: null,
        p_data: { title: "Teste", images: [b] },
      }),
    ["22023"],
  );
  const a = await media("A");
  await denied(
    () =>
      rpc("consumer_portfolio_save", {
        p_org: orgs.A,
        p_code: null,
        p_data: { title: "Teste", images: [a], format: "before_after" },
      }),
    ["23514"],
  );
});
await test("Portfólio aprovado congela imagens/texto; alterações em rascunho não vazam", async () => {
  const a = await media(),
    b = await media();
  const w = await rpc("consumer_portfolio_save", {
    p_org: orgs.A,
    p_code: null,
    p_data: {
      title: "Exemplo fictício",
      description: "Antes e depois fictícios",
      images: [a, b],
      format: "before_after",
      service: svc.code,
    },
  });
  await publish();
  await rpc("consumer_portfolio_save", {
    p_org: orgs.A,
    p_code: w,
    p_data: { title: "NOVO RASCUNHO", images: [a], active: false },
  });
  const p = await rpc("consumer_public_page", { p_slug: page.slug });
  assert.equal(p.portfolio[0].title, "Exemplo fictício");
  assert.deepEqual(p.portfolio[0].images, [a, b]);
  assert.ok(!JSON.stringify(p.portfolio).includes("organization_id"));
});
await test("Suspensão da empresa revoga novas leituras de imagem pública", async () => {
  const a = await media();
  await rpc("consumer_branding_save", {
    p_org: orgs.A,
    p_revision: 0,
    p_data: { logo: a },
  });
  await publish();
  await db.exec("reset role");
  await db.query("update organizations set status='suspended' where id=$1", [
    orgs.A,
  ]);
  await db.exec("set local role service_role");
  await denied(() => rpc("consumer_gateway_public_media", { p_code: a }));
});
await test("Consumidor não lê mídia empresarial em rascunho nem RPC do gateway", async () => {
  const a = await media();
  await as("alice");
  assert.equal(await scalar("select count(*)::int from company_media"), 0);
  await denied(() =>
    rpc("consumer_gateway_company_media", {
      p_code: a,
      p_user: users.adminA,
      p_write: false,
    }),
  );
  await denied(() =>
    rpc("consumer_reserve_company_media", {
      p_org: orgs.A,
      p_mime: "image/png",
      p_size: 100,
      p_key: randomUUID(),
    }),
  );
});
await test("Recorrência recupera somente cadastro da própria sessão e empresa", async () => {
  await request();
  const profile = await rpc("consumer_returning_profile", {
    p_slug: page.slug,
  });
  assert.equal(profile.name, "alice fictício");
  await as("bob");
  assert.equal(
    await rpc("consumer_returning_profile", { p_slug: page.slug }),
    null,
  );
  await as("alice");
  assert.equal(
    await rpc("consumer_returning_profile", { p_slug: "horizonte-ficticio" }),
    null,
  );
});
await test("Origem é interna, idempotente no envio e não editável por terceiro", async () => {
  const q = await request("alice", false);
  await rpc("consumer_set_source", {
    p_code: q,
    p_source: "instagram",
    p_detail: "",
  });
  await rpc("consumer_submit_request", {
    p_code: q,
    p_attachment_count: 0,
    p_key: randomUUID(),
  });
  await rpc("consumer_set_source", {
    p_code: q,
    p_source: "instagram",
    p_detail: "",
  });
  await denied(() =>
    rpc("consumer_set_source", { p_code: q, p_source: "google", p_detail: "" }),
  );
  assert.equal(
    await scalar("select count(*)::int from opportunity_context"),
    0,
  );
  await as("bob");
  await denied(() =>
    rpc("consumer_set_source", {
      p_code: q,
      p_source: "referral",
      p_detail: "",
    }),
  );
  await as("adminA");
  assert.equal(
    (await rpc("consumer_work_context", { p_code: q })).origin.source,
    "instagram",
  );
});
await test("Tags e notas internas não aparecem no consumidor, publicação ou empresa B", async () => {
  const q = await request();
  await as("adminA");
  await rpc("consumer_customer_context_save", {
    p_code: q,
    p_data: {
      tags: ["recorrente"],
      operational_note: "SEGREDO OPERACIONAL",
      preferred_time: "manhã",
      origin_context: "CONTEXTO PRIVADO",
    },
  });
  await as("alice");
  assert.equal(await scalar("select count(*)::int from customer_context"), 0);
  assert.ok(
    !JSON.stringify(
      await rpc("consumer_request_context", { p_code: q }),
    ).includes("SEGREDO"),
  );
  await denied(() => rpc("consumer_work_context", { p_code: q }));
  await as("adminB");
  await denied(() => rpc("consumer_work_context", { p_code: q }));
  await as("anon");
  assert.ok(
    !JSON.stringify(
      await rpc("consumer_public_page", { p_slug: page.slug }),
    ).includes("CONTEXTO PRIVADO"),
  );
});
await test("Indicação é relação básica intramuros sem recompensas; recusa autoindicação", async () => {
  const qa = await request(),
    qb = await request("bob");
  await as("adminA");
  const ca = (await rpc("consumer_work_context", { p_code: qa })).customer_id,
    cb = (await rpc("consumer_work_context", { p_code: qb })).customer_id;
  await rpc("consumer_customer_context_save", {
    p_code: qa,
    p_data: { referrer_customer_id: cb },
  });
  await denied(
    () =>
      rpc("consumer_customer_context_save", {
        p_code: qa,
        p_data: { referrer_customer_id: ca },
      }),
    ["23514"],
  );
  assert.equal(
    (await rpc("consumer_work_context", { p_code: qa })).customer_context
      .referrer_customer_id,
    cb,
  );
});
await test("Timeline contém somente eventos reais e não de outro consumidor", async () => {
  const qa = await request(),
    qb = await request("bob");
  await as("adminA");
  await rpc("consumer_mark_review", { p_code: qa });
  await rpc("consumer_mark_review", { p_code: qa });
  await as("alice");
  const events = (
    await rpc("consumer_request_context", { p_code: qa })
  ).events.map((x) => x.event);
  assert.deepEqual(
    events.sort(),
    ["created", "submitted", "under_review"].sort(),
  );
  await denied(() => rpc("consumer_request_context", { p_code: qb }));
});
await test("Recusa é idempotente, preserva versão e aceita somente proposta atual válida", async () => {
  const q = await request(),
    old = await quote(q),
    v = await quote(q);
  await as("alice");
  await denied(
    () =>
      rpc("consumer_decline_quote", {
        p_code: q,
        p_version: old.code,
        p_key: randomUUID(),
      }),
    ["22023"],
  );
  const args = { p_code: q, p_version: v.code, p_key: randomUUID() };
  await rpc("consumer_decline_quote", args);
  await rpc("consumer_decline_quote", args);
  await rpc("consumer_decline_quote", { ...args, p_key: randomUUID() });
  assert.equal(
    (await rpc("consumer_request_context", { p_code: q })).state,
    "declined",
  );
  assert.equal(
    await scalar(
      "select count(*)::int from request_events where event='quote_declined'",
    ),
    1,
  );
  await denied(
    () =>
      rpc("consumer_approve_quote", {
        p_code: q,
        p_version: v.code,
        p_key: randomUUID(),
      }),
    ["22023"],
  );
  await quote(q);
});
await test("Empresa A não lê nem altera preparação financeira de B", async () => {
  await as("adminA");
  await denied(() => rpc("consumer_payment_rules_context", { p_org: orgs.B }));
  await denied(() =>
    rpc("consumer_payment_rule_save", {
      p_org: orgs.B,
      p_service: null,
      p_revision: 0,
      p_data: { advance_rule: "at_service" },
    }),
  );
});
await test("Sinal percentual e fixo calculados no banco respeitam regra do serviço", async () => {
  const q = await approved();
  await rule({
    advance_rule: "required_deposit",
    deposit_kind: "percent",
    deposit_basis_points: 3000,
    deposit_cents: null,
  });
  assert.equal((await preview(q)).payable_cents, 9000);
  await rule(
    {
      advance_rule: "optional_deposit",
      deposit_kind: "fixed",
      deposit_cents: 5000,
      deposit_basis_points: null,
    },
    svc.code,
  );
  assert.equal((await preview(q)).payable_cents, 5000);
});
await test("Valor manipulado e sinal acima do orçamento são rejeitados", async () => {
  const q = await approved();
  await rule({
    advance_rule: "required_deposit",
    deposit_kind: "percent",
    deposit_basis_points: 3000,
  });
  await denied(() => plan(q, 1), ["22023"]);
  await rule(
    {
      advance_rule: "required_deposit",
      deposit_kind: "fixed",
      deposit_cents: 40000,
      deposit_basis_points: null,
    },
    null,
    1,
  );
  await denied(() => preview(q), ["22023"]);
});
await test("Pagamento opcional não bloqueia agenda; estados permanecem distintos", async () => {
  const q = await approved();
  await rule({
    advance_rule: "required_deposit",
    deposit_kind: "percent",
    deposit_basis_points: 3000,
  });
  await plan(q);
  await as("alice");
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    slots = await rpc("consumer_request_slots", { p_code: q.code, p_day: day });
  await rpc("consumer_book", {
    p_code: q.code,
    p_start: slots[0],
    p_previous: null,
    p_key: randomUUID(),
  });
  assert.equal(await scalar("select count(*)::int from payments"), 0);
  assert.equal(
    (await rpc("consumer_request_context", { p_code: q.code })).appointments[0]
      .state,
    "confirmed",
  );
});
await test("Planos sem antecipação têm valor zero e não criam cobrança", async () => {
  const q = await approved();
  const p = await preview(q, "total");
  assert.equal(p.payable_cents, 0);
  assert.equal(p.activation_state, "preparation_only");
  const r = await rpc("consumer_prepare_payment_plan", {
    p_code: q.code,
    p_version: q.version,
    p_kind: "total",
    p_origin: "external",
    p_expected_cents: 0,
    p_key: randomUUID(),
  });
  assert.equal(r.charge_created, false);
  assert.equal(await scalar("select count(*)::int from payments"), 0);
});
await test("Opção integrada exige opt-in e continua sem gateway ativado", async () => {
  const q = await approved();
  await denied(() => preview(q, "total", "integrated"), ["22023"]);
  await rule({ online_opt_in: true, advance_rule: "at_service" });
  assert.equal(
    (await preview(q, "total", "integrated")).activation_state,
    "preparation_only",
  );
  await denied(() =>
    db.query("update payment_rules set activation_state='active'"),
  );
});
await test("Versão errada não vincula plano; versão congelada é preservada", async () => {
  const q = await approved();
  await rule({
    advance_rule: "required_deposit",
    deposit_kind: "percent",
    deposit_basis_points: 3000,
  });
  await denied(() => preview({ ...q, version: "v_invalid" }), ["22023"]);
  const p = await plan(q);
  await db.exec("reset role");
  await denied(
    () =>
      db.query(
        "update payment_plans set payable_cents=1 where public_code=$1",
        [p.code],
      ),
    ["23514"],
  );
});
async function paymentFixture() {
  const q = await approved();
  await rule({
    advance_rule: "required_deposit",
    deposit_kind: "percent",
    deposit_basis_points: 3000,
  });
  await plan(q);
  await db.exec("reset role");
  const p = (await db.query("select * from payment_plans limit 1")).rows[0];
  const id = await scalar(
    "insert into payments(organization_id,plan_id,request_id,version_id,customer_id,amount_cents,currency,kind,origin,method) values($1,$2,$3,$4,$5,$6,'BRL','deposit','external','pix_external') returning id",
    [
      p.organization_id,
      p.id,
      p.request_id,
      p.version_id,
      p.customer_id,
      p.payable_cents,
    ],
  );
  return { q, p, id };
}
await test("Consumidor A não acessa registros financeiros de B", async () => {
  const { id } = await paymentFixture();
  await as("bob");
  assert.equal(
    await scalar("select count(*)::int from payments where id=$1", [id]),
    0,
  );
  await as("alice");
  assert.equal(
    await scalar("select count(*)::int from payments where id=$1", [id]),
    1,
  );
});
await test("Registro financeiro não pode usar organização, cliente, versão ou valor de outro plano", async () => {
  const { id } = await paymentFixture();
  await denied(
    () =>
      db.query("update payments set organization_id=$1 where id=$2", [
        orgs.B,
        id,
      ]),
    ["23503"],
  );
  await denied(
    () => db.query("update payments set amount_cents=1 where id=$1", [id]),
    ["23503"],
  );
});
await test("Pagamento externo manual nunca pode ser marcado como automático", async () => {
  const { id } = await paymentFixture();
  await denied(
    () =>
      db.query(
        "update payments set status='paid',confirmed_cents=amount_cents,confirmation_method='provider_verified',confirmed_at=now(),provider='fake',external_id='fake' where id=$1",
        [id],
      ),
    ["23514"],
  );
  await db.query(
    "update payments set status='paid',confirmed_cents=amount_cents,confirmation_method='manual_external',confirmed_at=now(),confirmed_by=$2 where id=$1",
    [id, users.adminA],
  );
  assert.equal(
    await scalar("select confirmation_method from payments where id=$1", [id]),
    "manual_external",
  );
  await as("alice");
  await denied(() =>
    db.query("update payments set status='paid' where id=$1", [id]),
  );
  await as("adminA");
  await denied(() =>
    db.query("update payments set status='paid' where id=$1", [id]),
  );
});
await test("Preparação financeira interna nunca aparece na projeção pública", async () => {
  await as("adminA");
  await rule({
    advance_rule: "at_service",
    cancellation_refund_policy: "FINANCEIRO INTERNO",
  });
  await as("anon");
  const p = JSON.stringify(
    await rpc("consumer_public_page", { p_slug: page.slug }),
  );
  assert.ok(
    !/FINANCEIRO INTERNO|payment_rules|deposit_basis_points|provider|confirmation_method/.test(
      p,
    ),
  );
});
await test("Schema não contém PAN/CVV/carteira/saldo e preserva FORCE RLS", async () => {
  await db.exec("reset role");
  const columns = (
    await db.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name in ('payments','payment_plans','payment_rules','payment_events')",
    )
  ).rows;
  assert.ok(
    !columns.some((x) =>
      /card_number|cvv|pan$|wallet|balance/.test(x.column_name),
    ),
  );
  const total = await scalar(
    "select count(*)::int from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity and relforcerowsecurity",
  );
  assert.equal(total, 75);
});
await test("Plano financeiro é idempotente e hash rejeita payload alterado",async()=>{const q=await approved();await rule({advance_rule:'required_deposit',deposit_kind:'percent',deposit_basis_points:3000});const args={p_code:q.code,p_version:q.version,p_kind:'deposit',p_origin:'external',p_expected_cents:9000,p_key:randomUUID()};const first=await rpc('consumer_prepare_payment_plan',args);assert.deepEqual(await rpc('consumer_prepare_payment_plan',args),first);await denied(()=>rpc('consumer_prepare_payment_plan',{...args,p_expected_cents:1}),['22023']);assert.equal(await scalar('select count(*)::int from payment_plans'),1)});
await test("CHECKs financeiros não aceitam nulos como confirmação ou tipo de sinal",async()=>{const {id}=await paymentFixture();await denied(()=>db.query("update payments set status='paid',confirmed_cents=amount_cents,confirmed_at=now(),confirmed_by=$2,confirmation_method=null where id=$1",[id,users.adminA]),['23514']);await as('adminA');await denied(()=>rule({advance_rule:'required_deposit',deposit_kind:null,deposit_cents:9000,deposit_basis_points:null},null,1),['23514'])});
await writeFile(
  "reports/presence-payments-results.json",
  JSON.stringify(
    {
      environment:
        "LOCAL PGlite; nenhuma cobrança ou gateway real; registros financeiros de teste inseridos por fixture privilegiada",
      tests: results,
      passed: results.filter((x) => x.status === "PASS").length,
      failed: results.filter((x) => x.status === "FAIL").length,
    },
    null,
    2,
  ),
);
await db.close();
if (results.some((x) => x.status === "FAIL")) process.exitCode = 1;
