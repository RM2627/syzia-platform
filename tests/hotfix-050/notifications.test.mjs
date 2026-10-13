// Local disposable database + fake provider only. Never uses process credentials.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { billingRuntime } from "../../server/billing/runtime.mjs";
import { createBillingServer } from "../../server/billing/http.mjs";
import { unifiedRuntime } from "../../server/unified.mjs";
import { fixture } from "../billing-047/fixture.mjs";

const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  if (new URL(url).hostname !== "127.0.0.1") throw Error("050_external_network_forbidden");
  return realFetch(url, init);
};
const env = { SUPABASE_URL: "https://offline.example.invalid", SUPABASE_SERVICE_ROLE_KEY: "offline-service-only",
  PLATFORM_APP_ORIGIN: "https://app.example.invalid", BILLING_PROVIDER: "mercado_pago", MERCADO_PAGO_ENABLED: "false",
  MERCADO_PAGO_ACCESS_TOKEN: "offline-provider-canary", MERCADO_PAGO_PUBLIC_KEY: "offline-public",
  MERCADO_PAGO_COLLECTOR_ID: "101", MERCADO_PAGO_APPLICATION_ID: "202",
  MERCADO_PAGO_NOTIFICATION_URL: "https://api.example.invalid/billing/notifications",
  MERCADO_PAGO_WEBHOOK_SECRET: "offline-signature-canary", MERCADO_PAGO_NOTIFICATION_MODE: "observe" };
const raw = (id, type = "subscription_preapproval", extra = {}) => Buffer.from(JSON.stringify({ type, data: { id }, ...extra }));
const signed = id => {
  const ts = "1780000000", rid = "offline-request-050";
  const v1 = createHmac("sha256", env.MERCADO_PAGO_WEBHOOK_SECRET).update(`id:${id.toLowerCase()};request-id:${rid};ts:${ts};`).digest("hex");
  return { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": rid };
};
const c = await fixture();
test.after(() => c.db.close());
// This pre-existing subscription is created by the old, enabled engine in the
// disposable fixture, NOT by observation mode. B intentionally has no contract.
await c.command();
const p = [...c.fake.subscriptions.values()][0];
const sqlCalls = [], logs = [];
let getError = null;
const client = { auth: { getUser: async () => { throw Error("observation_must_not_authenticate_user_commands"); } },
  rpc: async (name, args) => {
    sqlCalls.push({ name, args });
    assert.equal(name, "billing047_service"); assert.equal(args.p_action, "get");
    if (getError) return { error: getError };
    try { return { data: await c.service(name, args) }; } catch (error) { return { error }; }
  } };
const make = (overrides = {}, transport = c.fake.fetchImpl) => billingRuntime({ ...env, ...overrides }, { createClientImpl: () => client, fetchImpl: transport });
const runtime = make();
const server = createBillingServer({ origin: env.PLATFORM_APP_ORIGIN, billing: runtime.billing, log: e => logs.push(e) });
await new Promise(ok => server.listen(0, "127.0.0.1", ok));
test.after(() => new Promise(ok => server.close(ok)));
const base = "http://127.0.0.1:" + server.address().port;
const post = (id, type, headers = signed(id), extra = {}) => fetch(base + "/billing/notifications?data.id=" + id, { method: "POST", headers, body: raw(id, type, extra) });
const observe = (id = p.id, type, extra) => runtime.billing.webhook(raw(id, type, extra), signed(id), new URLSearchParams("data.id=" + id));
async function state() {
  const result = {};
  for (const table of ["private.billing047_contracts", "private.billing047_payments", "private.billing047_commands", "private.billing047_trial_reservations", "private.billing047_audit", "private.trial_grants", "private.trial_audit", "billing_subscriptions", "organization_members", "audit_logs"]) {
    result[table] = (await c.rawSQL(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') data from ${table} t`)).rows[0].data;
  }
  return result;
}
const initial = await state();
const providerStart = c.fake.calls.length;

test("050-N01 default disabled is explicit, not falsely missing credentials", async () => {
  const off = make({ MERCADO_PAGO_NOTIFICATION_MODE: undefined });
  assert.equal(off.gateway, null);
  await assert.rejects(off.billing.webhook(raw("123456"), {}, new URLSearchParams()), e => e.code === "billing_disabled" && e.status === 503);
});
test("050-N02 observe requires explicit provider, real configuration and HMAC secret", () => {
  for (const override of [{ MERCADO_PAGO_NOTIFICATION_MODE: "anything" }, { MERCADO_PAGO_ENABLED: "true" },
    { MERCADO_PAGO_WEBHOOK_SECRET: "" }, { BILLING_PROVIDER: "mock" }])
    assert.throws(() => make(override), /billing_configuration_invalid/);
  assert.throws(() => make({ MERCADO_PAGO_ACCESS_TOKEN: "" }), /billing_credentials_missing/);
  assert.throws(() => make({ MERCADO_PAGO_NOTIFICATION_URL: "http://unsafe.invalid" }), /billing_configuration_invalid/);
});
test("050-N03 all user commands, config, status, process and reconcile remain closed", async () => {
  const before = c.fake.calls.length, sqlBefore = sqlCalls.length;
  for (const action of ["checkout", "cancel", "resume", "change", "method"])
    await assert.rejects(runtime.billing.user("command", { action, organization_id: c.orgs.A, card_token: "offline-card-canary" }, "adminA"), /billing_disabled/);
  for (const path of ["config", "status"]) await assert.rejects(runtime.billing.user(path, {}, "adminA"), /billing_disabled/);
  await assert.rejects(runtime.billing.process(randomUUID()), /billing_disabled/);
  await assert.rejects(runtime.billing.reconcile(), /billing_disabled/);
  assert.equal(runtime.gateway, null);
  assert.equal(c.fake.calls.length, before); assert.equal(sqlCalls.length, sqlBefore);
});
test("050-N04 HMAC absent/invalid and conflicting ID fail before any official query", async () => {
  const before = c.fake.calls.length;
  for (const headers of [{}, { ...signed(p.id), "x-request-id": "changed" }, { ...signed(p.id), "x-signature": "ts=1780000000,v1=" + "0".repeat(64) }]) {
    const r = await post(p.id, "subscription_preapproval", headers); assert.equal(r.status, 401);
  }
  await assert.rejects(runtime.billing.webhook(raw(p.id), signed(p.id), new URLSearchParams("data.id=other")), /billing_webhook_invalid/);
  assert.equal(c.fake.calls.length, before);
});
test("050-N05 simulator ID 123456 is not special-cased or falsely acknowledged", async () => {
  const r = await post("123456", "subscription_preapproval");
  assert.equal(r.status, 502); assert.equal((await r.json()).error, "billing_resource_missing");
});
test("050-N06 valid bound subscription validates then returns observed, never applied", async () => {
  const r = await post(p.id, "subscription_preapproval");
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { accepted: true, mode: "observe", applied: false });
  assert.deepEqual(await state(), initial);
});
test("050-N07 duplicate and out-of-order hints, altered body and two requests have zero effects", async () => {
  await Promise.all([observe(), observe(p.id, "subscription_preapproval", { status: "cancelled", version: 999, amount: 1, organization_id: c.orgs.B })]);
  await observe(); assert.deepEqual(await state(), initial);
});
test("050-N08 signature cannot authorize another collector, app, plan or binding", async () => {
  for (const [key, value] of [["collector_id", 999], ["application_id", 999], ["preapproval_plan_id", "another-plan"], ["external_reference", randomUUID()]]) {
    const old = p[key]; p[key] = value;
    try { await assert.rejects(observe(), /billing_binding_mismatch|billing_binding_missing/); } finally { p[key] = old; }
  }
  assert.deepEqual(await state(), initial);
});
test("050-N09 unknown real resource is not imported, bound or granted a trial", async () => {
  const unknown = structuredClone(p); unknown.id = "not-locally-bound"; unknown.external_reference = randomUUID(); c.fake.subscriptions.set(unknown.id, unknown);
  try { await assert.rejects(observe(unknown.id), /billing_binding_missing/); } finally { c.fake.subscriptions.delete(unknown.id); }
  assert.equal((await c.view("B")).subscription, null); assert.deepEqual(await state(), initial);
});
test("050-N10 payment and authorized invoice require official reads; approved cannot activate access", async () => {
  const iid = c.fake.charge(p.id, "approved");
  assert.deepEqual(await observe(iid, "subscription_authorized_payment"), { accepted: true, mode: "observe", applied: false });
  await observe("payment-" + iid, "payment"); assert.deepEqual(await state(), initial);
  c.fake.invoices.delete(iid); c.fake.payments.delete("payment-" + iid);
});
test("050-N11 rejected payment and external cancellation do not run financial transitions", async () => {
  const iid = c.fake.charge(p.id, "rejected"); await observe(iid, "subscription_authorized_payment");
  c.fake.invoices.delete(iid); c.fake.payments.delete("payment-" + iid);
  const status = p.status; p.status = "cancelled";
  try { await observe(); } finally { p.status = status; }
  assert.deepEqual(await state(), initial);
});
test("050-N12 invalid trial date still fails; observation does not waive financial validation", async () => {
  const next = p.next_payment_date; p.next_payment_date = p.date_created;
  try { await assert.rejects(observe(), /billing_trial_mismatch/); } finally { p.next_payment_date = next; }
});
test("050-N13 unsupported/invalid/oversized payload does not receive artificial 200", async () => {
  assert.equal((await post("plan", "subscription_preapproval_plan")).status, 400);
  assert.equal((await fetch(base + "/billing/notifications", { method: "POST", body: "{" })).status, 400);
  assert.equal((await fetch(base + "/billing/notifications", { method: "POST", body: "a".repeat(16385) })).status, 413);
});
test("050-N14 provider errors, invalid JSON and timeout remain errors and do not leak bodies", async () => {
  for (const [transport, expected] of [[async () => new Response("offline-provider-canary", { status: 503 }), /billing_provider_unavailable/],
    [async () => new Response("offline-invalid-json"), /billing_response_invalid/]]) {
    const r = make({}, transport); await assert.rejects(r.billing.webhook(raw(p.id), signed(p.id), new URLSearchParams()), expected);
  }
  const timeout = make({}, (_url, init) => new Promise((_ok, no) => init.signal.addEventListener("abort", () => no(Error("sensitive-exception")))));
  await assert.rejects(timeout.billing.webhook(raw(p.id), signed(p.id), new URLSearchParams()), /billing_timeout/);
  getError = { message: "private-canary-sql-error" };
  try { await assert.rejects(observe(), /billing_observation_unavailable/); } finally { getError = null; }
});
test("050-N15 HTTP CORS and methods preserved; body cannot turn observation into commerce", async () => {
  assert.equal((await fetch(base + "/billing/notifications")).status, 404);
  assert.equal((await fetch(base + "/billing/config", { method: "POST", body: "{}", headers: { origin: "https://evil.example.invalid" } })).status, 403);
  const r = await fetch(base + "/billing/command", { method: "POST", headers: { origin: env.PLATFORM_APP_ORIGIN }, body: JSON.stringify({ MERCADO_PAGO_ENABLED: true, mode: "enabled", action: "checkout" }) });
  assert.equal(r.status, 503); assert.equal((await r.json()).error, "billing_disabled");
  assert.equal((await fetch(base + "/billing/config", { method: "OPTIONS", headers: { origin: env.PLATFORM_APP_ORIGIN } })).status, 204);
});
test("050-N16 only GET provider calls and read-only RPC occurred; no secret in diagnostics", async () => {
  assert.ok(c.fake.calls.slice(providerStart).every(x => x.method === "GET"));
  assert.ok(sqlCalls.every(x => x.name === "billing047_service" && x.args.p_action === "get"));
  assert.deepEqual(await state(), initial);
  const out = JSON.stringify(logs);
  assert.match(out, /billing_notification_observed/);
  for (const secret of [env.MERCADO_PAGO_WEBHOOK_SECRET, env.MERCADO_PAGO_ACCESS_TOKEN, env.SUPABASE_SERVICE_ROLE_KEY, p.id, c.orgs.A, "x-signature", "card_token", "offline-card-canary"]) assert.ok(!out.includes(secret));
});
test("050-N17 unified runtime never schedules reconciliation in observe", () => {
  const r = unifiedRuntime({ ...env, SUPABASE_PUBLISHABLE_KEY: "offline-public", NODE_ENV: "production" });
  assert.equal(r.reconcile, null);
});
test("050-N18 enabled commercial mode retains the existing engine and reconciler entry points", () => {
  const r = make({ MERCADO_PAGO_ENABLED: "true", MERCADO_PAGO_NOTIFICATION_MODE: "disabled" });
  assert.ok(r.gateway); assert.equal(typeof r.billing.reconcile, "function"); assert.equal(typeof r.billing.process, "function");
});
