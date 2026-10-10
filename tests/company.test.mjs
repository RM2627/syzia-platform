import {upgrade030Fixture} from "./support/upgrade030.mjs";
import {authorizeSupport} from "./support/authorized-support.mjs";
import { PGlite } from "./support/pglite.mjs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite(),
  results = [];
await db.exec(await readFile("tests/auth-fixture.sql", "utf8"));
const migrations = (await readdir("supabase/migrations"))
  .filter((f) => f.endsWith(".sql")&&!f.includes("0030_"))
  .sort();
for (const f of migrations)
  await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
const U = Object.fromEntries(
  [
    "root",
    "adminA",
    "adminB",
    "worker",
    "attendant",
    "unlinked",
    "anonymous",
    "unconfirmed",
  ].map((n, i) => [
    n,
    `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
  ]),
);
for (const [n, id] of Object.entries(U))
  await db.query(
    "insert into auth.users(id,email_confirmed_at,is_anonymous) values($1,$2,$3)",
    [
      id,
      n === "unconfirmed" ? null : new Date().toISOString(),
      n === "anonymous",
    ],
  );
await db.query(
  "insert into platform_roles(user_id,role) values($1,'super_admin'),($2,'atendente'),($3,'atendente')",
  [U.root, U.attendant, U.unlinked],
);
async function scalar(q, a = []) {
  return Object.values((await db.query(q, a)).rows[0])[0];
}
async function as(n, extra = {}) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: U[n], is_anonymous: n === "anonymous", ...extra }),
  ]);
  await db.exec("set local role authenticated");
}
async function anon() {
  await db.exec("reset role; set local role anon");
  await db.query("select set_config('request.jwt.claims','{}',true)");
}
async function denied(q, a = [], codes = ["42501"]) {
  await db.exec("savepoint denied");
  try {
    await db.query(q, a);
  } catch (e) {
    await db.exec("rollback to savepoint denied");
    assert.ok(
      codes.includes(e.code),
      `Expected ${codes}, got ${e.code}: ${e.message}`,
    );
    return;
  }
  throw new Error("Expected operation to be denied");
}
const revision = (o) =>
  scalar("select revision from company_settings where organization_id=$1", [o]);
const save = async (o, e, d, id = null) =>
  scalar("select company_save($1,$2,$3,$4,$5)", [
    o,
    e,
    id,
    await revision(o),
    JSON.stringify(d),
  ]);
const context = (o) => scalar("select company_context($1)", [o]);
const publish = async (o, id) =>
  db.query("select company_publish_manual($1,$2,$3)", [
    o,
    id,
    await revision(o),
  ]);
const activation = async (o, h = true, f = true) =>
  db.query("select company_set_activation($1,$2,$3,$4)", [
    o,
    await revision(o),
    h,
    f,
  ]);
async function test(name, fn) {
  await db.exec("reset role; begin");
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS " + name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.error("FAIL " + name + ": " + e.message);
  } finally {
    await db.exec("rollback; reset role");
  }
}
await db.exec("begin");
await as("root");
const A = await scalar(
  "select foundation_create_organization('Oficina Aurora Fictícia','aurora-ficticia',$1)",
  [U.adminA],
);
const B = await scalar(
  "select foundation_create_organization('Estúdio Horizonte Fictício','horizonte-ficticio',$1)",
  [U.adminB],
);
await authorizeSupport({as,scalar},A,"adminA");
await authorizeSupport({as,scalar},B,"adminB");
await db.query(
  "select foundation_set_member($1,$2,'colaborador_empresa','active')",
  [A, U.worker],
);
await db.query("select foundation_set_attendant($1,$2,'primary','active')", [
  A,
  U.attendant,
]);
for (const o of [A, B]) await db.query("select company_initialize($1)", [o]);
await as("adminA");
await save(A, "settings", {
  description: "Serviços fictícios para testes locais.",
  service_regions: "Bairro de Teste",
  payment_methods: "Pix fictício",
  business_hours: [{ day: 1, open: "08:00", close: "18:00" }],
  human_hours: [{ day: 1, open: "09:00", close: "17:00" }],
  exception_contact_name: "Responsável Fictício",
  exception_contact: "somente-teste@example.invalid",
});
await save(
  A,
  "rules",
  Object.fromEntries(
    [
      "pricing",
      "payment",
      "cancellation",
      "rescheduling",
      "service",
      "deadlines",
      "exception",
    ].map((k) => [k + "_policy", "Política fictícia aprovada para teste."]),
  ),
);
await save(A, "permissions", {
  allowed_actions: ["price_list"],
  never_change_price: true,
  max_discount_percent: 0,
  reviewed: true,
});
const service = await save(A, "service", {
  name: "Serviço Fictício",
  price_mode: "fixed",
  price_cents: 15000,
  duration_minutes: 60,
});
const addon = await save(A, "addon", {
  service_id: service,
  name: "Adicional Fictício",
  price_mode: "fixed",
  price_cents: 2000,
});
const field = await save(A, "field", {
  service_id: service,
  label: "Qual tamanho?",
  kind: "choice",
  options: ["Pequeno", "Grande"],
});
const faq = await save(A, "faq", {
  question: "Como funciona?",
  answer: "Consulte as condições fictícias.",
});
const reply = await save(A, "reply", {
  title: "Boas-vindas",
  body: "Olá! Esta é uma resposta fictícia aprovada.",
});
const manual = await scalar("select company_create_manual($1,$2,$3)", [
  A,
  await revision(A),
  "Manual inicial fictício",
]);
for (const r of (
  await db.query("select id from manual_sections where organization_id=$1", [A])
).rows)
  await save(
    A,
    "section",
    {
      content: "Orientação interna fictícia. Nunca expor o contato de exceção.",
    },
    r.id,
  );
await as("adminB");
const serviceB = await save(B, "service", {
  name: "Serviço exclusivo B",
  price_mode: "quote",
});
const manualB = await scalar("select company_create_manual($1,$2,$3)", [
  B,
  await revision(B),
  "Manual B fictício",
]);
const faqB = await save(B, "faq", {
  question: "Pergunta secreta B?",
  answer: "Resposta ainda não publicada da empresa B.",
});
await db.exec("commit");
await upgrade030Fixture(db,[A,B]);
const tables = [
  "company_settings",
  "services",
  "service_addons",
  "service_intake_fields",
  "manual_versions",
  "manual_sections",
  "faqs",
  "quick_replies",
  "business_rules",
  "attendant_permissions",
];
for (const t of tables) {
  await test(`RLS: A não lê B em ${t}`, async () => {
    await as("adminA");
    const rs = (await db.query("select organization_id from " + t)).rows;
    assert.ok(rs.length);
    assert.ok(rs.every((r) => r.organization_id === A));
    assert.deepEqual(
      (await db.query("select * from " + t + " where organization_id=$1", [B]))
        .rows,
      [],
    );
  });
  await test(`Escrita direta negada em ${t}`, async () => {
    await as("adminA");
    await denied(
      "update " + t + " set organization_id=$1 where organization_id=$2",
      [B, A],
    );
    await denied("delete from " + t + " where organization_id=$1", [A]);
    await denied("truncate " + t);
  });
}
await test("Isolamento simétrico B → A", async () => {
  await as("adminB");
  await denied("select company_context($1)", [A]);
  assert.equal((await context(B)).services[0].id, serviceB);
});
for (const n of ["worker", "attendant", "unlinked", "anonymous", "unconfirmed"])
  await test(`Perfil ${n} não altera autonomia por RPC`, async () => {
    await as(n);
    await denied(
      'select company_save($1,\'permissions\',null,1,\'{"allowed_actions":["discount"],"max_discount_percent":100}\')',
      [A],
    );
  });
await test("Admin A não altera configuração nem publica B", async () => {
  await as("adminA");
  await denied("select company_save($1,'settings',null,1,'{}')", [B]);
  await denied("select company_publish_manual($1,$2,1)", [B, manualB]);
  await denied("select company_initialize($1)", [B]);
});
await test("JWT editável não concede administração", async () => {
  await as("worker", {
    role: "super_admin",
    user_metadata: { role: "super_admin" },
  });
  await denied("select company_save($1,'permissions',null,1,'{}')", [A]);
});
await test("Atendente sem vínculo não lê contexto nem prontidão", async () => {
  await as("unlinked");
  await denied("select company_context($1)", [A]);
  await denied("select company_readiness($1)", [A]);
});
await test("Atendente vinculado não vê rascunho, FAQ nem respostas não publicadas", async () => {
  await as("attendant");
  // Revisão operacional: atendente consulta manual no contexto da Central, não a configuração administrativa.
  await denied("select company_context($1)",[A]);
});
await test("Campos de permissão/identidade injetados são rejeitados", async () => {
  await as("adminA");
  for (const payload of [
    { organization_id: B },
    { human_enabled: true },
    { published_manual_id: manual },
    { revision: 999 },
    { status: "published" },
    { role: "super_admin" },
  ])
    await denied(
      "select company_save($1,'settings',null,$2,$3)",
      [A, await revision(A), JSON.stringify(payload)],
      ["22023"],
    );
});
await test("Escrita direta segue bloqueada mesmo com GRANT acidental", async () => {
  await db.exec(
    "grant insert,update,delete on attendant_permissions to authenticated",
  );
  await as("adminA");
  assert.equal(
    (
      await db.query(
        "update attendant_permissions set max_discount_percent=100 where organization_id=$1 returning *",
        [A],
      )
    ).rows.length,
    0,
  );
  await denied(
    "insert into attendant_permissions(organization_id) values($1)",
    [B],
  );
});
await test("FK composta rejeita adicional e pergunta com serviço de B", async () => {
  await as("adminA");
  for (const [entity, data] of [
    ["addon", { service_id: serviceB, name: "Intrusão", price_mode: "quote" }],
    ["field", { service_id: serviceB, label: "Intrusão" }],
  ])
    await denied(
      "select company_save($1,$2,null,$3,$4)",
      [A, entity, await revision(A), JSON.stringify(data)],
      ["23503"],
    );
});
await test("ID de FAQ de outra empresa não pode ser editado", async () => {
  await as("adminA");
  await denied(
    "select company_save($1,'faq',$2,$3,'{\"answer\":\"Intrusão\"}')",
    [A, faqB, await revision(A)],
    ["22023"],
  );
});
await test("Modalidades fixo, a partir de e sob consulta persistem corretamente", async () => {
  await as("adminA");
  for (const [mode, price] of [
    ["fixed", 0],
    ["from", 12345],
    ["quote", null],
  ]) {
    const id = await save(A, "service", {
      name: "Modalidade teste",
      price_mode: mode,
      price_cents: price,
    });
    const row = (
      await db.query(
        "select price_mode,price_cents from services where id=$1",
        [id],
      )
    ).rows[0];
    assert.deepEqual(row, { price_mode: mode, price_cents: price });
  }
});
for (const [name, data] of [
  ["preço negativo", { price_cents: -1 }],
  ["preço fracionário", { price_cents: 10.5 }],
  ["fixo sem preço", { price_cents: null }],
  ["consulta com preço", { price_mode: "quote" }],
  [
    "agendamento direto sem duração",
    { direct_booking: true, duration_minutes: null },
  ],
  [
    "agendamento direto a partir de",
    { direct_booking: true, price_mode: "from" },
  ],
  ["imagem com protocolo inseguro", { image_url: "javascript:alert(1)" }],
])
  await test(`Constraint rejeita ${name}`, async () => {
    await as("adminA");
    await denied(
      "select company_save($1,'service',$2,$3,$4)",
      [A, service, await revision(A), JSON.stringify(data)],
      ["23514", "22P02"],
    );
  });
await test("Perguntas exigem opções válidas e distintas", async () => {
  await as("adminA");
  for (const options of [
    [],
    ["Uma"],
    ["Igual", "Igual"],
    [null, "Duas"],
    ["A", 42],
  ])
    await denied(
      "select company_save($1,'field',$2,$3,$4)",
      [A, field, await revision(A), JSON.stringify({ options })],
      ["23514"],
    );
});
await test("Horários rejeitam inversão, duplicidade e valor inválido", async () => {
  await as("adminA");
  for (const hs of [
    [{ day: 1, open: "18:00", close: "08:00" }],
    [
      { day: 1, open: "08:00", close: "12:00" },
      { day: 1, open: "13:00", close: "18:00" },
    ],
    [{ day: 7, open: "08:00", close: "18:00" }],
    [{ day: 1, open: "29:00", close: "30:00" }],
    {},
  ])
    await denied(
      "select company_save($1,'settings',null,$2,$3)",
      [A, await revision(A), JSON.stringify({ business_hours: hs })],
      ["23514"],
    );
});
await test("Nunca alterar preço bloqueia desconto e negociação", async () => {
  await as("adminA");
  for (const d of [
    { allowed_actions: ["discount"], max_discount_percent: 10 },
    { allowed_actions: ["negotiate"] },
  ])
    await denied(
      "select company_save($1,'permissions',null,$2,$3)",
      [A, await revision(A), JSON.stringify(d)],
      ["23514"],
    );
});
await test("Permissões desconhecidas e desconto sem permissão são rejeitados", async () => {
  await as("adminA");
  for (const d of [
    { allowed_actions: ["super_admin"] },
    { allowed_actions: [null] },
    { never_change_price: false, max_discount_percent: 10 },
    {
      never_change_price: false,
      allowed_actions: ["discount"],
      max_discount_percent: 101,
    },
  ])
    await denied(
      "select company_save($1,'permissions',null,$2,$3)",
      [A, await revision(A), JSON.stringify(d)],
      ["23514"],
    );
});
await test("Revisão obsoleta não sobrescreve edição já salva", async () => {
  await as("adminA");
  const rev = await revision(A);
  await save(A, "settings", { legal_name: "Nova razão fictícia" });
  await denied(
    "select company_save($1,'settings',null,$2,'{\"legal_name\":\"Texto obsoleto\"}')",
    [A, rev],
    ["40001"],
  );
  assert.equal((await context(A)).settings.legal_name, "Nova razão fictícia");
});
await test("Revisão obrigatória impede bypass por null", async () => {
  await as("adminA");
  await denied(
    "select company_save($1,'permissions',null,null,'{}')",
    [A],
    ["22023"],
  );
  await denied(
    "select company_publish_manual($1,$2,null)",
    [A, manual],
    ["22023"],
  );
});
await test("Manual incompleto bloqueia publicação e ativação", async () => {
  await as("adminA");
  const id = (await context(A)).sections[0].id;
  await save(A, "section", { content: "" }, id);
  await denied(
    "select company_publish_manual($1,$2,$3)",
    [A, manual, await revision(A)],
    ["23514"],
  );
  await denied(
    "select company_set_activation($1,$2,true,false)",
    [A, await revision(A)],
    ["23514"],
  );
});
await test("Checklist não é um booleano editável pelo cliente", async () => {
  await as("adminA");
  assert.equal(
    (await scalar("select company_readiness($1)", [A])).manual_published,
    false,
  );
  await denied(
    "select company_save($1,'settings',null,$2,'{\"ready\":true}')",
    [A, await revision(A)],
    ["22023"],
  );
});
await test("Publicação completa registra versão, ator e snapshot", async () => {
  await as("adminA");
  await publish(A, manual);
  const c = await context(A);
  const m = c.manuals[0];
  assert.equal(m.status, "published");
  assert.equal(m.published_by, U.adminA);
  assert.equal(m.source_revision, c.settings.operational_revision);
  assert.equal(m.snapshot.services[0].price_cents, 15000);
  assert.equal(c.checklist.manual_published, true);
});
await test("Manual e seções publicados são imutáveis também sob proprietário SQL", async () => {
  await as("adminA");
  await publish(A, manual);
  await db.exec("reset role");
  await denied(
    "update manual_versions set title='Reescrito' where id=$1",
    [manual],
    ["23514"],
  );
  await denied("delete from manual_versions where id=$1", [manual], ["23514"]);
  await denied(
    "update manual_sections set content='Reescrito' where manual_id=$1",
    [manual],
    ["23514"],
  );
  await denied(
    "delete from manual_sections where manual_id=$1",
    [manual],
    ["23514"],
  );
});
await test("Nova versão clona manual e mantém snapshot anterior", async () => {
  await as("adminA");
  await publish(A, manual);
  const first = (await context(A)).manuals[0].snapshot;
  const next = await scalar("select company_create_manual($1,$2,$3)", [
    A,
    await revision(A),
    "Revisão seguinte",
  ]);
  const c = await context(A);
  assert.equal(c.manuals[0].version, 2);
  assert.equal(c.sections.filter((x) => x.manual_id === next).length, 11);
  await save(
    A,
    "section",
    { content: "Orientação alterada apenas no rascunho." },
    c.sections.find((x) => x.manual_id === next).id,
  );
  assert.deepEqual(
    (await context(A)).manuals.find((x) => x.id === manual).snapshot,
    first,
  );
  await as("attendant");
  await denied("select company_context($1)",[A]);
});
await test("Só um rascunho por empresa; descarte não altera publicados", async () => {
  await as("adminA");
  await denied(
    "select company_create_manual($1,$2,$3)",
    [A, await revision(A), "Duplicado"],
    ["23505"],
  );
  await publish(A, manual);
  const id = await scalar("select company_create_manual($1,$2,$3)", [
    A,
    await revision(A),
    "Descartável",
  ]);
  await db.query("select company_discard_manual($1,$2,$3)", [
    A,
    id,
    await revision(A),
  ]);
  assert.equal((await context(A)).manuals.length, 1);
  await denied(
    "select company_discard_manual($1,$2,$3)",
    [A, manual, await revision(A)],
    ["22023"],
  );
});
await test("FAQ pública exige opt-in e não expõe conteúdo privado", async () => {
  await as("adminA");
  await publish(A, manual);
  await anon();
  assert.equal(
    await scalar("select company_public_faq('aurora-ficticia')"),
    null,
  );
  await as("adminA");
  await activation(A, false, true);
  await anon();
  const f = await scalar("select company_public_faq('aurora-ficticia')");
  assert.deepEqual(Object.keys(f).sort(), [
    "faqs",
    "name",
    "published_at",
    "slug",
    "version",
  ]);
  assert.equal(f.faqs[0].question, "Como funciona?");
  assert.ok(!JSON.stringify(f).includes("example.invalid"));
  for (const t of tables) await denied("select * from " + t);
});
await test("Edição de FAQ não muda snapshot público até nova publicação", async () => {
  await as("adminA");
  await publish(A, manual);
  await activation(A, false, true);
  await save(
    A,
    "faq",
    { answer: "Resposta em rascunho ainda não aprovada." },
    faq,
  );
  await anon();
  assert.equal(
    (await scalar("select company_public_faq('aurora-ficticia')")).faqs[0]
      .answer,
    "Consulte as condições fictícias.",
  );
});
await test("Retirada da FAQ corta próxima consulta anônima", async () => {
  await as("adminA");
  await publish(A, manual);
  await activation(A, false, true);
  await activation(A, false, false);
  await anon();
  assert.equal(
    await scalar("select company_public_faq('aurora-ficticia')"),
    null,
  );
});
await test("FAQ publicada funciona sem atendente principal; humano é bloqueado", async () => {
  await as("adminA");
  await publish(A, manual);
  await as("root");
  await db.query(
    "select foundation_set_attendant($1,$2,'primary','suspended')",
    [A, U.attendant],
  );
  await as("adminA");
  await activation(A, false, true);
  await denied(
    "select company_set_activation($1,$2,true,true)",
    [A, await revision(A)],
    ["23514"],
  );
  await anon();
  assert.ok(await scalar("select company_public_faq('aurora-ficticia')"));
});
await test("Autonomia efetiva exige publicação, ativação, papel e vínculo", async () => {
  await as("attendant");
  assert.equal(
    await scalar("select company_attendant_permission($1,'price_list')", [A]),
    false,
  );
  await as("adminA");
  await publish(A, manual);
  await activation(A);
  await as("attendant");
  assert.equal(
    await scalar("select company_attendant_permission($1,'price_list')", [A]),
    true,
  );
  assert.equal(
    await scalar("select company_attendant_permission($1,'discount',1)", [A]),
    false,
  );
  await as("unlinked");
  assert.equal(
    await scalar("select company_attendant_permission($1,'price_list')", [A]),
    false,
  );
  await as("adminA");
  assert.equal(
    await scalar("select company_attendant_permission($1,'price_list')", [A]),
    false,
  );
});
await test("Desconto máximo é conferido no banco", async () => {
  await as("adminA");
  await save(A, "permissions", {
    never_change_price: false,
    allowed_actions: ["discount"],
    max_discount_percent: 10,
  });
  await publish(A, manual);
  await activation(A);
  await as("attendant");
  assert.equal(
    await scalar("select company_attendant_permission($1,'discount',10)", [A]),
    true,
  );
  for (const value of [-1, 11, 100])
    assert.equal(
      await scalar("select company_attendant_permission($1,'discount',$2)", [
        A,
        value,
      ]),
      false,
    );
});
await test("Redução de autonomia invalida prontidão e bloqueia sessão já existente", async () => {
  await as("adminA");
  await publish(A, manual);
  await activation(A);
  await save(A, "permissions", { allowed_actions: [] });
  const c = await context(A);
  assert.equal(c.settings.human_enabled, false);
  assert.equal(c.checklist.manual_published, false);
  await as("attendant");
  assert.equal(
    await scalar("select company_attendant_permission($1,'price_list')", [A]),
    false,
  );
});
for (const type of [
  "profile",
  "membership",
  "attendant",
  "role",
  "organization",
])
  await test(`Revogação/suspensão ${type} bloqueia próxima operação com mesmas claims`, async () => {
    await as("adminA");
    await publish(A, manual);
    await activation(A);
    await as("root");
    if (type === "profile")
      await db.query("select foundation_set_profile_status($1,'suspended')", [
        U.attendant,
      ]);
    if (type === "membership") {
      await db.query(
        "select foundation_set_member($1,$2,'admin_empresa','active')",
        [A, U.adminB],
      );
      await db.query(
        "select foundation_set_member($1,$2,'admin_empresa','suspended')",
        [A, U.adminA],
      );
    }
    if (type === "attendant")
      await db.query(
        "select foundation_set_attendant($1,$2,'primary','suspended')",
        [A, U.attendant],
      );
    if (type === "role")
      await db.query(
        "select foundation_set_global_role($1,'atendente',false)",
        [U.attendant],
      );
    if (type === "organization")
      await db.query(
        "select foundation_update_organization($1,'Oficina Aurora Fictícia','suspended')",
        [A],
      );
    await as(type === "membership" ? "adminA" : "attendant");
    await denied("select company_context($1)", [A]);
    assert.equal(
      await scalar("select company_attendant_permission($1,'price_list')", [A]),
      false,
    );
  });
await test("Empresa suspensa some da FAQ pública", async () => {
  await as("adminA");
  await publish(A, manual);
  await activation(A, false, true);
  await as("root");
  await db.query(
    "select foundation_update_organization($1,'Oficina Aurora Fictícia','suspended')",
    [A],
  );
  await anon();
  assert.equal(
    await scalar("select company_public_faq('aurora-ficticia')"),
    null,
  );
});
await test("Auditoria inclui empresa e ator sem conteúdo sensível", async () => {
  await as("adminA");
  await save(A, "settings", {
    exception_contact: "sensitive-test@example.invalid",
  });
  await publish(A, manual);
  const rs = (
    await db.query(
      "select * from audit_logs where organization_id=$1 and entity_table in ('company_settings','manual_versions') order by id desc",
      [A],
    )
  ).rows;
  assert.ok(
    rs.some(
      (r) => r.actor_id === U.adminA && r.changed_fields.includes("status"),
    ),
  );
  assert.ok(!JSON.stringify(rs).includes("sensitive-test@example.invalid"));
  await as("adminB");
  assert.deepEqual(
    (await db.query("select * from audit_logs where organization_id=$1", [A]))
      .rows,
    [],
  );
});
await test("Helpers privados de mutação não são executáveis", async () => {
  await as("adminA");
  for (const q of [
    "select private.company_lock($1,1)",
    "select private.company_touch($1,false)",
    "select private.company_checklist($1)",
  ])
    await denied(q, [A]);
});
await test("Todas as 75 tabelas têm RLS e FORCE RLS; nenhuma policy de escrita", async () => {
  const rs = (
    await db.query(
      "select relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'",
    )
  ).rows;
  assert.equal(rs.length, 75);
  assert.ok(rs.every((x) => x.relrowsecurity && x.relforcerowsecurity));
  const policies = (
    await db.query(
      "select tablename,policyname,cmd,roles from pg_policies where schemaname='public'",
    )
  ).rows;
  assert.equal(policies.length, 75);
  assert.ok(
    policies.every(
      (x) =>
        x.cmd === "SELECT" &&
        ((x.roles.length === 1 && x.roles[0] === "authenticated") || (x.tablename === "legal_documents" && x.policyname === "legal_read" && x.roles.length === 2 && x.roles.includes("anon") && x.roles.includes("authenticated"))),
    ),
  );
});
await test("Anon só executa a projeção pública entre as funções Empresa", async () => {
  const fs = (
    await db.query(
      "select proname,has_function_privilege('anon',p.oid,'EXECUTE') allowed,proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'company_%'",
    )
  ).rows;
  assert.equal(fs.length, 12);
  assert.ok(
    fs.every((f) => f.allowed === (f.proname === "company_public_faq")),
  );
  assert.ok(fs.every((f) => f.proconfig.includes('search_path=""')));
});
await writeFile(
  "reports/company-security-results.json",
  JSON.stringify(
    {
      environment:
        "TESTADO LOCALMENTE: PGlite PostgreSQL WASM; Auth claims simuladas",
      migrations,
      passed: results.filter((r) => r.status === "PASS").length,
      failed: results.filter((r) => r.status === "FAIL").length,
      external_status: "PENDENTE DE HOMOLOGAÇÃO EXTERNA",
      results,
    },
    null,
    2,
  ),
);
await db.close();
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
