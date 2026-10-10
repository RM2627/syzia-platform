import {
  h,
  db,
  as,
  scalar,
  orgs,
  users,
  assert,
  denied,
  randomUUID,
  upgrade,
  rpc,
  policy,
  quota,
  presence,
  nobody,
  usage,
  act,
  ticket,
  freshTicket,
  weekly,
} from "./support/flexible-db.mjs";
import { writeFile, mkdir, readFile } from "node:fs/promises";
await upgrade();
const results = [];
async function test(name, fn) {
  await db.exec("begin");
  try {
    await fn();
    results.push({ name, status: "PASS" });
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
async function consumerMessage(
  request,
  body = "Mensagem preservada sem atendente disponível",
) {
  await as("alice");
  await rpc("central_consumer_send", {
    p_request: request,
    p_body: body,
    p_key: randomUUID(),
  });
  return rpc("central_consumer_thread", { p_request: request });
}
await test("F01 Unconfigured 045 becomes inactive flexible; active flexible accepts no weekly hours", async () => {
  await as("root");
  const before = await rpc("assisted_admin_context");
  assert.equal(before.policy.availability_mode, "flexible");
  assert.equal(before.policy.active, false);
  assert.deepEqual(before.policy.hours, []);
  const p = await policy();
  assert.equal(p.active, true);
  assert.deepEqual(p.hours, []);
  assert.equal(p.availability_mode, "flexible");
  assert.equal((await usage()).state, "unconfigured");
});
await test("F02 Nobody online: eligible ticket enters unassigned queue; consumer message persists; zero units", async () => {
  await policy();
  await quota();
  await nobody();
  const t = await freshTicket();
  const row = await ticket(t.code);
  assert.equal(row.state, "queued");
  assert.equal(row.assignee_id, null);
  assert.equal(row.routing_scope, "support");
  const th = await consumerMessage(t.q.code);
  assert.ok(
    th.messages.some(
      (m) => m.body === "Mensagem preservada sem atendente disponível",
    ),
  );
  assert.equal(th.shared_open, false);
  assert.equal(
    th.shared_message,
    "Recebemos sua mensagem. A equipe responsável responderá assim que estiver disponível.",
  );
  assert.ok(th.available && th.can_send);
  assert.equal((await usage()).used, 0);
  await as("adminA");
  const ctx = await rpc("central_context", { p_code: t.code });
  assert.equal(ctx.shared_support.waiting, true);
  assert.equal(ctx.shared_support.team_available, false);
});
await test("F03 Public page, FAQ, deterministic request and booking work while all shared staff offline", async () => {
  await policy();
  await quota();
  await nobody();
  const { p, s } = await h.setup({ mode: "fixed", contract: "immediate" });
  await h.autonomy(["price_list", "schedule"]);
  await as("alice");
  const page = await rpc("consumer_public_page", {
    p_slug: "ms-auto-ficticia",
  });
  assert.ok(page.services.length);
  assert.ok(Array.isArray(page.faqs));
  const q = await h.draft(p, [h.empty(s)]);
  const slots = await h.slots(p, [h.empty(s)]);
  assert.ok(slots.length);
  await h.complete(q, slots[0]);
  assert.equal((await h.records(q)).length, 1);
  assert.equal((await usage()).used, 0);
});
await test("F04 Own company can claim and reply while shared policy inactive; no shared consumption", async () => {
  await policy({ active: false });
  await quota(0, 0);
  await nobody();
  await presence("adminA", "available");
  await act(h.legacy.codes.A, "claim", {}, "adminA");
  await act(
    h.legacy.codes.A,
    "message",
    { body: "Resposta da própria empresa" },
    "adminA",
  );
  assert.equal((await usage()).used, 0);
});
await test("F05 Busy, pause and offline cannot claim a new shared ticket; denial is atomic", async () => {
  await policy();
  await quota();
  for (const state of ["busy", "pause", "offline"]) {
    await presence("shared", state);
    const before = await ticket();
    await denied(
      () => act(h.legacy.codes.A, "claim"),
      /assisted_presence_required|central_presence_required/,
    );
    assert.deepEqual(await ticket(), before);
    assert.equal((await usage()).used, 0);
  }
});
await test("F06 Available authorized assigned staff claims exactly one unit; five replies do not multiply", async () => {
  await policy();
  await quota();
  await presence("shared", "available");
  await act(h.legacy.codes.A, "claim");
  assert.equal((await usage()).used, 1);
  for (let i = 0; i < 5; i++)
    await act(h.legacy.codes.A, "message", {
      body: "Resposta compartilhada fictícia " + i,
    });
  assert.equal((await usage()).used, 1);
});
await test("F07 Transfer between available shared staff and reclaim do not multiply consumption", async () => {
  await policy();
  await quota();
  await act(h.legacy.codes.A, "claim");
  await act(h.legacy.codes.A, "transfer", { user_id: users.backup });
  assert.equal((await ticket()).assignee_id, users.backup);
  await act(h.legacy.codes.A, "return", {}, "backup");
  assert.equal((await usage()).used, 1);
  await act(h.legacy.codes.A, "claim");
  assert.equal((await usage()).used, 1);
});
await test("F08 Transfer to unavailable shared recipient denied atomically without loss or quota change", async () => {
  await policy();
  await quota();
  await act(h.legacy.codes.A, "claim");
  await presence("backup", "busy");
  const before = await ticket();
  await denied(
    () => act(h.legacy.codes.A, "transfer", { user_id: users.backup }),
    /assisted_presence_required/,
  );
  assert.deepEqual(await ticket(), before);
  assert.equal((await usage()).used, 1);
  await presence("backup", "available");
  await act(h.legacy.codes.A, "transfer", { user_id: users.backup });
  assert.equal((await usage()).used, 1);
});
await test("F09 Limit blocks new shared ticket; queue and consumer/own company remain usable", async () => {
  await policy();
  await quota(1, 1);
  await act(h.legacy.codes.A, "claim");
  assert.equal((await usage()).state, "exhausted");
  const t = await freshTicket();
  const before = await ticket(t.code);
  await denied(() => act(t.code, "claim"), /assisted_limit_reached/);
  assert.deepEqual(await ticket(t.code), before);
  await consumerMessage(t.q.code);
  await presence("adminA", "available");
  await act(t.code, "claim", {}, "adminA");
  await act(
    t.code,
    "message",
    { body: "A empresa continua atendendo" },
    "adminA",
  );
  assert.equal((await usage()).used, 1);
});
await test("F10 Already counted ticket continues at limit even with busy presence; no new unit", async () => {
  await policy();
  await quota(1, 1);
  await act(h.legacy.codes.A, "claim");
  await presence("shared", "busy");
  await act(h.legacy.codes.A, "message", {
    body: "Continuidade do ticket contabilizado",
  });
  assert.equal((await usage()).used, 1);
  await consumerMessage(h.legacy.requests.A);
});
await test("F11 Scheduled hours preserved inside and outside window; consumers remain unaffected", async () => {
  await quota();
  await policy({ mode: "scheduled", hours: weekly() });
  await act(h.legacy.codes.A, "claim");
  const closed = [
    { day: (new Date().getUTCDay() + 1) % 7, open: "08:00", close: "09:00" },
  ];
  await policy({ mode: "scheduled", hours: closed });
  const before = await ticket();
  await denied(
    () =>
      act(h.legacy.codes.A, "message", { body: "Resposta fora do programado" }),
    /assisted_outside_hours/,
  );
  assert.deepEqual(await ticket(), before);
  const th = await consumerMessage(h.legacy.requests.A);
  assert.equal(th.shared_open, false);
  assert.equal(
    th.shared_message,
    "Mensagem de teste: sua solicitação permanece registrada.",
  );
  assert.equal((await usage()).used, 1);
});
await test("F12 Switching modes preserves weekly grid/timezone, consumption and audited history", async () => {
  await quota();
  const closed = [
    { day: (new Date().getUTCDay() + 1) % 7, open: "08:00", close: "09:00" },
  ];
  await policy({ mode: "scheduled", hours: closed });
  await denied(() => act(h.legacy.codes.A, "claim"), /assisted_outside_hours/);
  await policy({ mode: "flexible", hours: closed });
  await act(h.legacy.codes.A, "claim");
  await policy({ mode: "scheduled", hours: closed });
  await as("root");
  const d = await rpc("assisted_admin_context");
  assert.deepEqual(d.policy.hours, closed);
  assert.equal(d.policy.timezone, "UTC");
  assert.equal(d.policy.availability_mode, "scheduled");
  assert.equal(d.consumption.length, 1);
  assert.ok(
    d.configuration_history.some(
      (a) =>
        a.before_value?.availability_mode === "scheduled" &&
        a.after_value?.availability_mode === "flexible" &&
        a.actor_id === users.root,
    ),
  );
});
await test("F13 Scheduled active requires grid; invalid mode/timezone and stale revision rejected", async () => {
  await policy();
  await denied(
    () => policy({ mode: "scheduled", hours: [] }),
    /availability_invalid/,
  );
  await denied(() => policy({ mode: "invented" }), /availability_invalid/);
  await denied(
    () => policy({ timezone: "Invalid/Timezone" }),
    /availability_invalid/,
  );
  await as("root");
  const d = await rpc("assisted_admin_context");
  await policy();
  await denied(
    () =>
      rpc("assisted_policy_mode_save", {
        p_revision: d.policy.revision,
        p_active: true,
        p_hours: [],
        p_timezone: "UTC",
        p_message: "Mensagem fictícia",
        p_mode: "flexible",
      }),
    /availability_revision_conflict/,
  );
});
await test("F14 Business admin/direct RPC cannot change global mode, quota, or query other company usage", async () => {
  await policy();
  await quota();
  await as("adminA");
  await denied(
    () =>
      rpc("assisted_policy_mode_save", {
        p_revision: 1,
        p_active: true,
        p_hours: [],
        p_timezone: "UTC",
        p_message: "Mensagem fictícia",
        p_mode: "flexible",
      }),
    /access_denied/,
  );
  await denied(() => rpc("assisted_admin_context"), /access_denied/);
  await denied(() => rpc("assisted_company_usage", { p_org: orgs.B }));
  await denied(() => rpc("central_context", { p_code: h.legacy.codes.B }));
  await denied(
    () => db.query("select * from private.assisted_policy"),
    /permission denied/,
  );
});
await test("F15 Shared assignment and grants revoked are revalidated; presence cannot override authorization", async () => {
  await policy();
  await quota();
  await h.grants("shared", ["central.read", "central.reply"]);
  await denied(() => act(h.legacy.codes.A, "claim"), /permission|denied/);
  await h.grants("shared", h.centralGrants);
  await db.exec("reset role");
  await db.query(
    "update attendant_organizations set status='suspended' where organization_id=$1 and user_id=$2",
    [orgs.A, users.shared],
  );
  await denied(() => act(h.legacy.codes.A, "claim"), /denied|permission/);
  await as("agentA");
  await denied(() => rpc("central_context", { p_code: h.legacy.codes.B }));
  assert.equal((await usage()).used, 0);
});
await test("F16 Suspended subscription cannot receive shared support; old consumption retained", async () => {
  await policy();
  await quota();
  await act(h.legacy.codes.A, "claim");
  await db.exec("reset role");
  await db.query(
    "update billing_subscriptions set state='suspended' where organization_id=$1",
    [orgs.A],
  );
  await denied(() =>
    act(h.legacy.codes.A, "message", { body: "Não deve ser autorizada" }),
  );
  await as("root");
  const d = await rpc("assisted_admin_context");
  assert.equal(d.consumption.length, 1);
  assert.equal(d.companies.find((x) => x.id === orgs.A).usage.eligible, false);
});
await test("F17 Quota warning, cycle idempotence and immutable ledger remain intact across mode changes", async () => {
  await policy();
  await quota(3, 1);
  await act(h.legacy.codes.A, "claim");
  const before = await usage();
  assert.equal(before.state, "warning");
  await policy({ mode: "scheduled", hours: weekly() });
  const after = await usage();
  assert.equal(after.cycle_id, before.cycle_id);
  assert.equal(after.used, 1);
  await db.exec("reset role");
  await denied(
    () => db.exec("delete from private.assisted_consumption"),
    /immutable/,
  );
  await denied(
    () =>
      db.exec(
        "update private.assisted_cycles set ends_at=ends_at+interval '1 day'",
      ),
    /immutable/,
  );
});
await test("F18 Readiness only reflects available authorized staff assigned to this company", async () => {
  await policy();
  await quota();
  await nobody();
  assert.equal((await usage()).human_open, false);
  await presence("agentB", "available");
  assert.equal((await usage()).human_open, false);
  await presence("agentA", "available");
  assert.equal((await usage()).human_open, true);
  await presence("agentA", "busy");
  assert.equal((await usage()).human_open, false);
});
await test("F19 Queue and mode changes create no invoice and do not modify prices/trial", async () => {
  await db.exec("reset role");
  const before = await scalar(
    "select jsonb_build_object('plans',(select jsonb_agg(to_jsonb(p)order by id)from billing_plan_versions p),'invoices',(select count(*)from billing_invoices))",
  );
  await policy();
  await quota();
  await nobody();
  await freshTicket();
  await policy({ mode: "scheduled", hours: weekly() });
  await db.exec("reset role");
  const after = await scalar(
    "select jsonb_build_object('plans',(select jsonb_agg(to_jsonb(p)order by id)from billing_plan_versions p),'invoices',(select count(*)from billing_invoices))",
  );
  assert.deepEqual(after, before);
});
await test("F20 New functions reject anonymous access and support UI copy makes no continuous-service promise", async () => {
  await db.exec("reset role");
  const perms = (
    await db.query(
      "select proname,has_function_privilege('anon',p.oid,'execute') allowed from pg_proc p where proname in('assisted_policy_mode_save','assisted_can_receive','assisted_ready','assisted_ticket_status')",
    )
  ).rows;
  assert.equal(perms.length, 4);
  assert.ok(perms.every((p) => !p.allowed));
  const copy = await readFile("src/availability/support-copy.ts", "utf8");
  assert.match(copy, /conforme disponibilidade/i);
  assert.doesNotMatch(
    copy,
    /24\s*h|SLA|dedicado|exclusivo|resposta imediata|horário comercial garantido/i,
  );
});
await mkdir("reports/flexible-support", { recursive: true });
await writeFile(
  "reports/flexible-support/focused.json",
  JSON.stringify(
    { engine: "Local PGlite; fictitious fixtures", results },
    null,
    2,
  ),
);
await db.close();
if (results.some((r) => r.status !== "PASS")) process.exitCode = 1;
