import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "../billing-047/fixture.mjs";
import { MercadoPagoSubscriptions } from "../../server/billing/mercado-pago.mjs";
import { createBillingServer } from "../../server/billing/http.mjs";
import "./payer-email-cases.mjs";
import "../integrated-051/trial.test.mjs";
import "../integrated-051/reconciliation.test.mjs";
import "../integrated-051/method.test.mjs";
import "../integrated-051/upgrade.test.mjs";
import "../integrated-051/integrity-cases.mjs";
const opts = {
  accessToken: "offline-051-only",
  collectorId: 101,
  applicationId: 202,
  publicKey: "offline-public",
  notificationUrl: "https://api.example.invalid/billing/notifications",
  appOrigin: "https://app.example.invalid",
};
for (const [status, code, definitive] of [
  [400, "billing_provider_invalid_request", true],
  [401, "billing_provider_authentication", true],
  [403, "billing_provider_forbidden", true],
  [404, "billing_resource_missing", false],
  [408, "billing_provider_unavailable", false],
  [409, "billing_provider_conflict", false],
  [422, "billing_provider_invalid_request", true],
  [429, "billing_provider_rate_limited", false],
  [500, "billing_provider_unavailable", false],
  [503, "billing_provider_unavailable", false],
  [418, "billing_provider_rejected", false],
]) {
  test(`051-F HTTP ${status}: scoped safe diagnosis, no arbitrary body`, async () => {
    const gateway = new MercadoPagoSubscriptions({
      ...opts,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            message: "SENSITIVE token CVV email CPF",
            code: "cc_rejected_other_reason",
            payer: "private@example.invalid",
          }),
          { status },
        ),
    });
    await assert.rejects(
      gateway.request("/preapproval", "POST", {}),
      (e) =>
        e.code === code &&
        e.providerStatus === status &&
        e.providerStage === "create" &&
        e.definitiveRejection === definitive &&
        !JSON.stringify(e).includes("SENSITIVE") &&
        !String(e).includes("private"),
    );
  });
}
test("051-F endpoint plan 404 is unavailable, arbitrary error text does not imply card or buyer refusal", async () => {
  const gateway = new MercadoPagoSubscriptions({
    ...opts,
    fetchImpl: async () =>
      new Response("Payer is associated with a different site", {
        status: 404,
      }),
  });
  await assert.rejects(
    gateway.plan(
      "test",
      {
        code: "profissional",
        amount_cents: 8990,
        currency: "BRL",
        interval_months: 1,
      },
      true,
    ),
    (e) => e.code === "billing_plan_unavailable" && e.providerStage === "plan",
  );
});
const c = await fixture();
test.after(() => c.db.close());
const fetchOriginal = c.gateway.fetchImpl;
let contract;
test("051-F definitive refusal closes uncertainty, retains trial/history and grants no access", async () => {
  c.gateway.fetchImpl = async (url, init) =>
    new URL(url).pathname === "/preapproval" && init.method === "POST"
      ? new Response("{}", { status: 400 })
      : fetchOriginal(url, init);
  await assert.rejects(
    c.command("checkout", "profissional"),
    /billing_provider_invalid_request/,
  );
  const s = (await c.view()).subscription;
  contract = s.id;
  assert.equal(s.state, "payment_pending");
  assert.equal(s.operation_pending, false);
  assert.equal(s.checkout_retryable, true);
  assert.equal(s.checkout_trial, true);
  assert.equal(s.checkout_outcome, "retryable_failure");
  const b = await c.service("billing047_service", {
    p_action: "get",
    p_id: contract,
    p_data: {},
  });
  assert.equal(b.operation_state, "done");
  assert.equal(b.create_started, false);
  assert.equal(b.provider_id, null);
  assert.equal(b.provider_http_status, 400);
  assert.equal(b.provider_error_stage, "create");
  assert.equal(
    (await c.asUser("adminA", "billing_capabilities", { p_org: c.orgs.A }))
      .software,
    false,
  );
  assert.ok(
    (
      await c.rawSQL(
        "select count(*)::int n from private.billing047_trial_reservations where contract_id=$1",
        [contract],
      )
    ).rows[0].n > 0,
  );
  assert.deepEqual(
    (
      await c.rawSQL(
        "select event from private.billing047_audit where contract_id=$1 order by id",
        [contract],
      )
    ).rows.map((r) => r.event),
    ["checkout_started", "checkout_rejected", "checkout_failed"],
  );
});
test("051-F status and reconciler never repeat create after refusal; legacy contradictory state changes no history", async () => {
  const count = c.fake.subscriptions.size;
  await c.engine.user("status", { organization_id: c.orgs.A }, "adminA");
  await c.engine.reconcile();
  assert.equal(c.fake.subscriptions.size, count);
  await c.rawSQL(
    "update private.billing047_contracts set state='reconciliation',operation_state='uncertain',error_code='billing_provider_rejected' where id=$1",
    [contract],
  );
  const before = (
    await c.rawSQL(
      "select * from private.billing047_audit where contract_id=$1 order by id",
      [contract],
    )
  ).rows;
  const v = await c.view();
  assert.equal(v.subscription.checkout_retryable, true);
  assert.equal(v.subscription.operation_pending, false);
  assert.deepEqual(
    (
      await c.rawSQL(
        "select * from private.billing047_audit where contract_id=$1 order by id",
        [contract],
      )
    ).rows,
    before,
  );
});
test("051-F safe manual retry in two tabs shares contract, lease, trial and one POST; leased context blocks CTA", async () => {
  let release, entered;
  const gate = new Promise((ok) => (release = ok)),
    waiting = new Promise((ok) => (entered = ok));
  c.gateway.fetchImpl = async (url, init) => {
    if (new URL(url).pathname === "/preapproval" && init.method === "POST") {
      entered();
      await gate;
    }
    return fetchOriginal(url, init);
  };
  const first = c.command("checkout", "profissional");
  await waiting;
  const v = await c.view();
  assert.equal(v.subscription.checkout_retryable, false);
  assert.equal(v.subscription.operation_pending, true);
  await c.command("checkout", "profissional");
  release();
  await first;
  assert.equal(c.fake.subscriptions.size, 1);
  assert.equal((await c.view()).subscription.id, contract);
  assert.equal((await c.view()).subscription.state, "trialing");
  assert.equal(
    (
      await c.rawSQL(
        "select count(*)::int n from private.trial_grants where organization_id=$1",
        [c.orgs.A],
      )
    ).rows[0].n,
    1,
  );
  c.gateway.fetchImpl = fetchOriginal;
});
test("051-F timeout after external creation keeps uncertainty; official search recovers without another POST", async () => {
  c.gateway.fetchImpl = async (url, init) => {
    const response = await fetchOriginal(url, init);
    if (new URL(url).pathname === "/preapproval" && init.method === "POST")
      throw Error("sensitive transport error");
    return response;
  };
  await assert.rejects(
    c.command("checkout", "equipe", "B"),
    /billing_provider_unavailable/,
  );
  const s = (await c.view("B")).subscription;
  assert.equal(s.state, "reconciliation");
  assert.equal(s.checkout_retryable, false);
  assert.equal(s.operation_pending, true);
  const count = c.fake.calls.filter((x) => x.method === "POST").length;
  c.gateway.fetchImpl = fetchOriginal;
  await c.engine.user("status", { organization_id: c.orgs.B }, "adminB");
  assert.equal(c.fake.calls.filter((x) => x.method === "POST").length, count);
  assert.equal((await c.view("B")).subscription.state, "trialing");
});
test("051-F empty full search never authorizes new POST; trial mismatch remains strict", async () => {
  const id = (await c.view("B")).subscription.id;
  await c.rawSQL(
    "update private.billing047_contracts set provider_id=null,operation_state='uncertain',create_started=true,state='reconciliation' where id=$1",
    [id],
  );
  const find = c.gateway.find;
  c.gateway.find = async () => [];
  const count = c.fake.calls.filter((x) => x.method === "POST").length;
  await assert.rejects(
    c.command("checkout", "equipe", "B"),
    /billing_reconciliation_required/,
  );
  assert.equal(c.fake.calls.filter((x) => x.method === "POST").length, count);
  c.gateway.find = find;
  const p = [...c.fake.subscriptions.values()].find(
    (p) => p.external_reference === id,
  );
  p.next_payment_date = p.date_created;
  await assert.rejects(c.engine.process(id), /billing_trial_mismatch/);
  assert.equal(
    (await c.asUser("adminB", "billing_capabilities", { p_org: c.orgs.B }))
      .software,
    false,
  );
  p.next_payment_date = new Date(
    Date.parse(p.date_created) + 7 * 86400000,
  ).toISOString();
  await c.engine.process(id);
});
test("051-F duplicate webhook, tenant mismatch and unauthenticated failure RPC preserve authority", async () => {
  const p = [...c.fake.subscriptions.values()][0];
  const hook = Buffer.from(
    JSON.stringify({ type: "subscription_preapproval", data: { id: p.id } }),
  );
  const grants = (
    await c.rawSQL("select count(*)::int n from private.trial_grants")
  ).rows[0].n;
  await Promise.all([
    c.engine.webhook(hook, {}, new URLSearchParams()),
    c.engine.webhook(hook, {}, new URLSearchParams()),
  ]);
  assert.equal(
    (await c.rawSQL("select count(*)::int n from private.trial_grants")).rows[0]
      .n,
    grants,
  );
  await assert.rejects(
    c.engine.user("status", { organization_id: c.orgs.A }, "adminB"),
    /denied|scope/,
  );
  await assert.rejects(
    c.asUser("adminA", "billing051_failure", {
      p_id: contract,
      p_lease: randomUUID(),
      p_code: "billing_provider_rejected",
      p_http_status: 400,
      p_stage: "create",
    }),
    /permission denied/,
  );
  await assert.rejects(
    c.service("billing051_failure", {
      p_id: contract,
      p_lease: randomUUID(),
      p_code: "billing_provider_rejected",
      p_http_status: 400,
      p_stage: "create",
    }),
    /billing_lease_conflict/,
  );
});
test("051-F all search pages are inspected; truncated or invalid pages fail closed", async () => {
  let offsets = [];
  const gateway = new MercadoPagoSubscriptions({
    ...opts,
    fetchImpl: async (url) => {
      const off = new URL(url).searchParams.get("offset");
      offsets.push(off);
      return Response.json(
        off === "0"
          ? { results: [{ id: "first" }], paging: { total: 2 } }
          : { results: [{ id: "second" }], paging: { total: 2 } },
      );
    },
  });
  assert.equal((await gateway.find("safe-reference")).length, 2);
  assert.deepEqual(offsets, ["0", "1"]);
  gateway.fetchImpl = async () =>
    Response.json({ results: [], paging: { total: 1 } });
  await assert.rejects(
    gateway.find("safe-reference"),
    /billing_reconciliation_required/,
  );
});
test("051-F HTTP audit allows numeric status and fixed stage only; request/response secrets absent", async () => {
  const logs = [];
  const gateway = new MercadoPagoSubscriptions({
    ...opts,
    fetchImpl: async () =>
      new Response("SENSITIVE-CARD-PAYER", { status: 401 }),
  });
  const server = createBillingServer({
    origin: "http://127.0.0.1",
    log: (x) => logs.push(x),
    billing: { user: () => gateway.request("/preapproval", "POST", {}) },
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/billing/command`,
      {
        method: "POST",
        headers: { Origin: "http://127.0.0.1" },
        body: '{"card_token":"SENSITIVE"}',
      },
    );
    const body = await response.text();
    assert.doesNotMatch(
      body + JSON.stringify(logs),
      /SENSITIVE|PAYER|offline-051-only/,
    );
    assert.equal(logs[0].provider_status, 401);
    assert.equal(logs[0].provider_stage, "create");
    assert.doesNotMatch(body, /provider_status|provider_stage/);
  } finally {
    await new Promise((ok) => server.close(ok));
  }
});
