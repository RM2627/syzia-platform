// Owner-run configuration only; dry-run by default. Never creates/changes commercial versions.
import { readFile } from 'node:fs/promises';
import { billingRuntime } from '../../server/billing/runtime.mjs';
import { commercialPrices } from '../../server/billing/mercado-pago.mjs';
const file = process.argv.find(x => x.startsWith('--file='))?.slice(7);
if (!file) throw Error('Use --file=path-to-mapping.json [--apply-test]');
const entries = JSON.parse(await readFile(file, 'utf8'));
if (!Array.isArray(entries) || entries.length !== 3 || new Set(entries.map(x => x.code)).size !== 3) throw Error('billing_plan_mapping_invalid');
for (const e of entries) {
  if (!commercialPrices[e.code] || !/^[a-f0-9-]{36}$/i.test(e.plan_version_id || '') || !e.trial_plan_id || !e.paid_plan_id || e.trial_plan_id === e.paid_plan_id || Object.keys(e).some(k => !['code','plan_version_id','trial_plan_id','paid_plan_id'].includes(k))) throw Error('billing_plan_mapping_invalid');
}
if (!process.argv.includes('--apply-test')) {
  console.log(JSON.stringify({ mode:'dry-run', externalRequests:0, entries:entries.map(e=>({code:e.code,price_cents:commercialPrices[e.code],currency:'BRL',cycle:'monthly',trial_days:7})) },null,2));
} else {
  // Separate operator assertion prevents using this test helper as a production activation path.
  if (process.env.SYZIA_TEST_ACCOUNTS_CONFIRMED !== 'true') throw Error('billing_test_accounts_required');
  try {
    const { gateway, service } = billingRuntime();
    if (!gateway) throw Error('billing_credentials_missing');
    for (const e of entries) {
      const offer={code:e.code,amount_cents:commercialPrices[e.code],currency:'BRL',interval_months:1};
      await gateway.plan(e.trial_plan_id,offer,true);
      await gateway.plan(e.paid_plan_id,offer,false);
    }
    // Each mapping is an idempotent SQL transaction; no subscriptions or payments are created.
    for (const e of entries) await service('billing047_offer_set',{p_code:e.code,p_version:e.plan_version_id,p_trial_plan:e.trial_plan_id,p_paid_plan:e.paid_plan_id});
    console.log(JSON.stringify({status:'configured',codes:entries.map(e=>e.code)}));
  } catch(e) { console.error(/^billing_[a-z_]+$/.test(e?.message||'')?e.message:'billing_configuration_failed');process.exitCode=1; }
}
