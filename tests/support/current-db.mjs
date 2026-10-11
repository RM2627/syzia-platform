// Current gate fixture: reused 042 helpers; explicit ordered upgrade through 044.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { consumerDB, users } from "./consumer-db.mjs";
import { seedCentral } from "../fixtures/central.mjs";
const c = await consumerDB({
  through: "202609260041_self_service_journeys.sql",
});
const { db, as, scalar, orgs, services, save } = c;
const legacy = await seedCentral(c);
await db.exec(
  await readFile(
    "supabase/migrations/202609260042_operational_refinements.sql",
    "utf8",
  ),
);
if (!process.env.SYZIA_044_BASELINE)
  await db.exec(
    await readFile(
      "supabase/migrations/202609260044_approved_audit_corrections.sql",
      "utf8",
    ),
  );
if (process.env.SYZIA_TEAM_CURRENT === "1" && !process.env.SYZIA_044_BASELINE)
  await (
    await import("../../scripts/team-availability/fixture.mjs")
  ).upgradeTeamFixture(db);
let trace = [];
if (process.env.SYZIA_FLEXIBLE_CURRENT === "1" && process.env.SYZIA_TEAM_CURRENT === "1" && !process.env.SYZIA_044_BASELINE)
  await (await import("../../scripts/flexible-support/fixture.mjs")).upgradeFlexibleFixture(db);
if (process.env.SYZIA_BILLING_CURRENT === "1" && process.env.SYZIA_FLEXIBLE_CURRENT === "1" && process.env.SYZIA_TEAM_CURRENT === "1" && !process.env.SYZIA_044_BASELINE)
  await (await import("../../scripts/billing-047/fixture.mjs")).upgradeBillingFixture(db);
if(process.env.SYZIA_OPERATION_CURRENT === "1") (await import("../../scripts/syzia-049/fixture.mjs")).attachOperationRPC(c);
function summarize(r) {
  if (r == null || typeof r !== "object") return r;
  if (Array.isArray(r)) return { array_length: r.length };
  return {
    keys: Object.keys(r),
    ...Object.fromEntries(
      [
        "id",
        "code",
        "state",
        "revision",
        "booking_state",
        "journey",
        "duration_minutes",
        "execution_mode",
        "reason",
        "ready",
        "role",
      ]
        .filter((k) => k in r)
        .map((k) => [k, r[k]]),
    ),
  };
}
async function rpc(name, args = {}) {
  try {
    const r = await c.rpc(name, args);
    trace.push({ rpc: name, args, result: summarize(r) });
    return r;
  } catch (e) {
    trace.push({ rpc: name, args, error: e.message, code: e.code });
    throw e;
  }
}
function resetTrace() {
  trace = [];
}
function getTrace() {
  return trace;
}
function note(step, data) {
  trace.push({ step, data });
}
async function denied(
  fn,
  pattern = /denied|required|unavailable|invalid|permission|conflict|scope/,
) {
  await db.exec("savepoint audit_denial");
  try {
    await fn();
  } catch (e) {
    await db.exec("rollback to audit_denial");
    assert.match(e.message, pattern);
    return { error: e.message, code: e.code };
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
  execution = "continuous",
  max = null,
  priceMax = null,
} = {}) {
  await as("adminA");
  const name = "Serviço 042 fictício " + ++serviceSequence;
  const id = await save("A", "service", {
    name,
    price_mode: mode,
    price_cents: mode === "quote" ? null : 10000,
    duration_minutes: duration,
    contract_mode: contract,
    execution_mode: execution,
    execution_max_periods: max,
    price_max_cents: priceMax,
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
async function service(fn, args) {
  await db.exec("reset role;set local role service_role");
  return rpc(fn, args);
}
async function grants(user, actions, org = orgs.A) {
  await as(org === orgs.A ? "adminA" : "adminB");
  const t = await rpc("permissions_team", { p_org: org }),
    m = t.members.find((m) => m.user_id === users[user]);
  return rpc("permissions_save", {
    p_org: org,
    p_user: users[user],
    p_revision: m.revision,
    p_grants: actions.map((action) => ({
      action,
      scope: "organization",
      granted: true,
    })),
    p_key: randomUUID(),
  });
}
const allGrants = [
  ...centralGrants,
  ...quoteGrants,
  "agenda.read",
  "agenda.manage",
  "followup.read",
  "followup.manage",
];
async function autonomy(actions, cap = 10, pub = true) {
  await as("adminA");
  await save("A", "permissions", {
    allowed_actions: actions,
    reviewed: true,
    never_change_price: !actions.includes("discount"),
    max_discount_percent: actions.includes("discount") ? cap : 0,
  });
  if (pub) {
    const rev = () =>
      scalar("select revision from company_settings where organization_id=$1", [
        orgs.A,
      ]);
    const m = await rpc("company_create_manual", {
      p_org: orgs.A,
      p_expected_revision: await rev(),
      p_title: "Manual fictício 042",
    });
    await rpc("company_publish_manual", {
      p_org: orgs.A,
      p_manual: m,
      p_expected_revision: await rev(),
    });
    await rpc("company_set_activation", {
      p_org: orgs.A,
      p_expected_revision: await rev(),
      p_human: true,
      p_public_faq: true,
    });
  }
}
async function permission(action, discount = 0, actor = "shared") {
  await as(actor);
  return rpc("company_attendant_permission", {
    p_org: orgs.A,
    p_action: action,
    p_discount: discount,
  });
}
async function legacyAccount() {
  await db.exec("reset role");
  await db.query(
    "insert into organization_members(organization_id,user_id,role,status)values($1,$2,'colaborador_empresa','active')on conflict do nothing",
    [orgs.A, users.shared],
  );
  return scalar(
    "insert into private.enterprise_accounts(organization_id,user_id,username,display_name,contact_email,role,state,requested_by,request_key)values($1,$2,'global.legacy','Equipe Fictícia','global@example.invalid','colaborador_empresa','active',$3,$4)returning id",
    [orgs.A, users.shared, users.root, randomUUID()],
  );
}
async function hours({ close = "15:00", buffer = 0 } = {}) {
  await db.exec("reset role");
  await db.query(
    "update company_settings set business_hours=$2 where organization_id=$1",
    [
      orgs.A,
      JSON.stringify(
        Array.from({ length: 7 }, (_, day) => ({ day, open: "08:00", close })),
      ),
    ],
  );
  await db.query(
    "update schedule_resources set buffer_minutes=$2,lead_minutes=0,horizon_days=15 where organization_id=$1",
    [orgs.A, buffer],
  );
}
async function options(p, items, day = tomorrow(), next = false) {
  await as("alice");
  return rpc("consumer_journey_options", {
    p_slug: p.slug,
    p_revision: p.revision,
    p_items: items,
    p_day: day,
    p_next: next,
  });
}
async function divided({ duration = 600, max = 3, buffer = 0 } = {}) {
  await hours({ buffer });
  const { p, s, id } = await setup({ execution: "split", duration, max });
  const items = [empty(s)],
    q = await draft(p, items),
    o = await options(p, items);
  assert.ok(o.plans.length);
  return { p, s, id, items, q, o, plan: o.plans[0] };
}
async function completePlan(x, key = randomUUID()) {
  await as("alice");
  return rpc("consumer_complete_execution", {
    p_code: x.q.code,
    p_start: x.plan.start,
    p_attachment_count: 0,
    p_periods: x.plan.periods,
    p_key: key,
  });
}
async function records(q) {
  await db.exec("reset role");
  return (
    await db.query(
      "select *from appointments where request_id=(select id from quote_requests where public_code=$1)and state='confirmed'order by part_number",
      [q.code],
    )
  ).rows;
}

export {
  c,
  db,
  as,
  scalar,
  rpc,
  orgs,
  services,
  save,
  legacy,
  users,
  randomUUID,
  assert,
  denied,
  tomorrow,
  expiry,
  customer,
  empty,
  cost,
  publish,
  setup,
  draft,
  slots,
  complete,
  ctx,
  review,
  line,
  discount,
  proposal,
  approve,
  block,
  grantWorker,
  quoteGrants,
  centralGrants,
  service,
  grants,
  allGrants,
  autonomy,
  permission,
  legacyAccount,
  hours,
  options,
  divided,
  completePlan,
  records,
  resetTrace,
  getTrace,
  note,
};
