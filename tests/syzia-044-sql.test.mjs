import * as h from "./support/current-db.mjs";
import { writeFile } from "node:fs/promises";
const {
  db,
  as,
  scalar,
  rpc,
  orgs,
  randomUUID,
  assert,
  denied,
  review,
  proposal,
  approve,
  block,
  divided,
  completePlan,
  records,
  setup,
  empty,
  draft,
  slots,
  complete,
  ctx,
} = h;
const results = [];
async function test(id, name, fn) {
  await db.exec("begin");
  h.resetTrace();
  try {
    const evidence = await fn();
    results.push({ id, name, status: "PASS", evidence, steps: h.getTrace() });
    console.log("PASS", id, name);
  } catch (e) {
    results.push({
      id,
      name,
      status: "FAIL",
      error: e.message,
      where: e.where,
      steps: h.getTrace(),
    });
    console.error("FAIL", id, name, e.message, e.where || "");
  } finally {
    await db.exec("rollback;reset role");
  }
}
const plus = (s, days = 1, minutes = 0) =>
  new Date(Date.parse(s) + days * 86400000 + minutes * 60000).toISOString();
async function qid(q) {
  await db.exec("reset role");
  return scalar("select id from quote_requests where public_code=$1", [q.code]);
}
async function schedule(q, start, extra = {}) {
  const id = await qid(q);
  await as("adminA");
  return rpc("operations_schedule", {
    p_org: orgs.A,
    p_request: id,
    p_start: start,
    p_duration: 45,
    p_note: "Fixture 044",
    p_key: randomUUID(),
    ...extra,
  });
}
async function config(buffer, extra = {}) {
  await as("adminA");
  const c = await rpc("consumer_admin_context", { p_org: orgs.A });
  return rpc("consumer_schedule_config", {
    p_org: orgs.A,
    p_expected_revision: c.schedule.revision,
    p_rules: {
      active: true,
      lead_minutes: 0,
      horizon_days: 25,
      step_minutes: 30,
      buffer_minutes: buffer,
      cancel_minutes: 0,
      ...extra,
    },
  });
}
async function move(a, start) {
  await as("adminA");
  return rpc("operations_appointment_act", {
    p_org: orgs.A,
    p_id: a.id,
    p_revision: a.revision,
    p_action: "reschedule",
    p_data: { start },
    p_key: randomUUID(),
  });
}
async function booked(opts = {}) {
  const x = await divided(opts);
  await completePlan(x);
  return { ...x, rows: await records(x.q) };
}
async function manual(source = "whatsapp") {
  const { p, s } = await setup({
    mode: "quote",
    contract: "evaluation",
    duration: 45,
  });
  await as("adminA");
  const customer = await rpc("operations_customer", {
    p_org: orgs.A,
    p_data: {
      name: "Cliente manual fictício",
      whatsapp: "81999990001",
      email: "manual@example.invalid",
      accepted_notice: true,
      contact: false,
    },
    p_key: randomUUID(),
  });
  const q = await rpc("operations_request", {
    p_org: orgs.A,
    p_customer: customer,
    p_service: s.code,
    p_addons: [],
    p_answers: empty(s).answers,
    p_notes: "Agendamento independente",
    p_source: source,
    p_key: randomUUID(),
  });
  const start = (await slots(p, [empty(s)]))[0];
  return { q, start };
}
for (const state of ["absent", "sent", "declined"])
  await test(
    "A1-" + state,
    "Pedido público " + state + " exige aprovação",
    async () => {
      const { q, start } = await review();
      if (state !== "absent") {
        const v = await proposal(q);
        if (state === "declined") {
          await as("alice");
          await rpc("consumer_decline_quote", {
            p_code: q.code,
            p_version: v.r.code,
            p_key: randomUUID(),
          });
        }
      }
      const id = await qid(q);
      const before = await scalar(
        "select stage from opportunities where id=(select opportunity_id from quote_requests where id=$1)",
        [id],
      );
      const e = await denied(
        () => schedule(q, start),
        /^booking_requires_approved_quote$/,
      );
      assert.equal(e.code, "22023");
      assert.equal((await records(q)).length, 0);
      assert.equal(
        await scalar(
          "select stage from opportunities where id=(select opportunity_id from quote_requests where id=$1)",
          [id],
        ),
        before,
      );
      return e;
    },
  );
await test(
  "A1-approved",
  "Aprovação permite reserva; conflito mantém aprovação sem pagamento",
  async () => {
    const { q, start } = await review();
    const v = await proposal(q);
    await block(start, 90);
    const approved = await approve(q, v.r);
    await as("alice");
    assert.equal((await ctx(q.code)).state, "approved");
    await denied(
      () => schedule(q, start, { p_duration: 60 }),
      /slot_unavailable/,
    );
    const a = await schedule(q, plus(start, 2), { p_duration: 60 });
    assert.equal(a.state, "confirmed");
    assert.equal(a.service_minutes, 60);
    assert.equal(a.buffer_minutes, 0);
    return { approved, appointment: a.id };
  },
);
await test(
  "A1-direct",
  "Contratação direta dispensa proposta e replay não duplica",
  async () => {
    const { p, s } = await setup();
    const items = [empty(s)],
      q = await draft(p, items),
      start = (await slots(p, items))[0],
      key = randomUUID();
    await complete(q, start, 0, key);
    await complete(q, start, 0, key);
    assert.equal((await records(q)).length, 1);
    await as("alice");
    assert.equal((await ctx(q.code)).accepted_version, null);
  },
);
for (const source of ["whatsapp", "direct", "referral", "other"])
  await test(
    "A1-manual-" + source,
    "Manual legítimo " + source + " preservado",
    async () => {
      const { q, start } = await manual(source);
      const key = randomUUID(),
        a = await schedule(q, start, { p_key: key });
      const again = await schedule(q, start, { p_key: key });
      assert.equal(again.id, a.id);
      await denied(() => schedule(q, plus(start)), /booking_already_exists/);
      assert.equal((await records(q)).length, 1);
      return {
        source,
        service_minutes: a.service_minutes,
        buffer: a.buffer_minutes,
      };
    },
  );
await test(
  "A1-origin",
  "Origem editável não converte pedido público em manual",
  async () => {
    const { q, start } = await review(),
      id = await qid(q);
    await db.query(
      "update opportunity_context set source='whatsapp' where opportunity_id=(select opportunity_id from quote_requests where id=$1)",
      [id],
    );
    await denied(() => schedule(q, start), /booking_requires_approved_quote/);
  },
);
await test(
  "A1-legacy",
  "Wrapper privada legada e motor não contornam aprovação",
  async () => {
    const { q, start } = await review(),
      id = await qid(q);
    await as("adminA");
    await denied(
      () =>
        db.query("select private.v029_operations_schedule($1,$2,$3,45,'',$4)", [
          orgs.A,
          id,
          start,
          randomUUID(),
        ]),
      /permission denied/,
    );
    await db.exec("reset role");
    await denied(
      () =>
        db.query("select private.v029_operations_schedule($1,$2,$3,45,'',$4)", [
          orgs.A,
          id,
          start,
          randomUUID(),
        ]),
      /booking_requires_approved_quote/,
    );
    await denied(
      () =>
        db.query("select private.central_book_core($1,$2,null,$3)", [
          q.code,
          start,
          randomUUID(),
        ]),
      /booking_requires_approved_quote/,
    );
  },
);
await test(
  "A1-boundary",
  "Fronteira de escrita bloqueia reserva pública sem aprovação",
  async () => {
    const { q, start } = await review(),
      id = await qid(q);
    await denied(
      () =>
        db.query(
          "insert into appointments(organization_id,resource_id,kind,request_id,customer_id,starts_at,ends_at,service_minutes)select q.organization_id,s.id,'booking',q.id,q.customer_id,$2::timestamptz,$2::timestamptz+interval '45 minutes',45 from quote_requests q join schedule_resources s on s.organization_id=q.organization_id where q.id=$1",
          [id, start],
        ),
      /booking_requires_approved_quote/,
    );
  },
);
await test(
  "A1-tenant",
  "Empresa B não agenda pedido A; grant revogado não reserva",
  async () => {
    const { q, start } = await review(),
      id = await qid(q);
    await as("adminB");
    await denied(
      () =>
        rpc("operations_schedule", {
          p_org: orgs.B,
          p_request: id,
          p_start: start,
          p_duration: 45,
          p_note: "",
          p_key: randomUUID(),
        }),
      /denied/,
    );
    await as("worker");
    await denied(
      () =>
        rpc("operations_schedule", {
          p_org: orgs.A,
          p_request: id,
          p_start: start,
          p_duration: 45,
          p_note: "",
          p_key: randomUUID(),
        }),
      /denied/,
    );
  },
);
await test(
  "A2-history",
  "Alterar configuração não altera reserva, revisão ou duração históricas",
  async () => {
    const x = await booked();
    await config(30);
    assert.deepEqual(await records(x.q), x.rows);
  },
);
for (const [before, after] of [
  [0, 30],
  [30, 0],
])
  await test(
    "A2-buffer-" + before + "-" + after,
    "Remarcação usa buffer vigente " + before + "→" + after,
    async () => {
      const x = await booked({ buffer: before }),
        a = x.rows.at(-1);
      await config(after);
      const m = await move(a, plus(a.starts_at, 2));
      assert.equal(m.service_minutes, a.service_minutes);
      assert.equal(m.buffer_minutes, after);
      assert.equal(
        (Date.parse(m.ends_at) - Date.parse(m.starts_at)) / 60000,
        a.service_minutes + after,
      );
      assert.equal((await records(x.q))[0].id, x.rows[0].id);
      return {
        service: m.service_minutes,
        buffer: m.buffer_minutes,
        occupied: (Date.parse(m.ends_at) - Date.parse(m.starts_at)) / 60000,
      };
    },
  );
await test(
  "A2-conflict",
  "Conflito somente no buffer impede e preserva toda reserva",
  async () => {
    const x = await booked(),
      a = x.rows[1],
      start = plus(a.starts_at, 2);
    await config(30);
    await block(plus(start, 0, a.service_minutes + 15), 30);
    await denied(() => move(a, start), /slot_unavailable/);
    assert.deepEqual(await records(x.q), x.rows);
  },
);
for (const [name, rules, target] of [
  ["horizon", { horizon_days: 1 }, (a) => plus(a.starts_at, 3)],
  ["lead", { lead_minutes: 10080 }, (a) => plus(a.starts_at)],
  ["grid", {}, (a) => plus(a.starts_at, 1, 7)],
  ["hours", {}, (a) => plus(a.starts_at, 1, 360)],
])
  await test(
    "A2-" + name,
    "Remarcação revalida " + name + " atomicamente",
    async () => {
      const x = await booked(),
        a = x.rows[1];
      await config(30, rules);
      await denied(() => move(a, target(a)), /slot_unavailable/);
      assert.deepEqual(await records(x.q), x.rows);
    },
  );
await test(
  "A3-second",
  "Parte 2 antes da Parte 1 negada sem mudar histórico",
  async () => {
    const x = await booked();
    await denied(
      () => move(x.rows[1], plus(x.rows[0].starts_at, -1)),
      /^execution_part_order_conflict$/,
    );
    assert.deepEqual(await records(x.q), x.rows);
  },
);
await test("A3-first", "Parte 1 depois da Parte 2 negada", async () => {
  const x = await booked();
  await denied(
    () => move(x.rows[0], plus(x.rows[1].starts_at, 2)),
    /^execution_part_order_conflict$/,
  );
  assert.deepEqual(await records(x.q), x.rows);
});
await test(
  "A3-middle",
  "Parte intermediária respeita ambas as vizinhas",
  async () => {
    const x = await booked({ duration: 1000, max: 4 });
    assert.equal(x.rows.length, 3);
    await denied(
      () => move(x.rows[1], plus(x.rows[0].starts_at, -1)),
      /execution_part_order_conflict/,
    );
    await denied(
      () => move(x.rows[1], plus(x.rows[2].starts_at, 2)),
      /execution_part_order_conflict/,
    );
    assert.deepEqual(await records(x.q), x.rows);
  },
);
await test(
  "A3-valid",
  "Remarcação válida mantém números e ordem no acompanhamento e Agenda",
  async () => {
    const x = await booked();
    const m = await move(x.rows[1], plus(x.rows[1].starts_at, 2));
    assert.equal(m.part_number, 2);
    await as("alice");
    const c = await ctx(x.q.code);
    assert.ok(
      c.appointments.every(
        (a, i, all) =>
          i === 0 || Date.parse(a.starts_at) > Date.parse(all[i - 1].starts_at),
      ),
    );
    await as("adminA");
    const d = await rpc("operations_detail", { p_org: orgs.A, p_id: m.id });
    assert.deepEqual(
      d.periods.map((a) => a.part_number),
      [1, 2],
    );
  },
);
await test(
  "A2A3-replan",
  "Replanejamento usa buffer vigente e preserva substituídos, ordem e cancelamento",
  async () => {
    const x = await booked();
    await config(30);
    await as("alice");
    const o = await rpc("consumer_execution_options", {
        p_code: x.q.code,
        p_day: plus(x.plan.start, 3).slice(0, 10),
        p_next: false,
      }),
      p = o.plans[0];
    assert.ok(p);
    await rpc("consumer_book_execution", {
      p_code: x.q.code,
      p_start: p.start,
      p_previous: x.rows[0].public_code,
      p_periods: p.periods,
      p_key: randomUUID(),
    });
    const rows = await records(x.q);
    assert.ok(rows.every((a) => a.buffer_minutes === 30));
    assert.ok(
      rows.every(
        (a, i) =>
          a.part_number === i + 1 &&
          (i === 0 ||
            Date.parse(a.starts_at) >= Date.parse(rows[i - 1].ends_at)),
      ),
    );
    assert.equal(
      await scalar(
        "select count(*)::int from appointments where request_id=$1 and state='cancelled'",
        [rows[0].request_id],
      ),
      x.rows.length,
    );
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
  },
);
await test(
  "WORKSPACE-no-admin",
  "Super Admin configura empresa sem ADM sem membership e retorna à gestão global",
  async () => {
    await as("root");
    const created = await rpc("access_create_organization", {
      p_name: "Empresa 044 sem ADM",
      p_slug: "sem-adm-" + randomUUID(),
      p_key: randomUUID(),
    });
    const org = created.organization_id;
    await rpc("company_initialize", { p_org: org });
    assert.ok(await rpc("company_context", { p_org: org }));
    assert.ok(await rpc("onboarding_context", { p_org: org }));
    assert.ok((await rpc("access_organizations")).some((o) => o.id === org));
    await db.exec("reset role");
    assert.equal(
      await scalar(
        "select count(*)::int from organization_members where organization_id=$1",
        [org],
      ),
      0,
    );
    await as("adminB");
    await denied(() => rpc("company_context", { p_org: org }), /denied/);
  },
);
await test(
  "SEC-grants",
  "Todas as tabelas preservam RLS/FORCE, DML fechado e novos helpers privados",
  async () => {
    await db.exec("reset role");
    const rows = (
      await db.query(
        "select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') aw,has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') uw from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private')and c.relkind='r'",
      )
    ).rows;
    assert.ok(rows.length > 100);
    for (const r of rows) {
      assert.ok(r.relrowsecurity && r.relforcerowsecurity, r.relname);
      assert.equal(r.aw, false);
      assert.equal(r.uw, false);
    }
    for (const n of [
      "booking_manual_origin(quote_requests)",
      "booking_approval_guard(quote_requests)",
      "booking_write_guard_044()",
      "booking_service_minutes(appointments)",
    ])
      assert.equal(
        await scalar(
          "select has_function_privilege('authenticated',$1,'EXECUTE')",
          ["private." + n],
        ),
        false,
      );
    return { tables: rows.length };
  },
);
await writeFile(
  "reports/syzia-044/focused.json",
  JSON.stringify({ engine: "PGlite local, Auth fixture", results }, null, 2),
);
await db.close();
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
