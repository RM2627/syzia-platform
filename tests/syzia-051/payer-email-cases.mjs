// Imported by financial.test.mjs so the existing 30-stage gate executes these cases.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "../billing-047/fixture.mjs";
import { subscriptions } from "../../server/billing/subscriptions.mjs";
import { createBillingServer } from "../../server/billing/http.mjs";
import { normalizePayerEmail } from "../../shared/billing-payer-email.mjs";

test("051-E01 payer normalization preserves local case and plus tags", () => {
  for (const [input, expected] of [
    ["Admin@example.invalid", "Admin@example.invalid"],
    ["  Payer+Trial@EXAMPLE.INVALID  ", "Payer+Trial@example.invalid"],
    ["payer.o'neill@sub.example.invalid", "payer.o'neill@sub.example.invalid"],
  ]) assert.equal(normalizePayerEmail(input), expected);
});
test("051-E02 invalid, absent, control, display-name and oversized emails fail closed", () => {
  for (const input of [undefined, null, {}, [], 1, "", " ", "a", "a@b", "a@@b.invalid",
    "a b@example.invalid", "a@example.invalid\r\n", "a\0@example.invalid", "A <a@example.invalid>",
    ".a@example.invalid", "a..b@example.invalid", "a.@example.invalid", "a@-example.invalid",
    "a@example..invalid", "á@example.invalid", "a".repeat(65) + "@example.invalid",
    "a@" + "b".repeat(64) + ".invalid", "a@" + ("b".repeat(60) + ".").repeat(5) + "invalid"])
    assert.equal(normalizePayerEmail(input), null);
});

const c = await fixture();
test.after(() => c.db.close());
const original = c.gateway.fetchImpl;
const creates = [], updates = [];
let mode = "normal", release, entered;
c.gateway.fetchImpl = async (url, init) => {
  const path = new URL(url).pathname;
  if (path === "/preapproval" && init.method === "POST") {
    const body = JSON.parse(init.body);
    creates.push({ body, key: init.headers["X-Idempotency-Key"] }); // Fictitious test transport only.
    if (mode === "reject") return new Response('{"message":"PRIVATE-PROVIDER-BODY"}', { status: 400 });
    if (mode === "wait-timeout") {
      entered(); await new Promise(ok => { release = ok; });
      await original(url, init);
      throw Error("PRIVATE-PAYER-TRANSPORT-FAILURE");
    }
  }
  if (path.startsWith("/preapproval/") && init.method === "PUT") updates.push(JSON.parse(init.body));
  return original(url, init);
};
const body = (extra = {}) => ({ organization_id: c.orgs.A, action: "checkout", request_key: randomUUID(),
  plan_version_id: c.versions.profissional, card_token: "offline-email-test-token", trial_expected: true,
  payer_email: "payer@example.invalid", ...extra });
let identities, contractB, reservations;
const identitySnapshot = async () => ({
  accounts: (await c.rawSQL("select id,email from auth.users order by id")).rows,
  // Includes the responsible person's verified document fingerprint; never changed by payer input.
  identifiers: (await c.rawSQL("select * from private.trial_identifiers order by organization_id,kind,fingerprint")).rows,
});
test("051-E03 config suggests own administrative email but synthetic enterprise login is not suggested", async () => {
  identities = await identitySnapshot();
  assert.equal((await c.engine.user("config", {}, "adminA")).payer_email_suggestion, "adminA@example.invalid");
  const engine = subscriptions({ gateway: c.gateway, service: c.service, asUser: c.asUser,
    auth: async () => ({ id: c.users.adminA, email: "opaque@access.vireloq.invalid" }) });
  assert.equal((await engine.user("config", {}, "adminA")).payer_email_suggestion, "");
  await assert.rejects(c.engine.user("config", {}, "unknown"), /access_denied/);
});
test("051-E04 missing or invalid payer is rejected before reserving a contract or contacting provider", async () => {
  for (const email of [undefined, null, {}, "", "invalid", "private@example.invalid\n"])
    await assert.rejects(c.engine.user("command", body({ payer_email: email }), "adminA"), /billing_payer_email_invalid/);
  assert.equal((await c.view()).subscription, null);
  assert.equal(creates.length, 0);
  assert.equal((await c.rawSQL("select count(*)::int n from private.billing047_trial_reservations")).rows[0].n, 0);
});
test("051-E05 payer cannot change tenant, actor, privileges, price or trial authority", async () => {
  await assert.rejects(c.engine.user("command", body({ organization_id: c.orgs.B }), "adminA"), /denied|scope|permission/);
  await assert.rejects(c.engine.user("command", body(), "worker"), /denied|scope|permission/);
  await assert.rejects(c.engine.user("command", body(), "unknown"), /access_denied/);
  for (const extra of [{ actor_id: c.users.adminB }, { amount: 1 }, { provider_id: "third-party" }])
    await assert.rejects(c.engine.user("command", body(extra), "adminA"), /billing_payload_invalid/);
  assert.equal(creates.length, 0);
  assert.equal((await c.view("B")).subscription, null);
});
test("051-E06 same administrator/payer email creates only through confirmed official snapshot", async () => {
  const result = await c.command("checkout", "profissional", "A", { payer_email: "adminA@example.invalid" });
  assert.equal(creates.at(-1).body.payer_email, "adminA@example.invalid");
  assert.equal(result.subscription.state, "trialing");
  assert.deepEqual(Object.keys(creates.at(-1).body).sort(), ["back_url", "card_token_id", "external_reference", "notification_url", "payer_email", "preapproval_plan_id", "reason", "status"]);
  assert.equal(creates.at(-1).body.preapproval_plan_id, "profissional-trial");
  assert.equal(creates.at(-1).body.status, "authorized");
  assert.deepEqual(await identitySnapshot(), identities);
});
test("051-E07 a linked subscription never changes payer or creates again from stale checkout input", async () => {
  const before = (await c.view()).subscription.id;
  await c.command("checkout", "profissional", "A", { payer_email: "another@example.invalid" });
  assert.equal(creates.length, 1);
  assert.equal(updates.length, 0);
  assert.equal((await c.view()).subscription.id, before);
});
test("051-E08 different payer reaches POST; definitive 400 retains contract/trial and no access", async () => {
  mode = "reject";
  await assert.rejects(c.command("checkout", "equipe", "B", { payer_email: " First+Payer@EXAMPLE.INVALID " }), /billing_provider_invalid_request/);
  assert.equal(creates.at(-1).body.payer_email, "First+Payer@example.invalid");
  const s = (await c.view("B")).subscription;
  contractB = s.id;
  assert.equal(s.checkout_retryable, true);
  assert.equal(s.state, "payment_pending");
  assert.equal(s.checkout_trial, true);
  const b = await c.service("billing047_service", { p_action: "get", p_id: contractB, p_data: {} });
  assert.equal(b.provider_id, null);
  assert.equal(b.create_started, false);
  assert.equal(b.actor_id, c.users.adminB);
  assert.equal(b.organization_id, c.orgs.B);
  reservations = (await c.rawSQL("select * from private.billing047_trial_reservations where contract_id=$1 order by kind,fingerprint", [contractB])).rows;
  assert.ok(reservations.length);
  assert.equal((await c.asUser("adminB", "billing_capabilities", { p_org: c.orgs.B })).software, false);
});
test("051-E09 definitive rejection allows a confirmed new payer; two tabs share lease and cannot double create", async () => {
  mode = "wait-timeout";
  const waiting = new Promise(ok => { entered = ok; });
  const first = c.command("checkout", "equipe", "B", { payer_email: "retry@example.invalid", card_token: "offline-fresh-retry-token" });
  const rejected = assert.rejects(first, /billing_provider_unavailable/);
  await waiting;
  try {
    const second = await c.command("checkout", "equipe", "B", { payer_email: "other-tab@example.invalid" });
    assert.equal(second.subscription.operation_pending, true);
    assert.equal(creates.length, 3); // A success + B definitive rejection + B leased retry.
    assert.equal(creates.at(-1).body.payer_email, "retry@example.invalid");
    assert.equal(creates.at(-1).body.external_reference, contractB);
    assert.equal(creates.at(-1).key, creates.at(-2).key);
    assert.ok(creates.at(-1).key);
  } finally { release(); }
  await rejected;
  mode = "normal";
  assert.equal(c.fake.subscriptions.size, 2);
  const s = (await c.view("B")).subscription;
  assert.equal(s.state, "reconciliation");
  assert.equal(s.checkout_retryable, false);
  assert.equal((await c.asUser("adminB", "billing_capabilities", { p_org: c.orgs.B })).software, false);
});
test("051-E10 uncertain attempt cannot change payer, restart trial or bypass reconciliation, even with empty search", async () => {
  const find = c.gateway.find;
  c.gateway.find = async () => [];
  try {
    await assert.rejects(c.command("checkout", "equipe", "B", { payer_email: "changed@example.invalid" }), /billing_reconciliation_required/);
    assert.equal(creates.length, 3);
    assert.equal(updates.length, 0);
    assert.equal((await c.asUser("adminB", "billing_capabilities", { p_org: c.orgs.B })).software, false);
  } finally { c.gateway.find = find; }
  await c.engine.reconcile();
  const s = (await c.view("B")).subscription;
  assert.equal(s.id, contractB);
  assert.equal(s.state, "trialing");
  assert.equal(creates.length, 3);
  assert.deepEqual((await c.rawSQL("select * from private.billing047_trial_reservations where contract_id=$1 order by kind,fingerprint", [contractB])).rows, reservations);
  assert.equal((await c.rawSQL("select count(*)::int n from private.trial_grants where organization_id=$1", [c.orgs.B])).rows[0].n, 1);
});
test("051-E11 changing payment method does not accept payer mutation; account and financial history hold no new email/token", async () => {
  await assert.rejects(c.command("method", null, "B", { payer_email: "replacement@example.invalid" }), /billing_payload_invalid/);
  await c.command("method", null, "B");
  assert.deepEqual(updates.at(-1), { card_token_id: "offline-token-for-tests-only" });
  assert.deepEqual(await identitySnapshot(), identities);
  const stored = JSON.stringify((await c.rawSQL("select to_jsonb(c) data from private.billing047_contracts c union all select to_jsonb(a) from private.billing047_audit a")).rows);
  for (const value of ["First+Payer@", "retry@example.invalid", "changed@example.invalid", "offline-fresh-retry-token"])
    assert.ok(!stored.includes(value));
});
test("051-E12 HTTP failure and audit preserve correlation without email, document or token", async () => {
  const logs = [];
  const server = createBillingServer({ origin: "http://127.0.0.1", billing: c.engine, log: e => logs.push(e) });
  await new Promise(ok => server.listen(0, "127.0.0.1", ok));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/billing/command`, {
      method: "POST", headers: { Origin: "http://127.0.0.1", Authorization: "Bearer adminA", "Content-Type": "application/json" },
      body: JSON.stringify(body({ payer_email: "PRIVATE-PAYER@example.invalid\n" })),
    });
    assert.equal(response.status, 400);
    const result = await response.json();
    assert.equal(result.error, "billing_payer_email_invalid");
    assert.equal(result.request_id, logs[0].request_id);
    assert.doesNotMatch(JSON.stringify([result, logs]), /PRIVATE|@|offline-email-test-token|Bearer|adminA/);
  } finally { await new Promise(ok => server.close(ok)); }
});
