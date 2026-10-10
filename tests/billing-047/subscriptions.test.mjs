import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "./fixture.mjs";
const c = await fixture();
test.after(() => c.db.close());
let initial;
test("047-01 Essencial: token oficial, preço server-side, trial confirmado e capabilities existentes", async () => {
  initial = await c.command();
  assert.equal(initial.subscription.state, "trialing");
  assert.equal(initial.subscription.price_cents, 4990);
  assert.equal(c.fake.calls.filter(x => x.method === "POST").length, 1);
  const caps = await c.asUser("adminA", "billing_capabilities", { p_org: c.orgs.A });
  assert.equal(caps.software, true); assert.equal(caps.human_support, false);
});
test("047-02 Duas abas / clique duplo reutilizam assinatura; preço/moeda/Assistido adulterados rejeitados", async () => {
  await Promise.all([c.command(), c.command()]);
  assert.equal(c.fake.calls.filter(x => x.method === "POST").length, 1);
  await assert.rejects(c.command("checkout", "essencial", "A", { price: 1 }), /billing_payload_invalid/);
  await assert.rejects(c.command("checkout", "essencial", "A", { currency: "USD" }), /billing_payload_invalid/);
  await assert.rejects(c.command("checkout", "essencial", "A", { plan_version_id: randomUUID() }), /billing_plan_unavailable/);
  await assert.rejects(c.command("checkout", "equipe"), /billing_existing_subscription/);
});
test("047-03 Webhook repetido, retorno simultâneo e versão fora de ordem não duplicam trial/pagamento", async () => {
  const p = [...c.fake.subscriptions.values()][0];
  const hook = Buffer.from(JSON.stringify({ type: "subscription_preapproval", data: { id: p.id }, user_id: 101 }));
  await Promise.all([c.engine.webhook(hook, {}, new URLSearchParams()), c.engine.user("status", { organization_id: c.orgs.A }, "adminA")]);
  const before = (await c.rawSQL("select revision from billing_subscriptions where organization_id=$1", [c.orgs.A])).rows[0].revision;
  await c.engine.webhook(hook, {}, new URLSearchParams());
  const after = (await c.rawSQL("select revision from billing_subscriptions where organization_id=$1", [c.orgs.A])).rows[0].revision;
  assert.equal(before, after);
  assert.equal((await c.rawSQL("select count(*)::int n from private.trial_grants where organization_id=$1", [c.orgs.A])).rows[0].n, 1);
  p.version = -1; await assert.rejects(c.engine.process(initial.subscription.id), /billing_binding_mismatch/); p.version = 0;
});
test("047-04 Isolamento A/B, papel sem grant e payload de tenant divergente rejeitados", async () => {
  await assert.rejects(c.engine.user("status", { organization_id: c.orgs.A }, "adminB"), /denied|scope/);
  await assert.rejects(c.engine.user("status", { organization_id: c.orgs.A }, "worker"), /denied|scope/);
  const p = [...c.fake.subscriptions.values()][0], saved = p.external_reference;
  p.external_reference = randomUUID(); await assert.rejects(c.engine.process(initial.subscription.id), /billing_binding_mismatch/); p.external_reference = saved;
});
test("047-05 Pagamento aprovado confirma período mensal; falha inicia 3 dias e recuperação restaura", async () => {
  const p = [...c.fake.subscriptions.values()][0];
  c.fake.charge(p.id, "approved", { debitAt: new Date(Date.now() - 31 * 86400000).toISOString() });
  const iid = c.fake.charge(p.id, "rejected", { debitAt: new Date(Date.now() - 3600000).toISOString() });
  await c.engine.process(initial.subscription.id);
  assert.equal((await c.view()).subscription.state, "grace_period");
  const f = c.fake.invoices.get(iid);
  c.fake.charge(p.id, "approved", { invoiceId: iid, debitAt: f.debit_date });
  await c.engine.process(initial.subscription.id);
  assert.equal((await c.view()).subscription.state, "active");
});
test("047-06 Cancelamento pago impede renovação e preserva período; reativação não concede novo trial", async () => {
  const canceled = await c.command("cancel"); assert.equal(canceled.subscription.state, "cancel_scheduled");
  assert.equal([...c.fake.subscriptions.values()][0].status, "paused");
  const resumed = await c.command("resume"); assert.equal(resumed.subscription.state, "active");
  assert.equal((await c.rawSQL("select count(*)::int n from private.trial_grants where organization_id=$1", [c.orgs.A])).rows[0].n, 1);
});
test("047-07 Profissional e Equipe: upgrade só após nova cobrança confirmada", async () => {
  const p = [...c.fake.subscriptions.values()][0];
  let v = await c.command("change", "profissional"); assert.equal(v.subscription.code, "essencial");
  assert.equal(p.auto_recurring.transaction_amount, 89.9);
  await c.rawSQL("update private.billing047_contracts set target_effective_at=now()-interval '1 minute',target_requested_at=now()-interval '2 minutes'where id=$1", [initial.subscription.id]);
  c.fake.charge(p.id, "approved"); await c.engine.process(initial.subscription.id);
  v = await c.view(); assert.equal(v.subscription.code, "profissional");
  const caps = await c.asUser("adminA", "billing_capabilities", { p_org: c.orgs.A }); assert.equal(caps.finance, true);
  await c.command("change", "equipe");
  await c.rawSQL("update private.billing047_contracts set target_effective_at=now()-interval '1 minute',target_requested_at=now()-interval '2 minutes'where id=$1", [initial.subscription.id]);
  c.fake.charge(p.id, "approved"); await c.engine.process(initial.subscription.id);
  assert.equal((await c.view()).subscription.code, "equipe");
});
test("047-08 Downgrade não remove membros; excesso bloqueia pedido", async () => {
  await c.rawSQL("update organization_members set status='active'where organization_id=$1 and user_id=$2", [c.orgs.A, c.users.worker]);
  await assert.rejects(c.command("change", "essencial"), /billing_members_exceeded/);
  assert.equal((await c.rawSQL("select status from organization_members where organization_id=$1 and user_id=$2", [c.orgs.A, c.users.worker])).rows[0].status, "active");
  const d = await c.command("change", "profissional"); assert.equal(d.subscription.code, "equipe"); assert.equal(d.subscription.target_version, c.versions.profissional);
});
test("047-09 Trial cancelado interrompe primeira cobrança; histórico persiste", async () => {
  const b = await c.command("checkout", "profissional", "B"); assert.equal(b.subscription.state, "trialing");
  const stopped = await c.command("cancel", null, "B"); assert.equal(stopped.subscription.state, "cancel_scheduled");
  const p = [...c.fake.subscriptions.values()].find(p => p.external_reference === b.subscription.id); assert.equal(p.status, "paused");
  assert.equal(c.fake.invoices.size, 4);
});
