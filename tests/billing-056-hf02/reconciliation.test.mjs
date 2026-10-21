import { readFile } from "node:fs/promises";
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../billing-047/fixture.mjs';

test('HF02: completed upgrade with correlated proof recovers without PUT', async () => {
  const c = await fixture();
  try {
    await c.db.exec(await readFile("supabase/migrations/202610210057_billing_completed_change_recovery.sql", "utf8"));
    const initial = await c.command();
    const provider = [...c.fake.subscriptions.values()][0];
    await c.command('change', 'profissional');
    await c.rawSQL(`UPDATE private.billing047_contracts
      SET target_effective_at=now()-interval '1 minute',
          target_requested_at=now()-interval '2 minutes'
      WHERE id=$1`, [initial.subscription.id]);
    const invoiceId = c.fake.charge(provider.id, 'approved');
    const invoice = c.fake.invoices.get(invoiceId);
    const payment = c.fake.payments.get(invoice.payment.id);
    // Payment confirmation must follow the change request.
    const confirmedAt = new Date().toISOString();
    payment.date_approved = confirmedAt;
    // Preserve the original provider modification timestamp.
    await c.engine.process(initial.subscription.id);
    const completed = await c.view();
    assert.equal(completed.subscription.code, 'profissional');
    await c.rawSQL(`UPDATE private.billing047_contracts
      SET operation='change', operation_state='uncertain'
      WHERE id=$1 AND target_version IS NULL AND target_amount IS NULL`, [initial.subscription.id]);
    const count = () => c.fake.calls.filter(x => x.method === 'PUT' && x.path.startsWith('/preapproval/')).length;
    const before = count();
    const evidence = await c.rawSQL(`
      SELECT
        c.operation_state,
        c.provider_modified_at,
        c.paid_until,
        (SELECT max(created_at)
         FROM private.billing047_audit
         WHERE contract_id=c.id AND event='change_requested') AS requested,
        (SELECT max(created_at)
         FROM private.billing047_audit
         WHERE contract_id=c.id AND event='plan_changed') AS changed,
        (SELECT max(paid_at)
         FROM private.billing047_payments
         WHERE contract_id=c.id AND state='paid') AS paid
      FROM private.billing047_contracts c
      WHERE c.id=$1
    `, [initial.subscription.id]);

    console.log("HF02_RECOVERY_EVIDENCE", evidence.rows);
    const recovered = await c.engine.process(initial.subscription.id);
    assert.equal(recovered.operation_pending, false);
    assert.equal(count(), before, 'No repeated price PUT');
    const after = await c.view();
    assert.equal(after.subscription.code, 'profissional');
    assert.equal(after.subscription.operation_pending, false, 'Correlated evidence allows recovery');
  } finally {
    await c.db.close();
  }
});
