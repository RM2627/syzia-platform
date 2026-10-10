import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSubscription,
  internalBillingEvent,
  billingAdapterContract,
} from "../server/billing/contract.mjs";
import {
  changeHostedPlan,
  synchronizeWebhook,
  hostedCheckout,
} from "../server/billing/hosted-checkout.mjs";
const org = "30000000-0000-0000-0000-000000000001",
  plan = "30000000-0000-0000-0000-000000000002",
  key = "30000000-0000-0000-0000-000000000003";
const valid = {
  id: "test-subscription",
  checkoutId: "test-checkout",
  planVersion: plan,
  amount: 15900,
  currency: "BRL",
  status: "active",
  sequence: 1,
  periodStart: "2026-09-25T12:00:00Z",
  periodEnd: "2026-10-25T12:00:00Z",
};
test("Vocabulário independente de fornecedor inclui confirmação, falha, suspensão e cancelamento", () => {
  for (const status of billingAdapterContract.states)
    assert.match(
      internalBillingEvent(normalizeSubscription({ ...valid, status })),
      /^billing\./,
    );
  assert.throws(() =>
    normalizeSubscription({ ...valid, status: "paid_by_browser" }),
  );
  assert.throws(() => normalizeSubscription({ ...valid, amount: -1 }));
  assert.throws(() => normalizeSubscription({ ...valid, currency: "USD" }));
});
test("Upgrade e downgrade reservam versão/preço no servidor sem ativar por resposta do provider", async () => {
  for (const effective of ["immediate_after_confirmation", "period_end"]) {
    let called = 0;
    const adapter = {
      name: "test_contract",
      mode: "test",
      createCheckout: async () => {},
      verifyWebhook: async () => {},
      readSubscription: async () => {},
      cancelAtPeriodEnd: async () => {},
      resume: async () => {},
      changePlan: async (a) => {
        assert.equal(a.planVersion, plan);
        assert.equal(a.amount, 15900);
        assert.equal(a.idempotencyKey, key);
        called++;
      },
    };
    const store = {
      reservePlanChange: async (a) => {
        assert.equal(a.actor, org);
        return {
          id: key,
          providerSubscriptionId: "test-subscription",
          plan_version_id: plan,
          amount_cents: 15900,
          currency: "BRL",
          interval_months: 1,
          effective,
        };
      },
    };
    const r = await changeHostedPlan({
      body: { organization_id: org, plan_id: plan, request_key: key },
      token: "local",
      auth: async () => ({ id: org }),
      adapter,
      store,
    });
    assert.equal(r.pendingConfirmation, true);
    assert.equal(called, 1);
    assert.equal(r.effective, effective);
    await assert.rejects(
      changeHostedPlan({
        body: {
          organization_id: org,
          plan_id: plan,
          request_key: key,
          price_cents: 1,
        },
        adapter,
      }),
      /payload_invalid/,
    );
  }
});
test("Provider ausente não usa mock e não escreve no store", async () => {
  let calls = 0;
  await assert.rejects(
    hostedCheckout({ adapter: null, store: { reserve: async () => calls++ } }),
    /not_configured/,
  );
  await assert.rejects(changeHostedPlan({ adapter: null }), /not_configured/);
  assert.equal(calls, 0);
});
test("Webhook autenticado é normalizado antes da aplicação; payload e confirmação divergentes não entram", async () => {
  let applied = null;
  const adapter = {
    name: "test_contract",
    mode: "test",
    createCheckout: async () => {},
    verifyWebhook: async () => ({
      id: "event-039",
      subscriptionId: "test-subscription",
    }),
    readSubscription: async () => valid,
    cancelAtPeriodEnd: async () => {},
    resume: async () => {},
  };
  const binding = {
    providerSubscriptionId: valid.id,
    providerCheckoutId: valid.checkoutId,
    currency: "BRL",
    amount_cents: 15900,
    plan_version_id: plan,
  };
  const store = {
    lookup: async () => binding,
    apply: async (e) => {
      applied = e;
      return { ok: true };
    },
  };
  await synchronizeWebhook({
    raw: Buffer.from("{}"),
    headers: {},
    adapter,
    store,
  });
  assert.equal(applied.type, "billing.confirmed");
  assert.equal(applied.state.planVersion, plan);
  binding.amount_cents = 1;
  await assert.rejects(
    synchronizeWebhook({ raw: Buffer.from("{}"), headers: {}, adapter, store }),
    /binding_mismatch/,
  );
});
