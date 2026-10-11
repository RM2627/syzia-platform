import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
Object.assign(process.env, {
  SYZIA_TEAM_CURRENT: "1",
  SYZIA_FLEXIBLE_CURRENT: "1",
  SYZIA_BILLING_CURRENT: "1",
  SYZIA_OPTIONAL_MANUAL_CURRENT: "1",
  SYZIA_OPERATION_CURRENT: "1",
  SYZIA_HOTFIX_049_BASELINE: "1",
});
const h = await import("../support/current-db.mjs");
const { db, as, scalar, rpc, orgs, users } = h;
await db.exec("commit;reset role;begin");
// Seed a real manual checklist before the incremental migration; it must survive verbatim.
const legacyService = await h.setup();
const legacyQ = await h.draft(legacyService.p, [h.empty(legacyService.s)]);
await h.complete(
  legacyQ,
  (await h.slots(legacyService.p, [h.empty(legacyService.s)]))[0],
);
const [legacyAppointment] = await h.records(legacyQ);
await as("adminA");
const legacyItem = await rpc("operations_checklist_save", {
  p_org: orgs.A,
  p_appointment: legacyAppointment.id,
  p_id: null,
  p_revision: 0,
  p_action: "add",
  p_title: "Manual anterior à 050",
  p_done: null,
  p_key: randomUUID(),
});
await db.exec("commit;reset role");
await db.exec(
  await readFile(
    "supabase/migrations/202610110050_service_checklists_contact.sql",
    "utf8",
  ),
);
delete process.env.SYZIA_HOTFIX_049_BASELINE;
test.beforeEach(() => db.exec("begin"));
test.afterEach(() => db.exec("rollback;reset role"));
test.after(() => db.close());
const deny = (fn) => h.denied(fn);
async function model(id, items, options = {}) {
  await as(options.user || "adminA");
  const ctx = await rpc("company_context", { p_org: orgs.A });
  const previous = id
    ? await rpc("company_service_checklist", { p_org: orgs.A, p_service: id })
    : { revision: 0 };
  const args = {
    p_org: orgs.A,
    p_id: id,
    p_expected_revision: ctx.settings.revision,
    p_data: id
      ? { description: "Descrição fictícia do serviço" }
      : {
          name: "Serviço novo fictício",
          price_mode: "fixed",
          price_cents: 10000,
          duration_minutes: 45,
          contract_mode: "immediate",
          quotes_allowed: true,
        },
    p_checklist_revision: previous.revision,
    p_items: items,
    p_key: randomUUID(),
    ...options.args,
  };
  return { r: await rpc("company_service_save_with_checklist", args), args };
}
async function book(p, services) {
  const items = services.map(h.empty),
    q = await h.draft(p, items),
    start = (await h.slots(p, items))[0],
    key = randomUUID();
  await h.complete(q, start, 0, key);
  const [a] = await h.records(q);
  return { q, a, start, key };
}
const list = async (a) => {
  await as("adminA");
  return rpc("operations_checklist", { p_org: orgs.A, p_appointment: a.id });
};
const extra = (a) =>
  rpc("operations_checklist_save", {
    p_org: orgs.A,
    p_appointment: a.id,
    p_id: null,
    p_revision: 0,
    p_action: "add",
    p_title: "Etapa extra só deste atendimento",
    p_done: null,
    p_key: randomUUID(),
  });
const issue = (q, action = "issue", org = orgs.A) =>
  rpc("operations_tracking_link", {
    p_org: org,
    p_code: q.code,
    p_action: action,
  });
const redeem = (q, l) =>
  rpc("consumer_redeem_tracking_link", { p_code: q.code, p_secret: l.secret });
test("HF-C01 criar serviço e modelo atomicamente; reorder/editar/remover lógico e histórico", async () => {
  const { r } = await model(null, [
    { title: "Conferir solicitação" },
    { title: "Preparar recursos" },
    { title: "Revisar entrega" },
  ]);
  assert.equal(r.checklist.revision, 1);
  const original = r.checklist.items;
  const { r: next } = await model(r.id, [
    { ...original[2], title: "Validar entrega" },
    original[0],
  ]);
  assert.deepEqual(
    next.checklist.items.map((x) => x.title),
    ["Validar entrega", "Conferir solicitação"],
  );
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select removed from private.service_checklist_items where id=$1",
      [original[1].id],
    ),
    true,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from private.service_checklist_history where service_id=$1",
      [r.id],
    ),
    2,
  );
});
test("HF-C02 snapshot automático multisserviços, ordem e extras separados; status intacto", async () => {
  const first = await h.setup(),
    second = await h.setup();
  await model(first.id, [{ title: "Etapa do primeiro serviço" }]);
  await model(second.id, [{ title: "Etapa do segundo serviço" }]);
  const p = await h.publish();
  const { q, a } = await book(p, [
    p.services.find((s) => s.code === first.s.code),
    p.services.find((s) => s.code === second.s.code),
  ]);
  let d = await list(a);
  assert.equal(d.items.length, 2);
  assert.deepEqual(
    new Set(d.items.map((i) => i.service_id)),
    new Set([first.id, second.id]),
  );
  assert.ok(d.items.every((i) => i.template_revision === 1));
  await extra(a);
  d = await list(a);
  assert.equal(d.items.length, 3);
  assert.equal(d.items[2].service_id, null);
  const i = d.items[0];
  await rpc("operations_checklist_save", {
    p_org: orgs.A,
    p_appointment: a.id,
    p_id: i.id,
    p_revision: i.revision,
    p_action: "toggle",
    p_title: null,
    p_done: true,
    p_key: randomUUID(),
  });
  await db.exec("reset role");
  assert.equal(
    await scalar("select execution_state from appointments where id=$1", [
      a.id,
    ]),
    "scheduled",
  );
  assert.equal(
    await scalar(
      "select count(*)::int from private.execution_checklist_history where action='instantiate'and item_id=any($1::uuid[])",
      [d.items.map((i) => i.id)],
    ),
    2,
  );
});
test("HF-C03 edição futura não muda cópia; refresh, retry do agendamento e duas abas não duplicam", async () => {
  const { id } = await h.setup();
  const { r } = await model(id, [{ title: "Modelo original" }]);
  const p = await h.publish(),
    s = p.services.find((s) => s.name.startsWith("Serviço 042"));
  const { q, a, start, key } = await book(p, [s]);
  const before = await list(a);
  await model(id, [{ ...r.checklist.items[0], title: "Somente futuro" }]);
  assert.deepEqual(await list(a), before);
  await h.complete(q, start, 0, key);
  assert.deepEqual(await list(a), before);
  const saved = await model(id, [{ title: "Outra etapa" }]);
  await as("adminA");
  assert.deepEqual(
    await rpc("company_service_save_with_checklist", saved.args),
    saved.r,
  );
  await deny(() =>
    rpc("company_service_save_with_checklist", {
      ...saved.args,
      p_key: randomUUID(),
    }),
  );
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*)::int from private.execution_checklist_snapshots where appointment_id=$1",
      [a.id],
    ),
    1,
  );
});
test("HF-C04 sem modelo e agendamentos legados continuam manuais", async () => {
  await db.exec("reset role");
  const legacy = (
    await db.query(
      "select a.*from appointments a join private.execution_checklist_snapshots s on s.appointment_id=a.id where a.organization_id=$1 and s.origin='legacy' and a.kind='booking'limit 1",
      [orgs.A],
    )
  ).rows[0];
  assert.ok(legacy);
  const before = await list(legacy);
  assert.equal(before.items[0].id, legacyItem.id);
  assert.equal(before.items[0].title, legacyItem.title);
  const { id, p, s } = await h.setup();
  const { a } = await book(p, [s]);
  assert.equal((await list(a)).items.length, 0);
  await extra(a);
  await model(id, [{ title: "Criado depois" }]);
  assert.equal((await list(a)).items.length, 1);
  assert.deepEqual(await list(legacy), before);
});
test("HF-C05 autorização A/B, IDs adulterados, limite e transação sem serviço parcial", async () => {
  const { id } = await h.setup();
  const x = await model(id, [{ title: "Restrita" }]);
  await as("adminB");
  await deny(() =>
    rpc("company_service_checklist", { p_org: orgs.A, p_service: id }),
  );
  await deny(() => rpc("company_service_save_with_checklist", x.args));
  await h.grantWorker(["services.read"], false);
  await as("worker");
  await deny(() => rpc("company_service_save_with_checklist", x.args));
  await as("adminA");
  await deny(() =>
    rpc("company_service_checklist", { p_org: orgs.B, p_service: id }),
  );
  const ctx = await rpc("company_context", { p_org: orgs.A });
  const args = {
    ...x.args,
    p_id: null,
    p_expected_revision: ctx.settings.revision,
    p_data: {
      name: "Não pode persistir",
      price_mode: "quote",
      quotes_allowed: true,
    },
    p_checklist_revision: 0,
    p_items: [{ id: x.r.checklist.items[0].id, title: "Não" }],
    p_key: randomUUID(),
  };
  await deny(() => rpc("company_service_save_with_checklist", args));
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*)::int from services where name='Não pode persistir'",
    ),
    0,
  );
  await as("adminA");
  await deny(() =>
    rpc("company_service_save_with_checklist", {
      ...args,
      p_key: randomUUID(),
      p_items: Array.from({ length: 101 }, () => ({ title: "Etapa" })),
    }),
  );
});
test("HF-C06 funcionários com grants; RLS/FORCE e ausência de acesso direto", async () => {
  const { id } = await h.setup();
  await h.grantWorker(["services.read", "services.manage"], false);
  const saved = await model(id, [{ title: "Por gestor delegado" }], {
    user: "worker",
  });
  assert.equal(saved.r.checklist.items.length, 1);
  await db.exec("reset role");
  for (const t of [
    "service_checklist_models",
    "service_checklist_items",
    "service_checklist_history",
    "execution_checklist_snapshots",
  ]) {
    const r = (
      await db.query(
        "select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass",
        ["private." + t],
      )
    ).rows[0];
    assert.equal(r.relrowsecurity, true);
    assert.equal(r.relforcerowsecurity, true);
    assert.equal(
      await scalar("select has_table_privilege('authenticated',$1,'SELECT')", [
        "private." + t,
      ]),
      false,
    );
  }
});
test("HF-L01 link forte só da solicitação original; outra sessão legítima; reuso pela mesma sessão", async () => {
  const { p, s } = await h.setup(),
    { q } = await book(p, [s]);
  await as("adminA");
  const l = await issue(q);
  assert.equal(l.code, q.code);
  assert.match(l.secret, /^[a-f0-9]{64}$/);
  assert.equal(l.scope, "manage");
  await as("bob");
  await deny(() => rpc("consumer_request_context", { p_code: q.code }));
  await redeem(q, l);
  await redeem(q, l);
  const ctx = await rpc("consumer_request_context", { p_code: q.code });
  assert.equal(ctx.code, q.code);
  assert.equal(ctx.can_manage, true);
  await as("alice");
  await deny(() => redeem(q, l)); // another identity cannot claim the already bound token
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*)::int from quote_requests where public_code=$1",
      [q.code],
    ),
    1,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from customer_access where token_id in(select id from request_access_tokens where request_id=(select id from quote_requests where public_code=$1))",
      [q.code],
    ),
    1,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from request_access_tokens where token_hash=$1",
      [l.secret],
    ),
    0,
  );
});
test("HF-L02 expirado/revogado/reemitido recusam, sem perder a sessão original", async () => {
  const { p, s } = await h.setup(),
    { q } = await book(p, [s]);
  await as("adminA");
  const first = await issue(q),
    second = await issue(q);
  await as("bob");
  await deny(() => redeem(q, first));
  await redeem(q, second);
  await as("adminA");
  await issue(q, "revoke");
  await as("bob");
  await deny(() => rpc("consumer_request_context", { p_code: q.code }));
  await as("adminA");
  const third = await issue(q);
  await db.exec("reset role");
  await db.query(
    "update request_access_tokens set expires_at=now()-interval '1 second'where request_id=(select id from quote_requests where public_code=$1)",
    [q.code],
  );
  await as("bob");
  await deny(() => redeem(q, third));
  await as("alice");
  assert.equal(
    (await rpc("consumer_request_context", { p_code: q.code })).code,
    q.code,
  );
});
test("HF-L03 acesso de terceiro, somente leitura, suporte e tenant divergente recusados", async () => {
  const { p, s } = await h.setup(),
    { q } = await book(p, [s]);
  for (const u of ["alice", "bob", "adminB", "shared"]) {
    await as(u);
    await deny(() => issue(q));
  }
  await h.grantWorker(["quotes.read"]);
  await as("worker");
  await deny(() => issue(q));
  await h.grantWorker(["quotes.read", "quotes.manage", "quotes.values"]);
  await as("worker");
  await deny(() => issue(q));
  await as("adminA");
  await deny(() => issue(q, "issue", orgs.B));
  await deny(() => issue({ code: "r_invalid" }));
});
test("HF-U01 metadados humanos, não lidas individuais e isolamento; sem telefone/conteúdo", async () => {
  await as("alice");
  await rpc("central_consumer_send", {
    p_request: h.legacy.requests.A,
    p_body: "Texto privado fictício",
    p_key: randomUUID(),
  });
  await as("adminA");
  let d = await rpc("central_unread", { p_org: orgs.A });
  const t = d.items.find((i) => i.code === h.legacy.codes.A);
  assert.ok(t.customer);
  assert.ok(t.service);
  assert.ok(t.unread_count > 0);
  assert.deepEqual(Object.keys(t).sort(), [
    "code",
    "customer",
    "organization_id",
    "service",
    "unread_count",
  ]);
  assert.ok(!JSON.stringify(d).includes("Texto privado fictício"));
  const ctx = await rpc("central_context", { p_code: t.code });
  await rpc("central_mark_read", {
    p_code: t.code,
    p_message: ctx.messages.at(-1).id,
  });
  d = await rpc("central_unread", { p_org: orgs.A });
  assert.ok(!d.items.some((i) => i.code === t.code));
  await as("adminB");
  assert.deepEqual((await rpc("central_unread", { p_org: orgs.A })).items, []);
});
test("HF-W01 contato só com consentimento/grants; reenvio não revela telefone por si", async () => {
  const { p, s } = await h.setup(),
    { q } = await book(p, [s]);
  await as("adminA");
  let c = await rpc("operations_request_contact", {
    p_org: orgs.A,
    p_code: q.code,
  });
  assert.equal(c.phone, null);
  assert.equal(c.name, null);
  assert.equal(c.can_share_tracking, true);
  await as("alice");
  await rpc("consumer_set_contact", { p_code: q.code, p_allowed: true });
  await as("adminA");
  c = await rpc("operations_request_contact", {
    p_org: orgs.A,
    p_code: q.code,
  });
  assert.ok(c.phone);
  assert.ok(c.name);
  await as("adminB");
  await deny(() =>
    rpc("operations_request_contact", { p_org: orgs.A, p_code: q.code }),
  );
});
test("HF-C07 serviço removido da proposta não instancia; serviço acrescido usa fonte canônica", async () => {
  const review = await h.review(),
    added = await h.setup();
  await model(review.id, [{ title: "Não contratado" }]);
  await model(added.id, [{ title: "Contratado na proposta final" }]);
  const result = await h.proposal(review.q, [
    h.line({ kind: "service", position: undefined, code: added.s.code }),
  ]);
  await h.approve(review.q, result.r);
  const [a] = await h.records(review.q);
  assert.ok(a);
  const d = await list(a);
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].service_id, added.id);
  assert.equal(d.items[0].title, "Contratado na proposta final");
});
test("HF-C08 modelo vazio é opcional, p_key adulterada recusada; replay não cria novo serviço", async () => {
  const r = await model(null, []);
  assert.equal(r.r.checklist.items.length, 0);
  await as("adminA");
  assert.deepEqual(
    await rpc("company_service_save_with_checklist", r.args),
    r.r,
  );
  await deny(() =>
    rpc("company_service_save_with_checklist", {
      ...r.args,
      p_items: [{ title: "Adulterado" }],
    }),
  );
});
