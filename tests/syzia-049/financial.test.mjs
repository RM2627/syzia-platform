import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { MercadoPagoSubscriptions } from "../../server/billing/mercado-pago.mjs";
import { fixture } from "../billing-047/fixture.mjs";
const c = await fixture();
test.after(() => c.db.close());
const secret = "synthetic-049-hmac";
c.gateway.notificationAuth = "hmac";
c.gateway.webhookSecret = secret;
function event(type, id, signId = id) {
  const ts = "1791700000",
    request = "request-049";
  return {
    raw: Buffer.from(JSON.stringify({ type, data: { id }, user_id: 101 })),
    headers: {
      "x-request-id": request,
      "x-signature": `ts=${ts},v1=${createHmac("sha256", secret).update(`id:${signId.toLowerCase()};request-id:${request};ts:${ts};`).digest("hex")}`,
    },
    query: new URLSearchParams({ "data.id": id }),
  };
}
for (const type of [
  "subscription_preapproval",
  "subscription_authorized_payment",
  "payment",
])
  test(`049-F HMAC ${type}: query/body/assinatura íntegros, rejeição de adulteração e ausência`, () => {
    const e = event(type, "ResourceABC");
    assert.equal(
      c.gateway.notification(e.raw, e.headers, e.query).id,
      "ResourceABC",
    );
    assert.throws(
      () => c.gateway.notification(e.raw, {}, e.query),
      /webhook_invalid/,
    );
    assert.throws(
      () =>
        c.gateway.notification(
          e.raw,
          e.headers,
          new URLSearchParams("data.id=OTHER"),
        ),
      /webhook_invalid/,
    );
    assert.throws(
      () =>
        c.gateway.notification(
          e.raw,
          { "x-request-id": "other", "x-signature": e.headers["x-signature"] },
          e.query,
        ),
      /webhook_invalid/,
    );
  });
test("049-F04 três recursos são consultados; webhook repetido não duplica e retorno não substitui consulta", async () => {
  const initial = await c.command();
  const p = [...c.fake.subscriptions.values()][0];
  const invoice = c.fake.charge(p.id);
  for (const [type, id] of [
    ["subscription_preapproval", p.id],
    ["subscription_authorized_payment", invoice],
    ["payment", "payment-" + invoice],
  ]) {
    const e = event(type, id);
    await c.engine.webhook(e.raw, e.headers, e.query);
    await c.engine.webhook(e.raw, e.headers, e.query);
  }
  assert.equal((await c.view()).subscription.state, "active");
  assert.ok(
    c.fake.calls.some((x) => x.path === "/authorized_payments/" + invoice),
  );
  assert.ok(
    c.fake.calls.some((x) => x.path === "/v1/payments/payment-" + invoice),
  );
  assert.equal(
    (
      await c.rawSQL(
        "select count(*)::int n from private.trial_grants where organization_id=$1",
        [c.orgs.A],
      )
    ).rows[0].n,
    1,
  );
  assert.ok(initial.subscription.id);
});
test("049-F05 harness desligado por padrão e sem importação de configuração real", () => {
  const r = spawnSync(
    process.execPath,
    ["scripts/syzia-049/billing-isolated.mjs"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /desativado/);
});
