import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
const c = await consumerDB(),
  { db, as, rpc, scalar, orgs, services, manuals } = c,
  results = [];
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
const page = await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" }),
  svc = page.services.find((s) => s.price_mode === "fixed");
function args(over = {}) {
  return {
    p_slug: "ms-auto-ficticia",
    p_revision: page.revision,
    p_service: svc.code,
    p_addons: [],
    p_answers: { [svc.questions[0].code]: "Carro fictício" },
    p_customer: {
      name: "Pessoa fictícia",
      whatsapp: "81999990000",
      email: null,
      accepted_notice: true,
      notice_version: "consumer-v1",
    },
    p_notes: "Teste fictício",
    p_contact: false,
    p_expected_cents: 12000,
    p_key: randomUUID(),
    ...over,
  };
}
async function create(user = "alice", over = {}, submit = true) {
  await as(user);
  const q = await rpc("consumer_create_request", args(over));
  if (submit)
    await rpc("consumer_submit_request", {
      p_code: q.code,
      p_attachment_count: 0,
      p_key: randomUUID(),
    });
  return q.code;
}
async function send(code, amount = 15000) {
  await as("adminA");
  const q = await rpc("consumer_request_context", { p_code: code });
  return rpc("consumer_send_quote", {
    p_code: code,
    p_items: [{ name: "Serviço acordado", quantity: 1, unit_cents: amount }],
    p_duration: 60,
    p_expires: new Date(Date.now() + 86400000).toISOString(),
    p_expected_revision: q.revision,
    p_key: randomUUID(),
  });
}
const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const slots = () =>
  rpc("consumer_slots", {
    p_slug: "ms-auto-ficticia",
    p_service: svc.code,
    p_addons: [],
    p_day: day,
  });
const book = (code, start, previous = null, key = randomUUID()) =>
  rpc("consumer_book", {
    p_code: code,
    p_start: start,
    p_previous: previous,
    p_key: key,
  });
await test("Página sem login expõe apenas campos públicos, sem UUIDs nem conteúdo interno", async () => {
  await as("anon");
  const p = await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" }),
    s = JSON.stringify(p);
  assert.ok(s.includes("Lavagem"));
  assert.ok(
    !/INTERNO SECRETO|REGRA PRIVADA|MANUAL INTERNO|OBSERVAÇÃO INTERNA|NUNCA PUBLICAR|organization_id|exception_contact|[0-9a-f]{8}-[0-9a-f]{4}-/i.test(
      s,
    ),
  );
  assert.equal(p.name, page.name);
});
await test("Empresa B publica somente seus próprios dados", async () => {
  await as("anon");
  const p = await rpc("consumer_public_page", { p_slug: "horizonte-ficticio" });
  assert.notEqual(p.name, page.name);
  assert.notEqual(p.services[0].code, page.services[0].code);
});
await test("Anon sem sessão não cria solicitação", async () => {
  await as("anon");
  await denied(() => rpc("consumer_create_request", args()));
});
await test("Sessão anônima do consumidor continua impedida de acessar Fundação", async () => {
  await as("alice");
  await denied(() => scalar("select foundation_context()"));
});
await test("Criação, revisão congelada e envio funcionam com identidade técnica", async () => {
  const code = await create();
  const q = await rpc("consumer_request_context", { p_code: code });
  assert.equal(q.state, "submitted");
  assert.equal(q.versions[0].total_cents, 12000);
  assert.equal(q.versions[0].kind, "estimate");
});
await test("Mesmo telefone não permite acessar outro consumidor por código ou UUID", async () => {
  const a = await create("alice"),
    b = await create("bob");
  await denied(() => rpc("consumer_request_context", { p_code: a }));
  const rows = (await db.query("select public_code from quote_requests")).rows;
  assert.deepEqual(
    rows.map((r) => r.public_code),
    [b],
  );
  await db.exec("reset role");
  const id = await scalar(
    "select id from quote_requests where public_code=$1",
    [a],
  );
  await as("bob");
  assert.equal(
    await scalar("select count(*)::int from quote_requests where id=$1", [id]),
    0,
  );
});
await test("Mesmo telefone em empresas distintas não compartilha cadastro", async () => {
  await create();
  const p = await rpc("consumer_public_page", { p_slug: "horizonte-ficticio" }),
    s = p.services.find((s) => s.price_mode === "fixed");
  await create("alice", {
    p_slug: p.slug,
    p_revision: p.revision,
    p_service: s.code,
    p_answers: { [s.questions[0].code]: "Outro carro" },
  });
  assert.equal(await scalar("select count(*)::int from customers"), 2);
});
await test("Admin A não consulta solicitação da empresa B", async () => {
  const p = await rpc("consumer_public_page", { p_slug: "horizonte-ficticio" }),
    s = p.services.find((s) => s.price_mode === "fixed");
  const b = await create("bob", {
    p_slug: p.slug,
    p_revision: p.revision,
    p_service: s.code,
    p_answers: { [s.questions[0].code]: "B" },
  });
  await as("adminA");
  await denied(() => rpc("consumer_request_context", { p_code: b }));
  assert.equal(await scalar("select count(*)::int from customers"), 0);
});
await test("Preço manipulado e adicional de outra empresa são rejeitados", async () => {
  await as("alice");
  await denied(
    () => rpc("consumer_create_request", args({ p_expected_cents: 1 })),
    ["22023"],
  );
  await denied(
    () => rpc("consumer_create_request", args({ p_addons: ["a_invalid"] })),
    ["22023"],
  );
});
await test("Cálculo inclui adicionais e duração no banco", async () => {
  const code = await create("alice", {
    p_addons: [svc.addons[0].code],
    p_expected_cents: 16500,
  });
  const q = await rpc("consumer_request_context", { p_code: code });
  assert.equal(q.versions[0].total_cents, 16500);
  assert.equal(q.versions[0].duration_minutes, 90);
});
await test("A partir de é estimativa; sob consulta não inventa valor", async () => {
  for (const mode of ["from", "quote"]) {
    const s = page.services.find((s) => s.price_mode === mode);
    const code = await create("alice", {
      p_service: s.code,
      p_answers: {},
      p_expected_cents: s.price_cents,
    });
    const q = await rpc("consumer_request_context", { p_code: code });
    assert.equal(q.versions[0].price_mode, mode);
    assert.equal(q.versions[0].kind, "estimate");
    await denied(
      () =>
        rpc("consumer_approve_quote", {
          p_code: code,
          p_version: q.versions[0].code,
          p_key: randomUUID(),
        }),
      ["22023"],
    );
  }
});
await test("Resposta obrigatória e versão de aviso ausente são rejeitadas", async () => {
  await as("alice");
  await denied(
    () => rpc("consumer_create_request", args({ p_answers: {} })),
    ["22023"],
  );
  await denied(
    () =>
      rpc(
        "consumer_create_request",
        args({
          p_customer: {
            name: "Teste",
            whatsapp: "81999990000",
            accepted_notice: true,
          },
        }),
      ),
    ["22023"],
  );
});
await test("Consentimento operacional não implica contato ou marketing; contato revogável", async () => {
  const code = await create();
  assert.equal(
    await scalar(
      "select count(*)::int from customer_consents where purpose='request_contact'",
    ),
    0,
  );
  await rpc("consumer_set_contact", { p_code: code, p_allowed: true });
  await rpc("consumer_set_contact", { p_code: code, p_allowed: false });
  assert.equal(
    await scalar(
      "select count(*)::int from customer_consents where purpose='request_contact' and revoked_at is null",
    ),
    0,
  );
});
await test("Criação repetida é idempotente e chave com payload alterado é rejeitada", async () => {
  await as("alice");
  const a = args();
  const q = await rpc("consumer_create_request", a);
  assert.deepEqual(await rpc("consumer_create_request", a), q);
  await denied(
    () => rpc("consumer_create_request", { ...a, p_notes: "Alterado" }),
    ["22023"],
  );
  assert.equal(await scalar("select count(*)::int from quote_requests"), 1);
});
await test("Rascunho de preço não muda publicação; nova publicação exige revisão atual", async () => {
  await as("adminA");
  await c.save("A", "service", { price_cents: 25000 }, services.A[0]);
  assert.equal(
    (
      await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" })
    ).services.find((s) => s.code === svc.code).price_cents,
    12000,
  );
  await rpc("consumer_publish_page", {
    p_org: orgs.A,
    p_manual: manuals.A,
    p_enabled: true,
    p_show_prices: true,
    p_expected_revision: 1,
  });
  await as("alice");
  await denied(() => rpc("consumer_create_request", args()), ["40001"]);
});
await test("Serviço desativado durante preenchimento não pode ser contratado", async () => {
  await as("adminA");
  await c.save("A", "service", { active: false }, services.A[0]);
  await as("alice");
  await denied(() => rpc("consumer_create_request", args()), ["22023"]);
  assert.ok(
    !(
      await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" })
    ).services.some((s) => s.code === svc.code),
  );
});
await test("Orçamento final enviado é imutável inclusive para escrita privilegiada acidental", async () => {
  const code = await create();
  await send(code);
  await db.exec("reset role");
  await denied(
    () =>
      db.query("update quote_versions set total_cents=1 where kind='final'"),
    ["23514"],
  );
  await denied(
    () => db.query("update quote_items set unit_cents=1"),
    ["23514"],
  );
});
await test("Versão antiga não é aprovada; atual aprova uma única vez", async () => {
  const code = await create(),
    v1 = await send(code),
    v2 = await send(code, 16000);
  await as("alice");
  await denied(
    () =>
      rpc("consumer_approve_quote", {
        p_code: code,
        p_version: v1.code,
        p_key: randomUUID(),
      }),
    ["22023"],
  );
  const a = { p_code: code, p_version: v2.code, p_key: randomUUID() };
  await rpc("consumer_approve_quote", a);
  await rpc("consumer_approve_quote", a);
  await rpc("consumer_approve_quote", { ...a, p_key: randomUUID() });
  assert.equal(
    await scalar(
      "select count(*)::int from request_events where event='approved'",
    ),
    1,
  );
});
await test("Proposta expirada não é aprovada", async () => {
  const code = await create(),
    v = await send(code);
  await db.exec("reset role");
  await db.exec(
    "alter table quote_versions disable trigger quote_version_immutable",
  );
  await db.query(
    "update quote_versions set expires_at=now()-interval '1 second' where public_code=$1",
    [v.code],
  );
  await db.exec(
    "alter table quote_versions enable trigger quote_version_immutable",
  );
  await as("alice");
  await denied(
    () =>
      rpc("consumer_approve_quote", {
        p_code: code,
        p_version: v.code,
        p_key: randomUUID(),
      }),
    ["22023"],
  );
});
await test("Colaborador e consumidor não alteram permissões nem enviam proposta", async () => {
  const code = await create();
  await denied(() => sendAsConsumer(code));
  await as("worker");
  await denied(() => rpc("consumer_admin_context", { p_org: orgs.A }));
  await denied(() =>
    db.query("update attendant_permissions set max_discount_percent=99"),
  );
  await denied(() =>
    rpc("consumer_publish_page", {
      p_org: orgs.A,
      p_manual: manuals.A,
      p_enabled: true,
      p_show_prices: true,
      p_expected_revision: 1,
    }),
  );
});
function sendAsConsumer(code) {
  return rpc("consumer_send_quote", {
    p_code: code,
    p_items: [{ name: "Inválido", quantity: 1, unit_cents: 1 }],
    p_duration: 60,
    p_expires: new Date(Date.now() + 86400000).toISOString(),
    p_expected_revision: 2,
    p_key: randomUUID(),
  });
}
await test("Agenda respeita horários, antecedência e duração adicional", async () => {
  await as("anon");
  const s = await slots();
  assert.ok(s.length > 0);
  assert.ok(
    s.every(
      (t) => new Date(t).getUTCHours() >= 11 && new Date(t).getUTCHours() <= 20,
    ),
  );
  assert.deepEqual(
    await rpc("consumer_slots", {
      p_slug: "ms-auto-ficticia",
      p_service: svc.code,
      p_addons: [],
      p_day: "2000-01-01",
    }),
    [],
  );
});
await test("Duas tentativas locais para mesmo horário não obtêm duas reservas", async () => {
  const a = await create("alice"),
    b = await create("bob"),
    s = await slots();
  await as("alice");
  await book(a, s[0]);
  await as("bob");
  await denied(() => book(b, s[0]), ["23P01"]);
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*)::int from appointments where state='confirmed'",
    ),
    1,
  );
});
await test("Constraint de exclusão impede sobreposição mesmo sem RPC", async () => {
  const a = await create(),
    s = await slots();
  await book(a, s[0]);
  await db.exec("reset role");
  await denied(
    () =>
      db.query(
        "insert into appointments(organization_id,resource_id,kind,starts_at,ends_at) select organization_id,resource_id,'block',starts_at,ends_at from appointments",
      ),
    ["23P01"],
  );
});
await test("Remarcação malsucedida preserva reserva original", async () => {
  const a = await create("alice"),
    b = await create("bob"),
    s = await slots();
  await as("alice");
  const ap = await book(a, s[0]);
  await as("bob");
  await book(b, s[4]);
  await as("alice");
  await denied(() => book(a, s[4], ap.code), ["23P01"]);
  assert.equal(
    new Date(
      (await rpc("consumer_request_context", { p_code: a })).appointments[0]
        .starts_at,
    ).getTime(),
    new Date(s[0]).getTime(),
  );
});
await test("Agendamento repetido é idempotente; cancelamento libera capacidade", async () => {
  const a = await create(),
    s = await slots(),
    key = randomUUID();
  const first = await book(a, s[0], null, key);
  assert.deepEqual(await book(a, s[0], null, key), first);
  await rpc("consumer_cancel_booking", {
    p_code: a,
    p_appointment: first.code,
    p_key: randomUUID(),
  });
  assert.ok((await slots()).includes(s[0]));
});
await test("Bloqueio usa a mesma exclusão de capacidade e pode ser removido", async () => {
  await as("adminA");
  const s = await slots();
  const b = await rpc("consumer_schedule_block", {
    p_org: orgs.A,
    p_start: s[0],
    p_end: s[4],
    p_note: "Bloqueio fictício",
    p_key: randomUUID(),
  });
  await as("anon");
  assert.ok(!(await slots()).includes(s[0]));
  await as("adminA");
  await rpc("consumer_remove_block", { p_org: orgs.A, p_code: b.code });
  assert.ok((await slots()).includes(s[0]));
});
await test("Link forte guarda somente hash e permite apenas a solicitação vinculada", async () => {
  const a = await create(),
    other = await create();
  const l = await rpc("consumer_create_tracking_link", {
    p_code: a,
    p_manage: false,
  });
  assert.match(l.secret, /^[a-f0-9]{64}$/);
  assert.equal(
    await scalar("select count(*)::int from request_access_tokens"),
    0,
  );
  await as("bob");
  await rpc("consumer_redeem_tracking_link", { p_code: a, p_secret: l.secret });
  await rpc("consumer_request_context", { p_code: a });
  await denied(() => rpc("consumer_request_context", { p_code: other }));
  await denied(() =>
    rpc("consumer_set_contact", { p_code: a, p_allowed: true }),
  );
  await as("charlie");
  await denied(() =>
    rpc("consumer_redeem_tracking_link", { p_code: a, p_secret: l.secret }),
  );
});
await test("Link revogado e expirado nega acesso em sessão já existente", async () => {
  const a = await create();
  const l = await rpc("consumer_create_tracking_link", {
    p_code: a,
    p_manage: true,
  });
  await as("bob");
  await rpc("consumer_redeem_tracking_link", { p_code: a, p_secret: l.secret });
  await as("alice");
  await rpc("consumer_revoke_tracking", { p_code: a });
  await as("bob");
  await denied(() => rpc("consumer_request_context", { p_code: a }));
  await as("alice");
  const t = await rpc("consumer_create_tracking_link", {
    p_code: a,
    p_manage: false,
  });
  await db.exec("reset role");
  await db.exec(
    "update request_access_tokens set expires_at=now()-interval '1 second'",
  );
  await as("charlie");
  await denied(() =>
    rpc("consumer_redeem_tracking_link", { p_code: a, p_secret: t.secret }),
  );
});
await test("Tipos e limites de anexo validados também no banco", async () => {
  const a = await create("alice", {}, false);
  await denied(
    () =>
      rpc("consumer_reserve_attachment", {
        p_code: a,
        p_mime: "image/svg+xml",
        p_size: 200,
        p_key: randomUUID(),
      }),
    ["23514"],
  );
  await denied(
    () =>
      rpc("consumer_reserve_attachment", {
        p_code: a,
        p_mime: "image/jpeg",
        p_size: 5242881,
        p_key: randomUUID(),
      }),
    ["23514"],
  );
  for (let i = 0; i < 5; i++)
    await rpc("consumer_reserve_attachment", {
      p_code: a,
      p_mime: "image/jpeg",
      p_size: 100,
      p_key: randomUUID(),
    });
  await denied(
    () =>
      rpc("consumer_reserve_attachment", {
        p_code: a,
        p_mime: "image/jpeg",
        p_size: 100,
        p_key: randomUUID(),
      }),
    ["22023"],
  );
});
await test("Consumidor não finaliza upload sem gateway nem lê anexo de outro", async () => {
  const a = await create("alice", {}, false),
    f = await rpc("consumer_reserve_attachment", {
      p_code: a,
      p_mime: "image/png",
      p_size: 100,
      p_key: randomUUID(),
    });
  await denied(() =>
    rpc("consumer_finalize_attachment", {
      p_code: f.code,
      p_user: users.alice,
      p_sha256: "a".repeat(64),
      p_size: 100,
      p_width: 1,
      p_height: 1,
    }),
  );
  await db.exec("reset role;set local role service_role");
  await rpc("consumer_finalize_attachment", {
    p_code: f.code,
    p_user: users.alice,
    p_sha256: "a".repeat(64),
    p_size: 100,
    p_width: 1,
    p_height: 1,
  });
  await as("bob");
  await denied(() => rpc("consumer_attachment_ticket", { p_code: f.code }));
  assert.equal(await scalar("select count(*)::int from attachments"), 0);
  await as("alice");
  const t = await rpc("consumer_attachment_ticket", { p_code: f.code });
  await db.exec("reset role;set local role service_role");
  await denied(() =>
    rpc("consumer_gateway_download", {
      p_code: f.code,
      p_user: users.bob,
      p_ticket: t.ticket,
    }),
  );
  await rpc("consumer_gateway_download", {
    p_code: f.code,
    p_user: users.alice,
    p_ticket: t.ticket,
  });
  await denied(() =>
    rpc("consumer_gateway_download", {
      p_code: f.code,
      p_user: users.alice,
      p_ticket: t.ticket,
    }),
  );
});
await test("Envio não aceita anexos ainda não validados", async () => {
  const a = await create("alice", {}, false);
  await rpc("consumer_reserve_attachment", {
    p_code: a,
    p_mime: "image/png",
    p_size: 100,
    p_key: randomUUID(),
  });
  await denied(
    () =>
      rpc("consumer_submit_request", {
        p_code: a,
        p_attachment_count: 1,
        p_key: randomUUID(),
      }),
    ["22023"],
  );
});
await test("Empresa suspensa interrompe operação pública e acesso privado existente", async () => {
  const a = await create();
  await db.exec("reset role");
  await db.query("update organizations set status='suspended' where id=$1", [
    orgs.A,
  ]);
  await as("alice");
  assert.equal(
    await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" }),
    null,
  );
  await denied(() => rpc("consumer_request_context", { p_code: a }));
  await denied(() => rpc("consumer_create_request", args()), ["22023"]);
});
await test("Suspensão de perfil e revogação de membro têm efeito sem renovar sessão", async () => {
  const a = await create();
  await db.exec("reset role");
  await db.query("update profiles set status='suspended' where id=$1", [
    users.alice,
  ]);
  await as("alice");
  await denied(() => rpc("consumer_request_context", { p_code: a }));
  await db.exec("reset role");
  await db.query(
    "update organization_members set status='suspended' where organization_id=$1 and user_id=$2",
    [orgs.A, users.adminA],
  );
  await as("adminA");
  await denied(() => rpc("consumer_admin_context", { p_org: orgs.A }));
});
await test("Todas as tabelas preservam FORCE RLS e nenhuma escrita direta do consumidor", async () => {
  await as("alice");
  const rows = (
    await db.query(
      "select relname,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r'",
    )
  ).rows;
  assert.equal(rows.length, 75);
  assert.ok(rows.every((r) => r.relrowsecurity && r.relforcerowsecurity));
  for (const t of [
    "customers",
    "quote_requests",
    "quote_versions",
    "appointments",
    "consumer_pages",
    "customer_access",
    "request_access_tokens",
  ])
    await denied(() => db.query(`delete from public.${t}`));
});
await test("Auditoria registra operações sem dados pessoais nem segredos", async () => {
  await create();
  await db.exec("reset role");
  const logs = JSON.stringify(
    (await db.query("select * from audit_logs")).rows,
  );
  assert.ok(logs.includes("quote_requests"));
  assert.ok(!logs.includes("81999990000"));
  assert.ok(!logs.includes("Carro fictício"));
});
await writeFile(
  "reports/consumer-results.json",
  JSON.stringify(
    {
      environment:
        "LOCAL PGlite; Auth simulado; sem HTTP externo ou conexões independentes",
      tests: results,
      passed: results.filter((r) => r.status === "PASS").length,
      failed: results.filter((r) => r.status === "FAIL").length,
    },
    null,
    2,
  ),
);
await db.close();
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
