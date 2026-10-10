import * as h from "./support/current-db.mjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const { db, as, scalar, orgs, users, assert, denied, randomUUID } = h;
if (process.env.SYZIA_TEAM_CURRENT !== "1")
  await db.exec(
    await readFile(
      "supabase/migrations/202610030045_team_availability_assisted.sql",
      "utf8",
    ),
  );
else
  await db.exec(
    "reset role;update private.assisted_policy set active=false,hours='[]';delete from private.assisted_plan_policy",
  );
async function rpc(name, args = {}) {
  const m = (
    await db.query(
      "select proargnames,proargtypes::oid[] types from pg_proc where pronamespace='public'::regnamespace and proname=$1",
      [name],
    )
  ).rows[0];
  assert.ok(m, name);
  return scalar(
    `select public.${name}(${(m.proargnames || []).map((n, i) => `${n}=>$${i + 1}`).join(",")})`,
    (m.proargnames || []).map((n, i) =>
      m.types[i] === 3802 ? JSON.stringify(args[n] ?? null) : (args[n] ?? null),
    ),
  );
}
const results = [];
async function test(name, fn) {
  await db.exec("begin");
  try {
    const evidence = await fn();
    results.push({ name, status: "PASS", evidence });
  } catch (e) {
    results.push({
      name,
      status: "FAIL",
      error: e.message,
      where: e.where,
      stack: e.stack,
    });
  } finally {
    await db.exec("rollback;reset role");
  }
  console.log(results.at(-1).status, name, results.at(-1).error || "");
}
const weekly = (
  parts = [
    ["08:00", "12:00"],
    ["13:00", "17:00"],
  ],
) =>
  Array.from({ length: 7 }, (_, day) =>
    parts.map(([open, close]) => ({ day, open, close })),
  ).flat();
const plus = (s, min) => new Date(Date.parse(s) + min * 60000).toISOString();
async function availability(
  hours = weekly(),
  inherit = false,
  blocks = [],
  user = users.worker,
  org = orgs.A,
) {
  await as("adminA");
  const data = await rpc("employee_availability_context", { p_org: org });
  const m = data.members.find((m) => m.user_id === user);
  return rpc("employee_availability_save", {
    p_org: org,
    p_user: user,
    p_revision: m?.revision || 0,
    p_inherit: inherit,
    p_hours: hours,
    p_blocks: blocks,
  });
}
async function book({ duration = 45, buffer = 0 } = {}) {
  await h.hours({ close: "17:00", buffer });
  const { p, s } = await h.setup({ duration });
  const q = await h.draft(p, [h.empty(s)]);
  const start = (await h.slots(p, [h.empty(s)]))[0];
  await h.complete(q, start);
  return (await h.records(q))[0];
}
async function assign(a, user = users.worker) {
  await as("adminA");
  return rpc("operations_assign_responsible", {
    p_org: orgs.A,
    p_id: a.id,
    p_user: user,
    p_revision: a.revision,
    p_key: randomUUID(),
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
async function policy(active = true, hours = weekly([["00:00", "23:59"]])) {
  await as("root");
  const d = await rpc("assisted_admin_context");
  return rpc("assisted_policy_save", {
    p_revision: d.policy.revision,
    p_active: active,
    p_hours: hours,
    p_timezone: "UTC",
    p_message:
      "Equipe compartilhada fora do horário; sua mensagem ficará registrada.",
  });
}
async function quota(included = 3, warning = 2, org = orgs.A) {
  await as("root");
  const d = await rpc("assisted_admin_context");
  const version = d.companies.find((c) => c.id === org).usage.plan_version_id;
  return rpc("assisted_plan_save", {
    p_version: version,
    p_revision: d.versions.find((v) => v.id === version)?.revision || 0,
    p_included: included,
    p_warning: warning,
  });
}
async function act(code, action, data = {}, actor = "shared") {
  await as(actor);
  const c = await h.rpc("central_context", { p_code: code });
  return h.rpc("central_act", {
    p_code: code,
    p_revision: c.ticket.revision,
    p_action: action,
    p_data: data,
    p_key: randomUUID(),
  });
}
async function usage(org = orgs.A) {
  await as(org === orgs.A ? "adminA" : "adminB");
  return rpc("assisted_company_usage", { p_org: org });
}
async function freshTicket() {
  const { p, s } = await h.setup({ mode: "fixed", contract: "immediate" });
  await h.autonomy(["price_list", "schedule", "reschedule", "cancel"]);
  const q = await h.draft(p, [h.empty(s)]);
  await h.complete(q, (await h.slots(p, [h.empty(s)]))[0]);
  await as("alice");
  await h.rpc("central_consumer_send", {
    p_request: q.code,
    p_body: "Dúvida fictícia sobre o atendimento",
    p_key: randomUUID(),
  });
  const t = await h.rpc("central_consumer_thread", { p_request: q.code });
  return { q, code: t.code };
}
await test("E01 Inheritance by default; aggregate own members excludes global team", async () => {
  await as("adminA");
  const d = await rpc("employee_availability_context", { p_org: orgs.A });
  assert.ok(d.members.find((m) => m.user_id === users.worker).inherit_company);
  assert.ok(!d.members.some((m) => m.user_id === users.shared));
  const a = await book();
  assert.equal((await assign(a)).responsible_id, users.worker);
});
await test("E02 Custom two intervals; appointment fits first interval", async () => {
  await availability();
  assert.ok((await assign(await book())).responsible_id);
});
await test("E03 Day without service denied atomically", async () => {
  const a = await book();
  await availability([]);
  await denied(() => assign(a), /professional_unavailable/);
  await db.exec("reset role");
  assert.equal(
    await scalar("select responsible_id from appointments where id=$1", [a.id]),
    null,
  );
});
await test("E04 Crossing lunch denied; second interval allowed", async () => {
  let a = await book({ duration: 90 });
  await availability();
  a = await assign(a);
  await denied(
    () => move(a, plus(a.starts_at, 210)),
    /professional_unavailable/,
  );
  const r = await move(a, plus(a.starts_at, 300));
  assert.equal(r.responsible_id, users.worker);
});
await test("E05 Duration plus buffer must fit and old reservation preserved", async () => {
  let a = await book({ duration: 45, buffer: 30 });
  await availability(weekly([["08:00", "09:00"]]));
  await denied(() => assign(a), /professional_unavailable/);
  await db.exec("reset role");
  assert.equal(
    new Date(
      await scalar("select ends_at from appointments where id=$1", [a.id]),
    ).getTime(),
    new Date(a.ends_at).getTime(),
  );
});
await test("E06 Company closed dominates employee open; employee closed dominates company open", async () => {
  let a = await book();
  await availability(weekly([["00:00", "23:59"]]));
  a = await assign(a);
  await denied(() => move(a, plus(a.starts_at, 660)), /slot_unavailable/);
  await availability([]);
  await denied(
    () => move(a, plus(a.starts_at, 60)),
    /professional_unavailable/,
  );
});
await test("E07 Existing resource conflict remains and unassigned semantics preserved", async () => {
  const a = await book();
  await h.block(plus(a.starts_at, 120), 60);
  await denied(() => move(a, plus(a.starts_at, 120)), /slot_unavailable/);
  assert.equal((await move(a, plus(a.starts_at, 240))).responsible_id, null);
});
await test("E08 Change availability warns without modifying future appointments", async () => {
  const a = await assign(await book());
  await db.exec("reset role");
  const before = await scalar(
    "select to_jsonb(a) from appointments a where id=$1",
    [a.id],
  );
  const r = await availability([]);
  assert.equal(r.outside_count, 1);
  await db.exec("reset role");
  assert.deepEqual(
    await scalar("select to_jsonb(a) from appointments a where id=$1", [a.id]),
    before,
  );
});
await test("E09 Date full-day block and interval block enforce timezone", async () => {
  const a = await book();
  await as("adminA");
  const d = await rpc("employee_availability_context", { p_org: orgs.A });
  const day = await scalar(
    "select to_char($1::timestamptz at time zone $2,'YYYY-MM-DD')",
    [a.starts_at, d.timezone],
  );
  await availability([], true, [{ date: day, all_day: true }]);
  await denied(() => assign(a), /professional_unavailable/);
  await availability([], true, [
    { date: day, all_day: false, open: "08:30", close: "09:00" },
  ]);
  await denied(() => assign(a), /professional_unavailable/);
});
await test("E10 Swap responsible denied atomically; removal allowed", async () => {
  let a = await assign(await book());
  await availability([], false, [], users.adminA);
  await denied(() => assign(a, users.adminA), /professional_unavailable/);
  await db.exec("reset role");
  assert.equal(
    await scalar("select responsible_id from appointments where id=$1", [a.id]),
    users.worker,
  );
  a = await assign(a, null);
  assert.equal(a.responsible_id, null);
});
await test("E11 Multi-period replan preserves each responsible and fails atomically", async () => {
  const x = await h.divided({ duration: 600, max: 3 });
  await h.completePlan(x);
  let rows = await h.records(x.q);
  for (const a of rows) await assign(a);
  rows = await h.records(x.q);
  await as("adminA");
  const options = await h.rpc("operations_execution_options", {
    p_org: orgs.A,
    p_code: x.q.code,
    p_day: h.tomorrow(),
    p_next: true,
  });
  const plan =
    options.plans.find((p) => p.start !== rows[0].starts_at) ||
    options.plans[0];
  await availability([]);
  await as("adminA");
  await denied(
    () =>
      h.rpc("operations_book_execution", {
        p_org: orgs.A,
        p_code: x.q.code,
        p_start: plan.start,
        p_previous: rows[0].public_code,
        p_revision: rows[0].revision,
        p_periods: plan.periods,
        p_key: randomUUID(),
      }),
    /professional_unavailable/,
  );
  assert.deepEqual(await h.records(x.q), rows);
});
await test("E12 A cannot read B or edit B member; direct private tables denied", async () => {
  await as("adminA");
  await denied(() => rpc("employee_availability_context", { p_org: orgs.B }));
  await denied(
    () =>
      rpc("employee_availability_save", {
        p_org: orgs.A,
        p_user: users.adminB,
        p_revision: 0,
        p_inherit: true,
        p_hours: [],
        p_blocks: [],
      }),
    /denied/,
  );
  await denied(
    () => db.query("select * from private.employee_availability"),
    /permission denied/,
  );
});
await test("E13 No grant, revoked actor and revoked target denied", async () => {
  await as("worker");
  await denied(() => rpc("employee_availability_context", { p_org: orgs.A }));
  await db.exec("reset role");
  await db.query(
    "update organization_members set status='suspended' where organization_id=$1 and user_id=$2",
    [orgs.A, users.worker],
  );
  await denied(() => availability(), /denied/);
  await db.exec("reset role");
  await db.query(
    "update organization_members set status='suspended' where organization_id=$1 and user_id=$2",
    [orgs.A, users.adminA],
  );
  await as("adminA");
  await denied(() => rpc("employee_availability_context", { p_org: orgs.A }));
});
await test("E14 Global identity cannot have company availability; stale edits denied", async () => {
  await denied(() => availability([], true, [], users.shared), /denied/);
  await availability();
  await as("adminA");
  await denied(
    () =>
      rpc("employee_availability_save", {
        p_org: orgs.A,
        p_user: users.worker,
        p_revision: 0,
        p_inherit: true,
        p_hours: [],
        p_blocks: [],
      }),
    /revision/,
  );
});
await test("E15 Overlapping and null intervals rejected server-side", async () => {
  await denied(
    () =>
      availability([
        { day: 1, open: "08:00", close: "12:00" },
        { day: 1, open: "10:00", close: "13:00" },
      ]),
    /invalid/,
  );
  await denied(
    () => availability([{ day: 1, open: null, close: "12:00" }]),
    /invalid/,
  );
});
await test("S01 Defaults unconfigured without invented quota; admin cannot edit global policy", async () => {
  await as("root");
  const d = await rpc("assisted_admin_context");
  assert.equal(d.policy.active, false);
  assert.ok(d.versions.every((v) => v.included === null));
  await as("adminA");
  await denied(() => rpc("assisted_admin_context"));
  await denied(() =>
    rpc("assisted_policy_save", {
      p_revision: 1,
      p_active: true,
      p_hours: weekly(),
      p_timezone: "UTC",
      p_message: "mensagem fora do horario",
    }),
  );
});
await test("S02 Super Admin configures hours/timezone; outside status does not block consumer", async () => {
  await policy(false);
  await as("alice");
  const thread = await h.rpc("central_consumer_thread", {
    p_request: h.legacy.requests.A,
  });
  assert.equal(thread.shared_open, false);
  assert.ok(thread.available && thread.can_send);
  await h.rpc("central_consumer_send", {
    p_request: h.legacy.requests.A,
    p_body: "Mensagem fictícia fora do horário",
    p_key: randomUUID(),
  });
  await denied(() => act(h.legacy.codes.A, "claim"), /assisted_outside_hours/);
  await freshTicket();
});
await test("S03 Claim counts one; five messages do not multiply; returning/reclaim no double count", async () => {
  await policy();
  await quota();
  await act(h.legacy.codes.A, "claim");
  assert.equal((await usage()).used, 1);
  for (let i = 0; i < 5; i++)
    await act(h.legacy.codes.A, "message", { body: "Mensagem fictícia " + i });
  assert.equal((await usage()).used, 1);
  await act(h.legacy.codes.A, "return");
  await act(h.legacy.codes.A, "claim");
  assert.equal((await usage()).used, 1);
});
await test("S04 Warning/exhaustion restrict only new shared tickets; existing/company continue", async () => {
  await policy();
  await quota(2, 1);
  await act(h.legacy.codes.A, "claim");
  assert.equal((await usage()).state, "warning");
  const t = await freshTicket();
  await act(t.code, "claim");
  assert.equal((await usage()).state, "exhausted");
  const third = await freshTicket();
  await denied(() => act(third.code, "claim"), /assisted_limit_reached/);
  await act(h.legacy.codes.A, "message", { body: "Continuidade fictícia" });
  await as("adminA");
  await h.rpc("central_presence", { p_state: "available" });
  await act(third.code, "claim", {}, "adminA");
  await act(
    third.code,
    "message",
    { body: "Empresa segue atendendo" },
    "adminA",
  );
  assert.equal((await usage()).used, 2);
  await as("alice");
  await h.rpc("central_consumer_send", {
    p_request: third.q.code,
    p_body: "Consumidor continua",
    p_key: randomUUID(),
  });
});
await test("S05 Usage per company, tenant isolation and audit; no automatic invoice", async () => {
  await policy();
  await quota();
  await db.exec("reset role");
  const invoices = await scalar("select count(*) from billing_invoices");
  await act(h.legacy.codes.A, "claim");
  assert.equal((await usage(orgs.B)).used, 0);
  await as("adminA");
  await denied(() => rpc("assisted_company_usage", { p_org: orgs.B }));
  await as("root");
  const d = await rpc("assisted_admin_context");
  assert.equal(d.consumption.length, 1);
  assert.ok(d.audit.some((a) => a.entity_table === "assisted_consumption"));
  assert.equal(await scalar("select count(*) from billing_invoices"), invoices);
});
await test("S06 Explicit provider-neutral cycle, idempotence and overlap rejection", async () => {
  await policy();
  await quota();
  await as("root");
  const v = (await rpc("assisted_admin_context")).companies.find(
    (c) => c.id === orgs.A,
  ).usage.plan_version_id;
  const now = Date.now();
  const args = {
    p_org: orgs.A,
    p_version: v,
    p_start: new Date(now - 86400000).toISOString(),
    p_end: new Date(now + 86400000).toISOString(),
    p_reference: "fixture-cycle-A",
  };
  const id = await rpc("assisted_cycle_start", args);
  assert.equal(await rpc("assisted_cycle_start", args), id);
  await denied(
    () => rpc("assisted_cycle_start", { ...args, p_reference: "other" }),
    /exclusion/,
  );
  await act(h.legacy.codes.A, "claim");
  assert.equal((await usage()).cycle_id, id);
  await as("root");
  await rpc("assisted_cycle_start", {
    ...args,
    p_start: args.p_end,
    p_end: new Date(now + 2 * 86400000).toISOString(),
    p_reference: "next",
  });
  assert.equal((await usage()).used, 1);
});
await test("S07 Downgrade preserves consumption history and denies global staff", async () => {
  await policy();
  await quota();
  await act(h.legacy.codes.A, "claim");
  await db.exec("reset role");
  await db.query(
    "update billing_subscriptions set state='suspended' where organization_id=$1",
    [orgs.A],
  );
  await as("root");
  const d = await rpc("assisted_admin_context");
  assert.equal(d.consumption.length, 1);
  assert.equal(d.companies.find((c) => c.id === orgs.A).usage.eligible, false);
  await denied(() =>
    act(h.legacy.codes.A, "message", { body: "Tentativa fictícia" }),
  );
});
await test("S08 Exhausted unconfigured quota cannot be bypassed through transfer or direct RPC", async () => {
  await policy();
  await quota(0, 0);
  await denied(() => act(h.legacy.codes.A, "claim"), /assisted_limit_reached/);
  await as("adminA");
  await h.rpc("central_presence", { p_state: "available" });
  await act(h.legacy.codes.A, "claim", {}, "adminA");
  await denied(
    () =>
      act(h.legacy.codes.A, "transfer", { user_id: users.shared }, "adminA"),
    /assisted_limit_reached/,
  );
  await quota(null, null);
  await denied(
    () =>
      act(h.legacy.codes.A, "transfer", { user_id: users.shared }, "adminA"),
    /assisted_unconfigured/,
  );
});
await test("E16 Positive multi-period replan preserves assignments and planner filters closed employee", async () => {
  const x = await h.divided({ duration: 600, max: 3 });
  await h.completePlan(x);
  let rows = await h.records(x.q);
  for (const a of rows) await assign(a);
  rows = await h.records(x.q);
  await as("adminA");
  const opts = await h.rpc("operations_execution_options", {
    p_org: orgs.A,
    p_code: x.q.code,
    p_day: plus(rows[0].starts_at, 1440).slice(0, 10),
    p_next: false,
  });
  assert.ok(opts.plans.length);
  const plan = opts.plans[0];
  await h.rpc("operations_book_execution", {
    p_org: orgs.A,
    p_code: x.q.code,
    p_start: plan.start,
    p_previous: rows[0].public_code,
    p_revision: rows[0].revision,
    p_periods: plan.periods,
    p_key: randomUUID(),
  });
  rows = await h.records(x.q);
  assert.ok(rows.every((a) => a.responsible_id === users.worker));
  await availability([]);
  await as("adminA");
  const none = await h.rpc("operations_execution_options", {
    p_org: orgs.A,
    p_code: x.q.code,
    p_day: new Date(rows[0].starts_at).toISOString().slice(0, 10),
    p_next: false,
  });
  assert.equal(none.plans.length, 0);
});
await test("S09 Consumer can reopen an assigned resolved ticket outside hours and at quota", async () => {
  await policy();
  await quota(1, 1);
  await act(h.legacy.codes.A, "claim");
  await act(h.legacy.codes.A, "state", { state: "resolved" });
  await policy(false);
  await as("alice");
  await h.rpc("central_consumer_send", {
    p_request: h.legacy.requests.A,
    p_body: "Nova dúvida fictícia fora do horário",
    p_key: randomUUID(),
  });
  const t = await h.rpc("central_consumer_thread", {
    p_request: h.legacy.requests.A,
  });
  assert.equal(t.shared_open, false);
  assert.ok(t.messages.some((m) => m.body.includes("Nova dúvida fictícia")));
  assert.equal((await usage()).used, 1);
});
await test("S10 Same ticket in a new cycle; old usage immutable and not carried into current count", async () => {
  await policy();
  await quota();
  await as("root");
  const d = await rpc("assisted_admin_context"),
    version = d.companies.find((c) => c.id === orgs.A).usage.plan_version_id;
  const old = await rpc("assisted_cycle_start", {
    p_org: orgs.A,
    p_version: version,
    p_start: new Date(Date.now() - 4 * 86400000).toISOString(),
    p_end: new Date(Date.now() - 3 * 86400000).toISOString(),
    p_reference: "previous-fixture-cycle",
  });
  await db.exec("reset role");
  await db.query(
    "insert into private.assisted_consumption(organization_id,cycle_id,ticket_id,actor_id)select $1,$2,id,$3 from tickets where public_code=$4",
    [orgs.A, old, users.shared, h.legacy.codes.A],
  );
  assert.equal((await usage()).used, 0);
  await act(h.legacy.codes.A, "claim");
  const u = await usage();
  assert.equal(u.used, 1);
  assert.equal(u.history.find((c) => c.id === old).used, 1);
  await db.exec("reset role");
  await denied(
    () =>
      db.query("delete from private.assisted_consumption where cycle_id=$1", [
        old,
      ]),
    /immutable/,
  );
});
await test("S11 Plan without Assistido denies shared activity and keeps history", async () => {
  await policy();
  await quota();
  await act(h.legacy.codes.A, "claim");
  await db.exec("reset role");
  await as("root");
  const plan = await h.rpc("billing_plan_save", {
    p_id: null,
    p_revision: 0,
    p_data: {
      name: "Software fictício 045",
      description: "Somente para regressão local",
      active: true,
      available: false,
      position: 99,
      price_cents: 100,
      interval_months: 1,
      trial_days: 0,
      human_support: false,
      commercial_followups: false,
      member_limit: null,
      service_limit: null,
      request_limit: null,
      ticket_limit: null,
      followup_limit: null,
    },
  });
  await db.exec("reset role");
  const version = await scalar(
    "select id from billing_plan_versions where plan_id=$1 order by version desc limit 1",
    [plan],
  );
  assert.ok(version);
  await db.query(
    "update billing_subscriptions set plan_version_id=$1 where organization_id=$2",
    [version, orgs.A],
  );
  assert.equal((await usage()).eligible, false);
  assert.equal((await usage()).used, 1);
  await denied(() =>
    act(h.legacy.codes.A, "message", {
      body: "Tentativa em plano sem Assistido",
    }),
  );
});
await test("S12 Legacy mixed membership cannot bypass shared quota", async () => {
  await policy();
  await quota(0, 0);
  await h.legacyAccount();
  await denied(() => act(h.legacy.codes.A, "claim"), /assisted_limit_reached/);
});

await test("E17 Same employee cannot overlap reservations in two existing company resources", async () => {
  const a = await assign(await book());
  await as("adminB");
  const qc = await h.rpc("operations_quote_context", {
    p_org: orgs.B,
    p_code: h.legacy.requests.B,
  });
  const v = await h.rpc("operations_send_calculated_quote", {
    p_org: orgs.B,
    p_code: h.legacy.requests.B,
    p_items: [h.line({ duration_minutes: 180 })],
    p_discount: h.discount,
    p_expires: h.expiry(),
    p_expected_revision: qc.revision,
    p_explanation: "Valor fictício revisado pela empresa B.",
    p_key: randomUUID(),
  });
  await as("bob");
  await h.rpc("consumer_approve_quote", {
    p_code: h.legacy.requests.B,
    p_version: v.code,
    p_key: randomUUID(),
  });
  await db.exec("reset role");
  const id = await scalar(
    "select id from quote_requests where public_code=$1",
    [h.legacy.requests.B],
  );
  await as("adminB");
  const b = await h.rpc("operations_schedule", {
    p_org: orgs.B,
    p_request: id,
    p_start: a.starts_at,
    p_duration: 180,
    p_note: "Reserva fictícia B",
    p_key: randomUUID(),
  });
  await denied(
    () =>
      rpc("operations_assign_responsible", {
        p_org: orgs.B,
        p_id: b.id,
        p_user: users.worker,
        p_revision: b.revision,
        p_key: randomUUID(),
      }),
    /professional_conflict/,
  );
  await db.exec("reset role");
  assert.equal(
    await scalar("select responsible_id from appointments where id=$1", [b.id]),
    null,
  );
});

await mkdir("reports/team-availability", { recursive: true });
await writeFile(
  "reports/team-availability/focused.json",
  JSON.stringify({ engine: "PGlite; fictitious fixtures", results }, null, 2),
);
await db.close();
if (results.some((r) => r.status !== "PASS")) process.exitCode = 1;
