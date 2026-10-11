import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
Object.assign(process.env, {
  SYZIA_TEAM_CURRENT: "1",
  SYZIA_FLEXIBLE_CURRENT: "1",
  SYZIA_BILLING_CURRENT: "1",
  SYZIA_OPTIONAL_MANUAL_CURRENT: "1",
  SYZIA_OPERATION_CURRENT: "1",
});
const h = await import("../support/current-db.mjs");
const { db, as, scalar, rpc, orgs, users } = h;
await db.exec("commit;reset role");
test.beforeEach(() => db.exec("begin"));
test.afterEach(() => db.exec("rollback;reset role"));
test.after(() => db.close());
async function booking() {
  const { p, s } = await h.setup();
  const items = [h.empty(s)],
    q = await h.draft(p, items);
  await h.complete(q, (await h.slots(p, items))[0]);
  const [a] = await h.records(q);
  await as("alice");
  const ctx = await rpc("consumer_request_context", { p_code: q.code });
  return { q, a, ctx };
}
const deny = (
  fn,
  pattern = /denied|unavailable|permission|conflict|invalid|required/,
) => h.denied(fn, pattern);
const doc = (q, kind, ref) =>
  rpc("consumer_document", { p_code: q.code, p_kind: kind, p_reference: ref });
const confirm = (q, a, rev = a.attendance_revision) =>
  rpc("consumer_confirm_attendance", {
    p_code: q.code,
    p_appointment: a.public_code,
    p_schedule_revision: rev,
  });
async function checklist(q, a) {
  await as("adminA");
  return rpc("operations_checklist", { p_org: orgs.A, p_appointment: a.id });
}
const save = (a, patch = {}) =>
  rpc("operations_checklist_save", {
    p_org: orgs.A,
    p_appointment: a.id,
    p_id: null,
    p_revision: 0,
    p_action: "add",
    p_title: "Conferir detalhes combinados",
    p_done: null,
    p_key: randomUUID(),
    ...patch,
  });
async function snapshot(q) {
  await db.exec("reset role");
  return scalar(
    "select jsonb_build_object('request',(select to_jsonb(t)from quote_requests t where public_code=$1),'appointments',(select jsonb_agg(to_jsonb(t))from appointments t where request_id=(select id from quote_requests where public_code=$1)))",
    [q.code],
  );
}
test("049-O01 presença é idempotente e não altera proposta, cobrança ou agendamento", async () => {
  const { q, a } = await booking(),
    before = await snapshot(q);
  await as("alice");
  const one = await confirm(q, a),
    two = await confirm(q, a);
  assert.equal(one.confirmed, true);
  assert.deepEqual(two, one);
  assert.deepEqual(await snapshot(q), before);
  assert.equal(
    await scalar("select count(*)::int from private.appointment_attendance"),
    1,
  );
  await as("adminA");
  assert.equal(
    (await rpc("operations_detail", { p_org: orgs.A, p_id: a.id })).attendance
      .confirmed,
    true,
  );
});
test("049-O02 presença não atravessa consumidor nem empresa", async () => {
  const { q, a } = await booking();
  await as("bob");
  await deny(() => confirm(q, a));
  await as("adminA");
  await deny(() => confirm(q, a));
  await as("alice");
  await deny(() => confirm({ code: h.legacy.requests.B }, a));
});
test("049-O03 remarcação invalida presença atual, mantém histórico e exige revisão nova", async () => {
  const { q, a } = await booking();
  await confirm(q, a);
  await db.exec("reset role");
  await db.query(
    "update appointments set starts_at=starts_at+interval '7 days',ends_at=ends_at+interval '7 days',revision=revision+1 where id=$1",
    [a.id],
  );
  await as("alice");
  await deny(() => confirm(q, a), /revision_conflict/);
  const ctx = await rpc("consumer_request_context", { p_code: q.code });
  assert.equal(ctx.appointments[0].attendance, null);
  await confirm(q, a, ctx.appointments[0].attendance_revision);
  await db.exec("reset role");
  assert.equal(
    await scalar("select count(*)::int from private.appointment_attendance"),
    2,
  );
});
test("049-O04 cancelado/concluído/passado não confirma presença; comprovante cancelado negado", async () => {
  const { q, a } = await booking();
  for (const mode of ["completed", "past", "cancelled"]) {
    await db.exec("savepoint variant;reset role");
    if (mode === "completed")
      await db.query(
        "update appointments set execution_state='in_progress',started_at=now()where id=$1",
        [a.id],
      );
    await db.query(
      mode === "completed"
        ? "update appointments set execution_state='completed',started_at=starts_at,completed_at=ends_at where id=$1"
        : mode === "past"
          ? "update appointments set starts_at=starts_at-interval '30 days',ends_at=ends_at-interval '30 days'where id=$1"
          : "update appointments set state='cancelled'where id=$1",
      [a.id],
    );
    await as("alice");
    const rev = await scalar(
      "select attendance_revision from appointments where id=$1",
      [a.id],
    );
    await deny(() => confirm(q, a, rev), /attendance_unavailable/);
    if (mode === "cancelled")
      await deny(
        () => doc(q, "appointment", a.public_code),
        /document_unavailable/,
      );
    await db.exec("rollback to variant");
  }
});
test("049-D01 PDFs autorizados distinguem estimativa de agendamento confirmado; preço canônico", async () => {
  const { q, a, ctx } = await booking();
  const d = await doc(q, "quote", ctx.versions[0].code);
  assert.match(d.status, /Estimativa/);
  assert.equal(d.content.total_cents, ctx.versions[0].total_cents);
  assert.equal(d.content.items[0].unit_cents, 10000);
  assert.ok(d.company.name);
  assert.ok(d.branding);
  assert.ok(!JSON.stringify(d).includes(users.alice));
  const receipt = await doc(q, "appointment", a.public_code);
  assert.equal(receipt.status, "Confirmado");
  assert.equal(receipt.content.revision, a.revision);
  assert.ok(receipt.content.services.length);
});
test("049-D02 documento privado isolado A/B, consumidor/funcionário sem grants e referência adulterada", async () => {
  const { q, a, ctx } = await booking();
  await as("bob");
  await deny(() => doc(q, "quote", ctx.versions[0].code));
  await as("adminB");
  await deny(() => doc(q, "appointment", a.public_code));
  await h.grantWorker(["agenda.read"]);
  await as("worker");
  await deny(() => doc(q, "quote", ctx.versions[0].code));
  await as("alice");
  await deny(() => doc(q, "quote", "q_invalid"));
  await deny(() => doc(q, "appointment", "b_invalid"));
});
test("049-D03 proposta final/desconto/versões/aprovação mantêm valores e estados reais", async () => {
  const { q } = await h.review();
  const first = await h.proposal(
    q,
    [h.line({ unit_cents: 15000, discount_cents: 500 })],
    { mode: "amount", value: 100 },
  );
  await as("alice");
  let ctx = await rpc("consumer_request_context", { p_code: q.code });
  let d = await doc(q, "quote", first.r.code);
  assert.equal(
    d.content.total_cents,
    ctx.versions.find((x) => x.code === first.r.code).total_cents,
  );
  assert.match(d.status, /enviada/);
  const second = await h.proposal(q, [h.line({ unit_cents: 16000 })]);
  await as("alice");
  assert.match((await doc(q, "quote", first.r.code)).status, /anterior/);
  await h.approve(q, second.r);
  assert.equal(
    (await doc(q, "quote", second.r.code)).status,
    "Proposta aprovada",
  );
});
test("049-D04 solicitação ainda não agendada não produz comprovante", async () => {
  const { q } = await h.review();
  await as("alice");
  await deny(() => doc(q, "appointment", q.code), /document_unavailable/);
});
test("049-C01 checklist vazio, persistência, múltiplos itens e auditoria sem mudança de status", async () => {
  const { q, a } = await booking();
  assert.equal((await checklist(q, a)).items.length, 0);
  const before = await snapshot(q);
  await as("adminA");
  const first = await save(a),
    second = await save(a, { p_title: "Preparar materiais" });
  await save(a, {
    p_action: "toggle",
    p_id: first.id,
    p_revision: first.revision,
    p_done: true,
  });
  assert.equal((await checklist(q, a)).items.length, 2);
  assert.equal((await checklist(q, a)).items.filter((x) => x.done).length, 1);
  await save(a, {
    p_action: "toggle",
    p_id: second.id,
    p_revision: second.revision,
    p_done: true,
  });
  assert.deepEqual(await snapshot(q), before);
  assert.equal(
    await scalar(
      "select count(*)::int from private.execution_checklist_history",
    ),
    4,
  );
});
test("049-C02 duas abas e retry: idempotência, conflito de revisão e remoção lógica", async () => {
  const { q, a } = await booking();
  await checklist(q, a);
  const args = { p_key: randomUUID() };
  const first = await save(a, args);
  assert.equal((await save(a, args)).id, first.id);
  const next = await save(a, {
    p_action: "edit",
    p_id: first.id,
    p_revision: first.revision,
    p_title: "Etapa revisada",
  });
  await deny(
    () =>
      save(a, {
        p_action: "toggle",
        p_id: first.id,
        p_revision: first.revision,
        p_done: true,
      }),
    /revision_conflict/,
  );
  await save(a, {
    p_action: "remove",
    p_id: next.id,
    p_revision: next.revision,
  });
  assert.equal((await checklist(q, a)).items.length, 0);
  await db.exec("reset role");
  assert.equal(
    await scalar("select count(*)::int from private.execution_checklist"),
    1,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from private.execution_checklist_history",
    ),
    3,
  );
});
test("049-C03 grants próprios, leitura sem edição, compartilhado e isolamento", async () => {
  const { q, a } = await booking();
  await h.grantWorker(["agenda.read"]);
  await as("worker");
  assert.equal(
    (await rpc("operations_checklist", { p_org: orgs.A, p_appointment: a.id }))
      .can_edit,
    false,
  );
  await deny(() => save(a));
  await h.grantWorker(["agenda.read", "agenda.manage"]);
  await as("worker");
  assert.ok((await save(a)).id);
  await as("adminB");
  await deny(() => save(a));
  await as("shared");
  await deny(() => save(a));
  await as("alice");
  await deny(() => save(a));
});
test("049-C04 concluído/cancelado preserva checklist e impede alteração", async () => {
  const { q, a } = await booking();
  await checklist(q, a);
  const item = await save(a);
  await db.exec("reset role");
  await db.query("update appointments set state='cancelled'where id=$1", [
    a.id,
  ]);
  await as("adminA");
  assert.equal(
    (await rpc("operations_checklist", { p_org: orgs.A, p_appointment: a.id }))
      .items[0].id,
    item.id,
  );
  await deny(() => save(a), /read_only/);
});
async function messages() {
  await h.grantWorker(h.allGrants);
  await db.exec("reset role");
  await db.query(
    "update tickets set assignee_id=$1,routing_scope='company'where public_code=$2",
    [users.worker, h.legacy.codes.A],
  );
  await as("alice");
  await rpc("central_consumer_send", {
    p_request: h.legacy.requests.A,
    p_body: "Mensagem nova 049",
    p_key: randomUUID(),
  });
  await as("adminA");
  const ctx = await rpc("central_context", { p_code: h.legacy.codes.A });
  return ctx.messages;
}
test("049-U01 contagem individual, mensagem própria excluída e refresh persistente", async () => {
  const ms = await messages();
  assert.ok(ms.at(-1).id);
  let u = await rpc("central_unread", { p_org: orgs.A });
  assert.ok(u.items.find((x) => x.code === h.legacy.codes.A).unread_count > 0);
  await rpc("central_mark_read", {
    p_code: h.legacy.codes.A,
    p_message: ms.at(-1).id,
  });
  assert.ok(
    !(await rpc("central_unread", { p_org: orgs.A })).items.some(
      (x) => x.code === h.legacy.codes.A,
    ),
  );
  await as("worker");
  assert.ok(
    (await rpc("central_unread", { p_org: orgs.A })).items.some(
      (x) => x.code === h.legacy.codes.A,
    ),
  );
  await as("alice");
  const thread = await rpc("central_consumer_thread", {
    p_request: h.legacy.requests.A,
  });
  assert.equal(thread.messages.at(-1).mine, true);
});
test("049-U02 abas fora de ordem nunca retrocedem cursor; acesso A/B negado", async () => {
  const ms = await messages();
  await rpc("central_mark_read", {
    p_code: h.legacy.codes.A,
    p_message: ms.at(-1).id,
  });
  await rpc("central_mark_read", {
    p_code: h.legacy.codes.A,
    p_message: ms[0].id,
  });
  assert.equal(
    (
      await rpc("central_mark_read", {
        p_code: h.legacy.codes.A,
        p_message: ms.at(-1).id,
      })
    ).unread_count,
    0,
  );
  await as("adminB");
  assert.equal(
    (await rpc("central_unread", { p_org: orgs.A })).items.length,
    0,
  );
  await deny(() =>
    rpc("central_mark_read", { p_code: h.legacy.codes.A, p_message: ms[0].id }),
  );
});
test("049-T01 telefone canônico aceita máscaras BR/internacional e rejeita DDD/texto/incompleto", async () => {
  await db.exec("reset role");
  for (const raw of ["(87) 99999-1234", "87 99999-1234", "+55 87 99999-1234"])
    assert.equal(
      await scalar("select private.contact_phone($1)", [raw]),
      "5587999991234",
    );
  assert.equal(
    await scalar("select private.contact_phone($1)", ["+1 202 555 0123"]),
    "+12025550123",
  );
  assert.equal(await scalar("select private.contact_phone('')"), "");
  for (const raw of [
    "texto12345678900",
    "20999991234",
    "879123",
    "87999999999",
  ])
    await deny(
      () => scalar("select private.contact_phone($1)", [raw]),
      /invalid_contact_phone/,
    );
});
test("049-T02 RPC de criação valida telefone; contato legado não cria ação autorizada", async () => {
  const { p, s } = await h.setup();
  await as("alice");
  await deny(
    () =>
      rpc("consumer_create_multi_request", {
        p_slug: p.slug,
        p_revision: p.revision,
        p_items: [h.empty(s)],
        p_customer: { ...h.customer, whatsapp: "20999991234" },
        p_notes: "",
        p_contact: false,
        p_expected_cents: 10000,
        p_key: randomUUID(),
      }),
    /invalid_contact_phone/,
  );
  const { q } = await booking();
  await as("adminA");
  const contact = await rpc("operations_request_contact", {
    p_org: orgs.A,
    p_code: q.code,
  });
  assert.equal(contact.phone, null);
  await as("adminB");
  await deny(() =>
    rpc("operations_request_contact", { p_org: orgs.A, p_code: q.code }),
  );
});
test("049-S01 RLS e FORCE RLS nas novas tabelas; cliente não lê dados privados", async () => {
  await db.exec("reset role");
  const rows = (
    await db.query(
      "select relname,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='private'::regnamespace and relname in('signup_authorizations','ticket_message_numbers','ticket_reads','appointment_attendance','execution_checklist','execution_checklist_history')",
    )
  ).rows;
  assert.equal(rows.length, 6);
  assert.ok(rows.every((r) => r.relrowsecurity && r.relforcerowsecurity));
  await as("alice");
  await deny(
    () => scalar("select count(*)from private.signup_authorizations"),
    /permission denied/,
  );
});
test("049-S02 Auth hook nega bypass, aceita nonce emitido pelo servidor uma única vez", async () => {
  await db.exec("reset role");
  const nonce = "b".repeat(64),
    hash = createHash("sha256").update(nonce).digest("hex");
  const ev = {
    user: {
      id: randomUUID(),
      email: "novo@example.invalid",
      user_metadata: {
        syzia_username: "novo49",
        syzia_signup_authorization: nonce,
      },
    },
  };
  assert.equal(
    (await scalar("select access_before_user_created($1)", [ev])).error
      .http_code,
    403,
  );
  await scalar("select access_signup_authorize($1,$2,$3)", [
    "novo@example.invalid",
    "novo49",
    hash,
  ]);
  assert.deepEqual(
    await scalar("select access_before_user_created($1)", [ev]),
    {},
  );
  assert.equal(
    (await scalar("select access_before_user_created($1)", [ev])).error
      .http_code,
    403,
  );
  assert.deepEqual(
    await scalar("select access_before_user_created($1)", [
      { user: { is_anonymous: true } },
    ]),
    {},
  );
});
test("049-S03 Auth hook vincula email/username, expira, cliente não emite autorização", async () => {
  await db.exec("reset role");
  const nonce = "c".repeat(64),
    hash = createHash("sha256").update(nonce).digest("hex");
  await scalar("select access_signup_authorize($1,$2,$3)", [
    "novo@example.invalid",
    "novo49",
    hash,
  ]);
  for (const user of [
    {
      email: "outro@example.invalid",
      user_metadata: {
        syzia_username: "novo49",
        syzia_signup_authorization: nonce,
      },
    },
    {
      email: "novo@example.invalid",
      user_metadata: {
        syzia_username: "outro49",
        syzia_signup_authorization: nonce,
      },
    },
    {
      email: "novo@example.invalid",
      app_metadata: { vireloq_provisioned: true },
    },
  ])
    assert.equal(
      (await scalar("select access_before_user_created($1)", [{ user }])).error
        .http_code,
      403,
    );
  await db.exec(
    "update private.signup_authorizations set expires_at=now()-interval '1 second'",
  );
  assert.equal(
    (
      await scalar("select access_before_user_created($1)", [
        {
          user: {
            email: "novo@example.invalid",
            user_metadata: {
              syzia_username: "novo49",
              syzia_signup_authorization: nonce,
            },
          },
        },
      ])
    ).error.http_code,
    403,
  );
  await as("alice");
  await deny(
    () =>
      rpc("access_signup_authorize", {
        p_email: "novo@example.invalid",
        p_username: "novo49",
        p_hash: hash,
      }),
    /permission denied/,
  );
});
test("049-D05 imagens originais: ticket privado de uso único, vínculo e grants preservados", async () => {
  const { p, s } = await h.setup({ photos: "optional" }),
    items = [h.empty(s)],
    q = await h.draft(p, items);
  const f = await rpc("consumer_reserve_item_attachment", {
    p_code: q.code,
    p_service: s.code,
    p_mime: "image/png",
    p_size: 100,
    p_key: randomUUID(),
  });
  await db.exec("reset role;set local role service_role");
  await rpc("consumer_finalize_attachment", {
    p_code: f.code,
    p_user: users.alice,
    p_sha256: "a".repeat(64),
    p_size: 100,
    p_width: 1,
    p_height: 1,
  });
  await h.complete(q, (await h.slots(p, items))[0], 1);
  const [a] = await h.records(q);
  await h.grantWorker(["agenda.read"]);
  await as("worker");
  const d = await rpc("operations_detail", { p_org: orgs.A, p_id: a.id });
  assert.equal(d.attachments[0].code, f.code);
  const t = await rpc("operations_attachment_ticket", {
    p_org: orgs.A,
    p_appointment: a.id,
    p_file: f.code,
  });
  await db.exec("reset role;set local role service_role");
  await deny(() =>
    rpc("consumer_gateway_download", {
      p_code: f.code,
      p_user: users.adminB,
      p_ticket: t.ticket,
    }),
  );
  const result = await rpc("consumer_gateway_download", {
    p_code: f.code,
    p_user: users.worker,
    p_ticket: t.ticket,
  });
  assert.ok(result.path);
  await deny(() =>
    rpc("consumer_gateway_download", {
      p_code: f.code,
      p_user: users.worker,
      p_ticket: t.ticket,
    }),
  );
  await as("worker");
  const expired = await rpc("operations_attachment_ticket", {
    p_org: orgs.A,
    p_appointment: a.id,
    p_file: f.code,
  });
  await db.exec("reset role");
  await db.query(
    "update attachment_tickets set expires_at=now()-interval '1 second'where token_hash=$1",
    [createHash("sha256").update(expired.ticket).digest("hex")],
  );
  await db.exec("set local role service_role");
  await deny(
    () =>
      rpc("consumer_gateway_download", {
        p_code: f.code,
        p_user: users.worker,
        p_ticket: expired.ticket,
      }),
    /download_ticket_invalid/,
  );
  await as("adminB");
  await deny(() =>
    rpc("operations_attachment_ticket", {
      p_org: orgs.A,
      p_appointment: a.id,
      p_file: f.code,
    }),
  );
  await as("alice");
  await deny(
    () =>
      rpc("consumer_reserve_item_attachment", {
        p_code: q.code,
        p_service: s.code,
        p_mime: "image/png",
        p_size: 100,
        p_key: randomUUID(),
      }),
    /locked|unavailable|closed|invalid/,
  );
});
test("049-S06 hook preserva funcionário reservado com metadata privilegiada", async () => {
  await as("adminA");
  const r = await rpc("access_reserve", {
    p_org: orgs.A,
    p_display: "Funcionário fictício 049",
    p_username: "funcionario.ficticio49",
    p_email: "funcionario49@example.invalid",
    p_phone: "11987654321",
    p_role: "own_attendant",
    p_key: randomUUID(),
  });
  await db.exec("reset role");
  assert.deepEqual(
    await scalar("select public.access_before_user_created($1)", [
      {
        user: {
          id: r.user_id,
          email: "internal@example.invalid",
          app_metadata: { vireloq_provisioned: true },
        },
      },
    ]),
    {},
  );
  assert.equal(
    (
      await scalar("select public.access_before_user_created($1)", [
        {
          user: { id: r.user_id, user_metadata: { vireloq_provisioned: true } },
        },
      ])
    ).error.http_code,
    403,
  );
});
