import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { seedCentral } from "./fixtures/central.mjs";
const c = await consumerDB({ through: "202609260040_post_homologation.sql" }),
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
    "supabase/migrations/202609260041_self_service_journeys.sql",
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
} = {}) {
  await as("adminA");
  const name = "Serviço 041 fictício " + ++serviceSequence;
  const id = await save("A", "service", {
    name,
    price_mode: mode,
    price_cents: mode === "quote" ? null : 10000,
    duration_minutes: duration,
    contract_mode: contract,
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
await test("01 Upgrade populado 040→041 preserva todas as colunas e linhas anteriores", async () =>
  assert.deepEqual(await snapshot(), before));
await test("02 Contratação direta: reserva sem atendente, proposta final ou pagamento", async () => {
  const { p, s } = await setup();
  const items = [empty(s)],
    q = await draft(p, items);
  const start = (await slots(p, items))[0];
  const r = await complete(q, start);
  assert.equal(r.journey, "direct");
  assert.ok(r.booking);
  const d = await ctx(q.code);
  assert.equal(d.appointments.length, 1);
  assert.equal(d.accepted_version, null);
  assert.equal(d.versions.filter((v) => v.kind === "final").length, 0);
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*)::int from tickets where request_id=(select id from quote_requests where public_code=$1)",
      [q.code],
    ),
    0,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from payments where request_id=(select id from quote_requests where public_code=$1)",
      [q.code],
    ),
    0,
  );
});
await test("03 Preço fixo + adicional: total e duração calculados e reservados", async () => {
  const { id, s: initial } = await setup();
  await as("adminA");
  await save("A", "addon", {
    service_id: id,
    name: "Complemento determinístico",
    price_mode: "fixed",
    price_cents: 3000,
    duration_minutes: 30,
  });
  const p = await publish(),
    s = p.services.find((s) => s.code === initial.code),
    items = [{ ...empty(s), addons: [s.addons[0].code] }],
    q = await draft(p, items);
  const r = await complete(q, (await slots(p, items))[0]);
  assert.equal(
    (new Date(r.booking.ends_at) - new Date(r.booking.starts_at)) / 60000,
    75,
  );
  assert.equal((await ctx(q.code)).versions[0].total_cents, 13000);
});
await test("04 A partir de vai direto ao atendente próprio elegível", async () => {
  await grantWorker([...quoteGrants, ...centralGrants]);
  const { p, s } = await setup({ mode: "from" }),
    items = [empty(s)],
    q = await draft(p, items);
  await complete(q, (await slots(p, items))[0]);
  await as("worker");
  const queue = await rpc("central_queue", { p_org: orgs.A, p_view: "all" });
  const ticket =
    queue.tickets.find(
      (t) => t.request === q.code || t.request_code === q.code,
    ) || queue.tickets.find((t) => t.routing_scope === "company");
  assert.ok(ticket);
  const d = await rpc("central_context", { p_code: ticket.code });
  assert.equal(d.ticket.assignee_id, users.worker);
  assert.equal(d.ticket.routing_scope, "company");
});
await test("05 Sob consulta sem próprio autorizado é atribuído ao ADM", async () => {
  const { q } = await review();
  await db.exec("reset role");
  const t = (
    await db.query(
      "select t.*from tickets t join quote_requests q on q.id=t.request_id where q.public_code=$1",
      [q.code],
    )
  ).rows[0];
  assert.equal(t.assignee_id, users.adminA);
  assert.equal(t.routing_scope, "company");
  assert.match(t.routing_reason, /Avaliação/);
});
await test("06 Compartilhado não recebe nem abre ticket de avaliação por RPC ou RLS", async () => {
  const { q } = await review();
  await db.exec("reset role");
  const t = await scalar(
    "select t.public_code from tickets t join quote_requests q on q.id=t.request_id where q.public_code=$1",
    [q.code],
  );
  await as("agentA");
  await denied(() => rpc("central_context", { p_code: t }));
  assert.equal(
    await scalar("select count(*)::int from tickets where public_code=$1", [t]),
    0,
  );
  const qs = await rpc("central_queue", { p_org: orgs.A, p_view: "all" });
  assert.ok(!qs.tickets.some((x) => x.code === t));
});
await test("07 Compartilhado não altera preço por calculadora nem endpoint legado", async () => {
  const { q } = await review();
  await as("agentA");
  await denied(() =>
    rpc("operations_quote_calculate", {
      p_org: orgs.A,
      p_code: q.code,
      p_items: [line()],
      p_discount: discount,
    }),
  );
  await denied(() =>
    rpc("operations_send_reviewed_quote", {
      p_org: orgs.A,
      p_code: q.code,
      p_items: [{ name: "Teste indevido", quantity: 1, unit_cents: 1 }],
      p_duration: 45,
      p_expires: expiry(),
      p_expected_revision: 2,
      p_explanation: "Preço indevido",
      p_key: randomUUID(),
    }),
  );
});
await test("08 ADM e funcionário próprio autorizado montam proposta com grants", async () => {
  const { q } = await review();
  await grantWorker(quoteGrants);
  const { r } = await proposal(q, [line()], discount, "worker");
  assert.equal(r.total_cents, 12000);
  await as("alice");
  assert.match(
    (await ctx(q.code)).versions[0].items[0].name,
    /Serviço 041 fictício/,
  );
});
await test("09 Revogação de grant de orçamento impede próxima ação na mesma sessão", async () => {
  const { q } = await review();
  await grantWorker(quoteGrants);
  await as("worker");
  await rpc("operations_quote_calculate", {
    p_org: orgs.A,
    p_code: q.code,
    p_items: [line()],
    p_discount: discount,
  });
  await grantWorker(["quotes.read", "quotes.values"]);
  await as("worker");
  await denied(() =>
    rpc("operations_quote_calculate", {
      p_org: orgs.A,
      p_code: q.code,
      p_items: [line()],
      p_discount: discount,
    }),
  );
});
await test("10 Horário pretendido não ocupa agenda antes de aprovar", async () => {
  const { q, start } = await review();
  const d = await ctx(q.code);
  assert.equal(new Date(d.desired_start).getTime(), new Date(start).getTime());
  assert.equal(d.appointments.length, 0);
  assert.equal(d.booking.ready, false);
});
await test("11 Aprovação reserva horário desejado atomicamente com duração final", async () => {
  const { q, start } = await review();
  const { r } = await proposal(q, [line({ duration_minutes: 90 })]);
  const result = await approve(q, r);
  assert.equal(result.booking_state, "confirmed");
  const d = await ctx(q.code);
  assert.equal(d.accepted_version, r.code);
  assert.equal(
    new Date(d.appointments[0].starts_at).getTime(),
    new Date(start).getTime(),
  );
  assert.equal(
    (new Date(d.appointments[0].ends_at) - new Date(start)) / 60000,
    90,
  );
});
await test("12 Horário ocupado mantém proposta aprovada e permite novo horário", async () => {
  const { q, start } = await review();
  const { r } = await proposal(q);
  await block(start);
  const result = await approve(q, r);
  assert.equal(result.booking_state, "choose_another_time");
  const d = await ctx(q.code);
  assert.equal(d.state, "approved");
  assert.equal(d.appointments.length, 0);
  const ss = await rpc("consumer_request_slots", {
    p_code: q.code,
    p_day: tomorrow(),
  });
  assert.ok(ss.length);
  await rpc("consumer_book", {
    p_code: q.code,
    p_start: ss[0],
    p_previous: null,
    p_key: randomUUID(),
  });
  assert.equal(
    (await ctx(q.code)).versions.filter((v) => v.kind === "final").length,
    1,
  );
});
await test("13 Duração final maior que janela disponível pede nova escolha", async () => {
  const { q, start } = await review();
  const { r } = await proposal(q, [line({ duration_minutes: 120 })]);
  await block(new Date(new Date(start).getTime() + 60 * 60000).toISOString());
  assert.equal((await approve(q, r)).booking_state, "choose_another_time");
  assert.equal((await ctx(q.code)).state, "approved");
});
await test("14 Multisserviço determinístico mantém pedido único e soma duração", async () => {
  const { p, s } = await setup();
  const other = p.services.find((x) => x.code !== s.code && x.direct_booking),
    items = [empty(s), empty(other)],
    q = await draft(p, items);
  await complete(q, (await slots(p, items))[0]);
  const d = await ctx(q.code);
  assert.equal(d.requested_items.length, 2);
  assert.equal(d.appointments.length, 1);
  assert.equal(
    (new Date(d.appointments[0].ends_at) -
      new Date(d.appointments[0].starts_at)) /
      60000,
    s.duration_minutes + other.duration_minutes,
  );
});
await test("15 Multisserviço misto segue inteiro para empresa, com um ticket", async () => {
  const { p, s } = await setup();
  const variable = p.services.find((x) => x.price_mode === "quote"),
    items = [empty(s), empty(variable)],
    q = await draft(p, items);
  await complete(q, (await slots(p, items))[0]);
  const d = await ctx(q.code);
  assert.equal(d.journey, "review");
  assert.equal(d.requested_items.length, 2);
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*)::int from tickets where request_id=(select id from quote_requests where public_code=$1)",
      [q.code],
    ),
    1,
  );
});
await test("16 Foto obrigatória exige anexo privado do serviço correto; opcionais e recomendadas não bloqueiam", async () => {
  for (const policy of ["optional", "recommended", "required"]) {
    const { p, s } = await setup({
        mode: "quote",
        contract: "evaluation",
        photos: policy,
      }),
      items = [empty(s)],
      q = await draft(p, items),
      start = (await slots(p, items))[0];
    if (policy === "required") {
      await denied(() => complete(q, start), /required_service_photos/);
      const f = await rpc("consumer_reserve_item_attachment", {
        p_code: q.code,
        p_service: s.code,
        p_mime: "image/png",
        p_size: 120,
        p_key: randomUUID(),
      });
      await db.exec("reset role;set local role service_role");
      await rpc("consumer_finalize_attachment", {
        p_code: f.code,
        p_user: users.alice,
        p_sha256: "a".repeat(64),
        p_size: 120,
        p_width: 20,
        p_height: 20,
      });
      await complete(q, start, 1);
    } else await complete(q, start);
  }
});
await test("17 Empresa pede foto; consumidor envia pelo acompanhamento sem tornar arquivo público", async () => {
  const { q, s } = await review();
  await as("adminA");
  const d = await ctx(q.code);
  await rpc("operations_request_photos", {
    p_org: orgs.A,
    p_code: q.code,
    p_instruction: "Envie uma foto aproximada da superfície.",
    p_revision: d.revision,
    p_key: randomUUID(),
  });
  await as("alice");
  assert.match((await ctx(q.code)).photo_request, /superfície/);
  const f = await rpc("consumer_reserve_item_attachment", {
    p_code: q.code,
    p_service: s.code,
    p_mime: "image/png",
    p_size: 120,
    p_key: randomUUID(),
  });
  await db.exec("reset role;set local role service_role");
  await rpc("consumer_finalize_attachment", {
    p_code: f.code,
    p_user: users.alice,
    p_sha256: "b".repeat(64),
    p_size: 120,
    p_width: 20,
    p_height: 20,
  });
  await as("bob");
  await denied(() => rpc("consumer_attachment_ticket", { p_code: f.code }));
  await as("alice");
  assert.equal((await ctx(q.code)).attachments.length, 1);
});
await test("18 Dúvida contextual cria somente rascunho e ticket, sem proposta ou reserva", async () => {
  const { p, s } = await setup();
  await as("alice");
  const r = await rpc("consumer_start_help", {
    p_slug: p.slug,
    p_revision: p.revision,
    p_items: [empty(s)],
    p_customer: customer,
    p_stage: "details",
    p_key: randomUUID(),
  });
  await rpc("central_consumer_send", {
    p_request: r.code,
    p_body: "Uma dúvida sobre este serviço.",
    p_key: randomUUID(),
  });
  const d = await ctx(r.code);
  assert.equal(d.state, "draft");
  assert.equal(d.help_only, true);
  assert.equal(d.versions.length, 0);
  assert.equal(d.appointments.length, 0);
  const draft = await rpc("consumer_draft_context", { p_code: r.code });
  assert.equal(draft.stage, "details");
  assert.equal(draft.items[0].service, s.code);
});
await test("19 Continuar após ajuda reutiliza solicitação, oportunidade e ticket", async () => {
  const { p, s } = await setup();
  await as("alice");
  const items = [empty(s)],
    r = await rpc("consumer_start_help", {
      p_slug: p.slug,
      p_revision: p.revision,
      p_items: items,
      p_customer: customer,
      p_stage: "details",
      p_key: randomUUID(),
    });
  await rpc("consumer_prepare_help_request", {
    p_code: r.code,
    p_items: items,
    p_notes: "Mesma jornada",
    p_contact: false,
    p_expected_cents: 10000,
    p_key: randomUUID(),
  });
  await complete(r, (await slots(p, items))[0]);
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*)::int from tickets where request_id=(select id from quote_requests where public_code=$1)",
      [r.code],
    ),
    1,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from opportunities where id=(select opportunity_id from quote_requests where public_code=$1)",
      [r.code],
    ),
    1,
  );
  await as("alice");
  assert.equal((await ctx(r.code)).versions.length, 1);
});
await test("20 Calculadora: original, catálogo, adicional, item manual e desconto", async () => {
  const { q, id } = await review();
  await as("adminA");
  const addon = await save("A", "addon", {
    service_id: id,
    name: "Adicional real",
    price_mode: "fixed",
    price_cents: 1000,
    duration_minutes: 15,
  });
  const catalog = await rpc("operations_quote_catalog", { p_org: orgs.A });
  const a = catalog.addons.find((a) => a.name === "Adicional real");
  const s = catalog.services.find((s) => s.price_mode === "fixed");
  const items = [
    line(),
    line({
      kind: "manual",
      position: undefined,
      name: "Complemento pontual",
      unit_cents: 2000,
      duration_minutes: 10,
    }),
    line({
      kind: "addon",
      position: undefined,
      code: a.code,
      unit_cents: 1000,
      duration_minutes: 15,
    }),
    line({
      kind: "service",
      position: undefined,
      code: s.code,
      unit_cents: s.price_cents,
      duration_minutes: s.duration_minutes,
    }),
  ];
  const d = await rpc("operations_quote_calculate", {
    p_org: orgs.A,
    p_code: q.code,
    p_items: items,
    p_discount: { mode: "percent", value: 10 },
  });
  assert.equal(d.total_cents, Math.floor((15000 + s.price_cents) * 0.9));
  assert.equal(d.duration_minutes, 85 + s.duration_minutes);
  const { r } = await proposal(q, items, { mode: "percent", value: 10 });
  await as("alice");
  const v = (await ctx(q.code)).versions[0];
  assert.equal(v.total_cents, d.total_cents);
  assert.equal(v.discount_cents, d.discount_cents);
  assert.equal(v.items.length, 4);
});
await test("21 Desconto global em reais e por item são somados e auditados", async () => {
  const { q } = await review();
  const { r } = await proposal(q, [line({ discount_cents: 1000 })], {
    mode: "amount",
    value: 500,
  });
  assert.equal(r.total_cents, 10500);
  await db.exec("reset role");
  assert.ok(
    await scalar(
      "select count(*)::int from audit_logs where organization_id=$1 and entity_table='quote_versions'",
      [orgs.A],
    ),
  );
});
await test("22 Desconto além da autonomia, negativo, decimal inválido e total negativo são negados", async () => {
  const { q } = await review();
  await grantWorker(quoteGrants);
  await as("worker");
  await denied(
    () =>
      rpc("operations_quote_calculate", {
        p_org: orgs.A,
        p_code: q.code,
        p_items: [line()],
        p_discount: { mode: "percent", value: 11 },
      }),
    /discount_denied/,
  );
  await as("adminA");
  for (const patch of [
    { unit_cents: -1 },
    { unit_cents: 1.4 },
    { quantity: 0 },
    { discount_cents: 999999 },
    { unit_cents: null },
  ])
    await denied(() =>
      rpc("operations_quote_calculate", {
        p_org: orgs.A,
        p_code: q.code,
        p_items: [line(patch)],
        p_discount: discount,
      }),
    );
  await denied(() =>
    rpc("operations_quote_calculate", {
      p_org: orgs.A,
      p_code: q.code,
      p_items: [line()],
      p_discount: { mode: "amount", value: 999999 },
    }),
  );
});
await test("23 Prévia não cria versão, e envio recalcula no servidor", async () => {
  const { q } = await review();
  await as("adminA");
  const a = {
    p_org: orgs.A,
    p_code: q.code,
    p_items: [line()],
    p_discount: discount,
  };
  await rpc("operations_quote_calculate", a);
  assert.equal((await ctx(q.code)).versions.length, 1);
  await denied(
    () =>
      rpc("operations_quote_calculate", {
        ...a,
        p_items: [{ ...line(), total_cents: 1 }],
      }),
    /invalid_company_fields/,
  );
});
await test("24 Versões enviadas são imutáveis; recusa e nova proposta conservam original", async () => {
  const { q } = await review();
  const orig = (await ctx(q.code)).requested_items;
  const first = await proposal(q);
  await as("alice");
  await rpc("consumer_decline_quote", {
    p_code: q.code,
    p_version: first.r.code,
    p_key: randomUUID(),
  });
  const next = await proposal(q, [line({ unit_cents: 11000 })]);
  await as("alice");
  await denied(() => approve(q, first.r), /quote_version_invalid/);
  const d = await ctx(q.code);
  assert.deepEqual(d.requested_items, orig);
  assert.equal(d.versions.length, 3);
  await db.exec("reset role");
  await denied(
    () =>
      db.query("update quote_versions set total_cents=1 where public_code=$1", [
        next.r.code,
      ]),
    /immutable/,
  );
});
await test("25 Isolamento A/B em cálculo, serviços, fotos, rascunho e leitura", async () => {
  const { q } = await review();
  await as("adminB");
  await denied(() =>
    rpc("operations_quote_calculate", {
      p_org: orgs.B,
      p_code: q.code,
      p_items: [line()],
      p_discount: discount,
    }),
  );
  await denied(() =>
    rpc("operations_request_photos", {
      p_org: orgs.B,
      p_code: q.code,
      p_instruction: "Tentativa B",
      p_revision: 2,
      p_key: randomUUID(),
    }),
  );
  await as("bob");
  await denied(() => ctx(q.code));
  await denied(() => rpc("consumer_draft_context", { p_code: q.code }));
});
await test("26 Reserva atômica: conflito reverte envio e repetição não duplica appointment", async () => {
  const { p, s } = await setup(),
    items = [empty(s)],
    q = await draft(p, items),
    start = (await slots(p, items))[0];
  await block(start);
  await denied(() => complete(q, start), /slot_unavailable/);
  assert.equal((await ctx(q.code)).state, "draft");
  const ss = await slots(p, items),
    key = randomUUID();
  const a = await complete(q, ss[0], 0, key),
    b = await complete(q, ss[0], 0, key);
  assert.deepEqual(a, b);
  assert.equal((await ctx(q.code)).appointments.length, 1);
});
await test("27 Agenda: remarcação e cancelamento mantêm histórico", async () => {
  const { p, s } = await setup(),
    items = [empty(s)],
    q = await draft(p, items);
  const a = await complete(q, (await slots(p, items))[0]);
  const ss = await rpc("consumer_request_slots", {
    p_code: q.code,
    p_day: tomorrow(),
  });
  await rpc("consumer_book", {
    p_code: q.code,
    p_start: ss.at(-1),
    p_previous: a.booking.code,
    p_key: randomUUID(),
  });
  await rpc("consumer_cancel_booking", {
    p_code: q.code,
    p_appointment: a.booking.code,
    p_key: randomUUID(),
  });
  const d = await ctx(q.code);
  assert.equal(d.appointments[0].state, "cancelled");
  assert.ok(d.events.some((e) => e.event === "rescheduled"));
  assert.ok(d.events.some((e) => e.event === "cancelled"));
});
await test("28 Perguntas condicionais, instrução, texto longo, quantidade e foto usam modelo existente", async () => {
  const { id, s: initial } = await setup({ mode: "quote" });
  await as("adminA");
  const parent = await save("A", "field", {
    service_id: id,
    label: "Há marcas?",
    kind: "boolean",
    required: true,
  });
  await save("A", "field", {
    service_id: id,
    label: "Onde estão?",
    kind: "text",
    required: true,
    multiline: true,
    instruction: "Descreva a região.",
    condition_field: parent,
    condition_value: true,
  });
  await save("A", "field", {
    service_id: id,
    label: "Fotografe as marcas",
    kind: "photo",
    required: false,
    condition_field: parent,
    condition_value: true,
  });
  const p = await publish(),
    s = p.services.find((s) => s.code === initial.code),
    items = [empty(s)];
  await draft(p, items);
  items[0].answers[s.questions.find((f) => f.label === "Há marcas?").code] =
    true;
  await denied(() => draft(p, items), /required_answer/);
  items[0].answers[s.questions.find((f) => f.label === "Onde estão?").code] =
    "Na lateral";
  await draft(p, items);
  assert.equal(
    s.questions.find((f) => f.label === "Onde estão?").multiline,
    true,
  );
});
await test("29 Rascunho publicado e seleção antiga não aceitam preço ou catálogo obsoleto", async () => {
  const { p, s, id } = await setup(),
    items = [empty(s)],
    q = await draft(p, items);
  await as("adminA");
  await save("A", "service", { price_cents: 20000 }, id);
  await publish();
  await denied(() => slots(p, items), /published_price_changed/);
  await denied(
    () => complete(q, new Date(Date.now() + 3 * 86400000).toISOString()),
    /published_price_changed/,
  );
});
await test("30 Roteamento não concede permissão a responsável pelo ticket", async () => {
  const { q } = await review();
  await grantWorker(centralGrants);
  await as("worker");
  await denied(() =>
    rpc("operations_quote_calculate", {
      p_org: orgs.A,
      p_code: q.code,
      p_items: [line()],
      p_discount: discount,
    }),
  );
});
await test("31 Helpers privados novos não são RPCs e grants de tabelas continuam restritos", async () => {
  await db.exec("reset role");
  const functions = (
    await db.query(
      "select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'and p.proname like 'journey_%'and p.proname<>'journey_ticket_visible'",
    )
  ).rows;
  for (const f of functions)
    assert.equal(
      await scalar(
        "select has_function_privilege('authenticated',$1,'EXECUTE')",
        [f.sig],
      ),
      false,
    );
  await as("alice");
  await denied(
    () => db.exec("update quote_requests set journey='direct'"),
    /permission denied/,
  );
});
await test("32 Teto de desconto também bloqueia reduzir arbitrariamente item de catálogo fixo", async () => {
  const { q } = await review();
  await as("adminA");
  const cat = await rpc("operations_quote_catalog", { p_org: orgs.A });
  const s = cat.services.find((s) => s.price_mode === "fixed");
  await grantWorker(quoteGrants);
  await as("worker");
  await denied(
    () =>
      rpc("operations_quote_calculate", {
        p_org: orgs.A,
        p_code: q.code,
        p_items: [
          line({
            kind: "service",
            position: undefined,
            code: s.code,
            unit_cents: 1,
            duration_minutes: s.duration_minutes,
          }),
        ],
        p_discount: discount,
      }),
    /discount_denied/,
  );
});
await test("33 Endpoint legado não contorna fotos obrigatórias e anexo de outro serviço não satisfaz", async () => {
  const { p, s } = await setup({ photos: "required", mode: "quote" });
  const items = [empty(s)],
    q = await draft(p, items);
  await denied(
    () =>
      rpc("consumer_submit_request", {
        p_code: q.code,
        p_attachment_count: 0,
        p_key: randomUUID(),
      }),
    /required_service_photos/,
  );
  await denied(
    () =>
      rpc("consumer_reserve_item_attachment", {
        p_code: q.code,
        p_service: p.services.find((x) => x.code !== s.code).code,
        p_mime: "image/png",
        p_size: 120,
        p_key: randomUUID(),
      }),
    /attachment_service_invalid/,
  );
});
await test("34 Publicação preserva política e rascunho não altera jornada já publicada", async () => {
  const { p, s, id } = await setup({ photos: "optional" });
  await as("adminA");
  await save(
    "A",
    "service",
    { contract_mode: "evaluation", photo_policy: "required" },
    id,
  );
  const live = await rpc("consumer_public_page", { p_slug: p.slug }),
    published = live.services.find((x) => x.code === s.code);
  assert.equal(published.contract_mode, "immediate");
  assert.equal(published.photo_policy, "optional");
});
await test("35 Ajuda mantém idempotência, contexto e não revela rascunho a outro consumidor", async () => {
  const { p, s } = await setup();
  await as("alice");
  const args = {
    p_slug: p.slug,
    p_revision: p.revision,
    p_items: [empty(s)],
    p_customer: customer,
    p_stage: "services",
    p_key: randomUUID(),
  };
  const a = await rpc("consumer_start_help", args);
  assert.deepEqual(await rpc("consumer_start_help", args), a);
  await as("bob");
  await denied(() => rpc("consumer_draft_context", { p_code: a.code }));
  await as("alice");
  const d = await rpc("consumer_draft_context", { p_code: a.code });
  assert.equal(d.stage, "services");
});
await writeFile(
  "reports/syzia-041/sql.json",
  JSON.stringify(
    {
      engine: "PGlite local + Auth fixture, no external homologation",
      tablesPreserved: Object.keys(before).length,
      results,
    },
    null,
    2,
  ),
);
await db.close();
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
