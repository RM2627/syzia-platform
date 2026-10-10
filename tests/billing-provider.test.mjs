import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  billingProvider,
  handleBillingWebhook,
} from "../server/billing/provider.mjs";
const clock = () => 1800000000000,
  provider = billingProvider("mock", {
    secret: "fictitious_test_secret_not_a_credential_123",
    clock,
  });
const payload = () => ({
  provider: "mock",
  event_id: randomUUID(),
  invoice_id: randomUUID(),
  state: "paid",
  amount_cents: 9900,
});
function request(p = payload()) {
  const raw = Buffer.from(JSON.stringify(p)),
    s = provider.sign(raw);
  return {
    raw,
    headers: {
      "x-billing-timestamp": s.timestamp,
      "x-billing-signature": s.signature,
    },
    provider,
  };
}
test("assinatura válida encaminha apenas campos validados ao banco", async () => {
  let applied;
  await handleBillingWebhook({
    ...request(),
    apply: async (e) => {
      applied = e;
    },
  });
  assert.equal(applied.p_amount, 9900);
  assert.equal(applied.p_state, "paid");
});
test("assinatura inválida nunca chama banco", async () => {
  let calls = 0;
  const r = request();
  r.headers["x-billing-signature"] = "0".repeat(64);
  await assert.rejects(
    handleBillingWebhook({ ...r, apply: async () => calls++ }),
  );
  assert.equal(calls, 0);
});
test("corpo adulterado é recusado", async () => {
  const r = request();
  r.raw = Buffer.from(JSON.stringify({ ...payload(), amount_cents: 1 }));
  await assert.rejects(
    handleBillingWebhook({
      ...r,
      apply: async () => {
        throw Error("Must not execute");
      },
    }),
    /billing_webhook_invalid/,
  );
});
test("expiração e timestamp futuro são recusados", () => {
  for (const offset of [-301, 301]) {
    const raw = request().raw,
      s = provider.sign(raw, String(clock() / 1000 + offset));
    assert.throws(() => provider.verify(raw, s), /billing_webhook_invalid/);
  }
});
test("limite de corpo e JSON malformado recusados", () => {
  for (const raw of [Buffer.alloc(16385), Buffer.from("{")])
    assert.throws(
      () => provider.verify(raw, provider.sign(raw)),
      /billing_webhook_invalid/,
    );
});
test("schema não aceita campos extras, valores inválidos ou provedor real", () => {
  for (const patch of [
    { organization_id: randomUUID() },
    { amount_cents: -1 },
    { amount_cents: 1.5 },
    { provider: "live" },
    { state: "active" },
    { invoice_id: "abc" },
  ]) {
    const raw = Buffer.from(JSON.stringify({ ...payload(), ...patch }));
    assert.throws(
      () => provider.verify(raw, provider.sign(raw)),
      /billing_webhook_invalid/,
    );
  }
});
test("provedor real e segredo fraco indisponíveis", () => {
  assert.throws(() => billingProvider("live", {}), /not_implemented/);
  assert.throws(
    () => billingProvider("mock", { secret: "weak" }),
    /secret_required/,
  );
});
test("falha transacional é propagada sem confirmação falsa", async () => {
  await assert.rejects(
    handleBillingWebhook({
      ...request(),
      apply: async () => {
        throw Error("transaction_failed");
      },
    }),
    /transaction_failed/,
  );
});
