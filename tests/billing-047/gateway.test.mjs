import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { MercadoPagoSubscriptions, monthAfter, verifiedSnapshot } from "../../server/billing/mercado-pago.mjs";
import { createBillingServer } from "../../server/billing/http.mjs";
import { fakeMercadoPago } from "./fake-provider.mjs";
const opts = { accessToken: "offline-only", collectorId: 101, applicationId: 202, publicKey: "public-offline", notificationUrl: "https://api.example.invalid/billing/notifications", appOrigin: "https://app.example.invalid" };
test("047-19 Credencial ausente, moeda/plano não aprovado, URL insegura falham fechados", async () => {
  assert.throws(() => new MercadoPagoSubscriptions({ ...opts, accessToken: "" }), /billing_credentials_missing/);
  assert.throws(() => new MercadoPagoSubscriptions({ ...opts, notificationUrl: "http://unsafe.invalid" }), /billing_configuration_invalid/);
  const fake = fakeMercadoPago(), g = new MercadoPagoSubscriptions({ ...opts, fetchImpl: fake.fetchImpl });
  await assert.rejects(g.plan("equipe-trial", { code: "assistido", amount_cents: 14990, currency: "BRL", interval_months: 1 }, true), /billing_plan_unavailable/);
  await assert.rejects(g.plan("equipe-trial", { code: "equipe", amount_cents: 14990, currency: "USD", interval_months: 1 }, true), /billing_plan_unavailable/);
});
test("047-20 Provider indisponível, resposta inválida, timeout e redirects não expõem payload", async () => {
  const g = fetchImpl => new MercadoPagoSubscriptions({ ...opts, fetchImpl, timeoutMs: 10 });
  await assert.rejects(g(async () => new Response('sensitive-provider-error', { status: 503 })).read('x'), /billing_provider_unavailable/);
  await assert.rejects(g(async () => new Response('invalid')).read('x'), /billing_response_invalid/);
  await assert.rejects(g(async (_url, init) => { assert.equal(init.redirect, 'error'); throw Error('secret-in-error'); }).read('x'), /billing_provider_unavailable/);
  await assert.rejects(g((_url, init) => new Promise((_ok, no) => init.signal.addEventListener('abort', () => no(Error('abort'))))).read('x'), /billing_timeout/);
});
test("047-21 HMAC aplicável: assinatura válida aceita; adulteração e tenant divergente recusados", () => {
  const secret = "offline-HMAC-test-only", g = new MercadoPagoSubscriptions({ ...opts, notificationAuth: "hmac", webhookSecret: secret });
  const raw = Buffer.from(JSON.stringify({ type: "subscription_preapproval", data: { id: "abc" }, user_id: 101 }));
  const ts = "1780000000", rid = "request-1", v1 = createHmac("sha256", secret).update(`id:abc;request-id:${rid};ts:${ts};`).digest("hex");
  assert.equal(g.notification(raw, { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": rid }, new URLSearchParams()).id, "abc");
  assert.throws(() => g.notification(raw, { "x-signature": `ts=${ts},v1=${'0'.repeat(64)}`, "x-request-id": rid }, new URLSearchParams()), /billing_webhook_invalid/);
  assert.throws(() => g.notification(Buffer.from(raw.toString().replace('101','999')), {}, new URLSearchParams()), /billing_binding_mismatch/);
  assert.throws(() => g.notification(raw, {}, new URLSearchParams('data.id=different')), /billing_webhook_invalid/);
});
test("047-22 Notificação de recurso sem HMAC é apenas indício; data e status do payload não liberam acesso", () => {
  const g = new MercadoPagoSubscriptions(opts);
  assert.deepEqual(g.notification(Buffer.from(JSON.stringify({ type: "subscription_authorized_payment", data: { id: "42", status: "approved" }, status: "active", amount: 1 })), { "x-signature": "unverifiable-subscription-header" }, new URLSearchParams()), { type: "subscription_authorized_payment", id: "42" });
});
test("047-23 Pagamento aprovado em fatura não basta: consulta pagamento e valida recebedor", async () => {
  const fake = fakeMercadoPago(), g = new MercadoPagoSubscriptions({ ...opts, fetchImpl: fake.fetchImpl });
  const b = { id: 'checkout-reference', organization_id: 'org', provider_plan_id: 'essencial-trial', code: 'essencial', amount_cents: 4990, currency: 'BRL', interval_months: 1, trial_reserved: true };
  const p = await g.create(b, 'offline-token-long-enough', 'test@example.invalid'); b.provider_id=p.id;
  const invoice = fake.charge(p.id); fake.payments.get('payment-'+invoice).collector_id=999;
  await assert.rejects(verifiedSnapshot(g,b), /billing_binding_mismatch/);
});
test("047-24 Ciclo mensal respeita fim do mês sem inventar 30 dias fixos", () => {
  assert.equal(monthAfter('2028-01-31T12:30:00Z'), '2028-02-29T12:30:00.000Z');
  assert.equal(monthAfter('2027-01-31T12:30:00Z'), '2027-02-28T12:30:00.000Z');
});
test("047-25 HTTP rejeita origem, não usa back_url como confirmação e logs não contêm segredos", async () => {
  const logs = [], server = createBillingServer({ origin: 'http://127.0.0.1:5173', log: r => logs.push(r), billing: { user: async () => { throw Error('Access-Token-card-token-CVV-secret'); }, webhook: async () => ({ accepted:true }) } });
  await new Promise(ok => server.listen(0,'127.0.0.1',ok));
  try {
    const base='http://127.0.0.1:'+server.address().port;
    assert.equal((await fetch(base+'/billing/command',{method:'POST',headers:{Origin:'https://evil.invalid'}})).status,403);
    const r=await fetch(base+'/billing/command',{method:'POST',headers:{Origin:'http://127.0.0.1:5173','Content-Type':'application/json',Authorization:'Bearer secret-token'},body:JSON.stringify({card_token:'private-transient-card-token'})});
    const data=await r.text(); assert.ok(!data.includes('CVV')); assert.ok(!JSON.stringify(logs).includes('secret')); assert.ok(!JSON.stringify(logs).includes('private-transient'));
    assert.equal((await fetch(base+'/billing/back_url',{method:'POST',headers:{Origin:'http://127.0.0.1:5173'}})).status,404);
  } finally { await new Promise(ok=>server.close(ok)); }
});
