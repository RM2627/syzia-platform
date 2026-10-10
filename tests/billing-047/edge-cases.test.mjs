import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "./fixture.mjs";
const c = await fixture();
test.after(() => c.db.close());
let id;
test("047-10 Retorno e reserva sem token não concedem acesso, trial ou assinatura no provider", async () => {
  id = await c.asUser("adminA", "billing047_prepare", { p_org: c.orgs.A, p_action: "checkout", p_version: c.versions.profissional, p_key: randomUUID(), p_trial: true });
  const result = await c.engine.user("status", { organization_id: c.orgs.A }, "adminA");
  assert.equal(result.subscription.state, "payment_pending"); assert.equal(c.fake.subscriptions.size, 0);
  assert.equal((await c.asUser("adminA", "billing_capabilities", { p_org: c.orgs.A })).software, false);
  await assert.rejects(c.command("checkout", "profissional", "A", { card_token: null }), /billing_payment_method_required/);
  assert.equal((await c.rawSQL("select count(*)::int n from private.trial_grants where organization_id=$1", [c.orgs.A])).rows[0].n, 0);
});
test("047-11 Profissional por checkout em duas abas cria uma assinatura e uma concessão", async () => {
  await Promise.all([c.command("checkout", "profissional"), c.command("checkout", "profissional")]);
  assert.equal(c.fake.subscriptions.size, 1); assert.equal((await c.view()).subscription.state, "trialing");
});
test("047-12 Equipe contratada por checkout e cobrança recusada há 4 dias restringem sem apagar dados", async () => {
  const b = await c.command("checkout", "equipe", "B"); assert.equal(b.subscription.price_cents, 14990);
  const p = [...c.fake.subscriptions.values()].find(x => x.external_reference === b.subscription.id);
  const count = (await c.rawSQL("select count(*)::int n from services where organization_id=$1", [c.orgs.B])).rows[0].n;
  const debitAt = new Date(Date.now() - 4 * 86400000).toISOString();
  const invoiceId = c.fake.charge(p.id, "rejected", { debitAt });
  await c.engine.process(b.subscription.id);
  assert.equal((await c.view("B")).subscription.state, "restricted");
  assert.equal((await c.asUser("adminB", "billing_capabilities", { p_org: c.orgs.B })).software, false);
  assert.equal((await c.rawSQL("select count(*)::int n from services where organization_id=$1", [c.orgs.B])).rows[0].n, count);
  c.fake.charge(p.id, "approved", { invoiceId, debitAt });
  const payload = Buffer.from(JSON.stringify({ type: "subscription_authorized_payment", data: { id: invoiceId } }));
  await c.engine.webhook(payload, {}, new URLSearchParams());
  assert.equal((await c.view("B")).subscription.state, "active");
});
test("047-13 Tolerância expira na autorização mesmo sem cron", async () => {
  const p = [...c.fake.subscriptions.values()][0];
  c.fake.charge(p.id, "rejected"); await c.engine.process(id);
  assert.equal((await c.view()).subscription.state, "grace_period");
  await c.rawSQL("update private.billing047_contracts set grace_until=now()-interval '1 second'where id=$1", [id]);
  assert.equal((await c.view()).subscription.state, "restricted");
  assert.equal((await c.asUser("adminA", "billing_capabilities", { p_org: c.orgs.A })).software, false);
});
test("047-14 Timeout após criar não repete POST; reconciliação recupera por referência", async () => {
  const p = [...c.fake.subscriptions.values()][0];
  await c.rawSQL("update private.billing047_contracts set provider_id=null,operation_state='uncertain',create_started=true where id=$1", [id]);
  const before = c.fake.calls.filter(x => x.method === "POST").length;
  await c.engine.process(id);
  assert.equal(c.fake.calls.filter(x => x.method === "POST").length, before);
  assert.equal((await c.service("billing047_service", { p_action: "get", p_id: id, p_data: {} })).provider_id, p.id);
});
test("047-15 Meio de pagamento atualizado apenas pelo token e confirmação server-side", async () => {
  await c.command("method", null);
  assert.equal([...c.fake.subscriptions.values()][0].card_id, "updated-card-reference");
  const all = JSON.stringify((await c.rawSQL("select to_jsonb(c) row from private.billing047_contracts c")).rows);
  assert.ok(!all.includes("offline-token-for-tests-only"));
});
test("047-16 Cancelamento simultâneo é único; fim do período cancela provider e não concede novo trial", async () => {
  await Promise.all([c.command("cancel", null, "B"), c.command("cancel", null, "B")]);
  const b = await c.view("B"), bid = b.subscription.id;
  await c.rawSQL("update private.billing047_contracts set trial_end=now()-interval '5 days',paid_until=now()-interval '1 second'where id=$1", [bid]);
  await c.engine.process(bid);
  assert.equal([...c.fake.subscriptions.values()].find(x => x.external_reference === bid).status, "canceled");
  // Historical approved invoice is already ended in this scenario too.
  await c.rawSQL("update private.billing047_contracts set paid_until=now()-interval '1 second'where id=$1", [bid]);
  await assert.rejects(c.command("checkout", "equipe", "B"), /billing_trial_changed/);
  const renewed = await c.command("checkout", "equipe", "B", { trial_expected: false });
  assert.equal(renewed.subscription.state, "payment_pending");
  const np = [...c.fake.subscriptions.values()].find(x => x.external_reference === renewed.subscription.id);
  assert.equal(np.preapproval_plan_id, "equipe-paid"); assert.equal(np.auto_recurring.free_trial, undefined);
  // A late notification for the former contract cannot replace the current local projection.
  const projection = (await c.rawSQL("select to_jsonb(s) row from billing_subscriptions s where organization_id=$1", [c.orgs.B])).rows[0].row;
  const oldProvider = [...c.fake.subscriptions.values()].find(x => x.external_reference === bid);
  await c.engine.webhook(Buffer.from(JSON.stringify({ type: "subscription_preapproval", data: { id: oldProvider.id } })), {}, new URLSearchParams());
  assert.deepEqual((await c.rawSQL("select to_jsonb(s) row from billing_subscriptions s where organization_id=$1", [c.orgs.B])).rows[0].row, projection);
  assert.equal((await c.view("B")).subscription.id, renewed.subscription.id);
});
test("047-17 Alterar catálogo durante checkout não muda contrato reservado nem preço", async () => {
  const reserved = await c.service("billing047_service", { p_action: "get", p_id: id, p_data: {} });
  await c.rawSQL("update billing_plans set revision=revision+1 where id=(select plan_id from billing_plan_versions where id=$1)", [c.versions.profissional]);
  await assert.rejects(c.command("checkout", "profissional"), /billing_plan_unavailable/);
  assert.equal(reserved.amount_cents, 8990);
});
test("047-18 Suspensão administrativa não é retirada por pagamento recuperado", async () => {
  await c.rawSQL("update billing_subscriptions set state='suspended'where organization_id=$1", [c.orgs.A]);
  const p = [...c.fake.subscriptions.values()][0]; c.fake.charge(p.id, "approved"); await c.engine.process(id);
  assert.equal((await c.asUser("adminA", "billing_capabilities", { p_org: c.orgs.A })).software, false);
});
