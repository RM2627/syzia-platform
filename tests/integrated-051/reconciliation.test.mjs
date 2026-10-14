import test, {describe, before, after} from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from '../billing-047/fixture.mjs';
import { safeDiagnostic } from '../../server/billing/diagnostics.mjs';
describe('Integrated reconciliation',()=>{
let c;
before(async()=>{c=await fixture();});
after(()=>c?.db.close());
let id,p;
test('INT-B01 subscription_linked followed by invalid version reproduces mismatch; diagnosis names only the check',async()=>{
 const original=c.gateway.fetchImpl;
 c.gateway.fetchImpl=async(url,init)=>{
  const r=await original(url,init);
  if(new URL(url).pathname.startsWith('/preapproval/') && !new URL(url).pathname.endsWith('search')) {const body=await r.json();body.version='0';return Response.json(body);}
  return r;
 };
 await assert.rejects(c.command(),e=>e.code==='billing_binding_mismatch' && e.validationCheck==='version');
 id=(await c.view()).subscription.id;p=[...c.fake.subscriptions.values()][0];
 const b=await c.service('billing047_service',{p_action:'get',p_id:id,p_data:{}});
 assert.equal(b.provider_id,p.id);assert.equal(b.create_started,true);assert.equal(b.operation_state,'uncertain');assert.equal(b.validation_check,'version');
 assert.equal((await c.asUser('adminA','billing_capabilities',{p_org:c.orgs.A})).software,false);
 c.gateway.fetchImpl=original;
});
test('INT-B02 valid existing official snapshot reconciles old uncertain contract with no POST and once-only trial',async()=>{
 const count=c.fake.calls.filter(x=>x.method==='POST').length;
 await c.engine.process(id);await c.engine.process(id);
 assert.equal((await c.view()).subscription.state,'trialing');
 assert.equal(c.fake.calls.filter(x=>x.method==='POST').length,count);
 assert.equal((await c.rawSQL('select count(*)::int n from private.trial_grants where organization_id=$1',[c.orgs.A])).rows[0].n,1);
});
for(const [check,mutate] of [
 ['provider_id',x=>x.id='unrelated'],['external_reference',x=>x.external_reference=randomUUID()],['collector_id',x=>x.collector_id=909],['application_id',x=>x.application_id=909],['plan_id',x=>x.preapproval_plan_id='different'],['payer_id',x=>x.payer_id=909],['recurrence',x=>x.auto_recurring.frequency=2],['currency',x=>x.auto_recurring.currency_id='USD'],['amount',x=>x.auto_recurring.transaction_amount=0.01],['status',x=>x.status='approved'],['trial_duration',x=>x.auto_recurring.free_trial.frequency=8],['first_charge',x=>x.next_payment_date=x.date_created],['trial_dates',x=>x.date_created=new Date(Date.parse(x.date_created)-86400000).toISOString()]
]) test('INT-B03 '+check+': mismatch blocks mutation and preserves history',async()=>{
 const original=c.gateway.read;const before=c.fake.calls.filter(x=>x.method!=='GET').length;
 c.gateway.read=async providerId=>{const x=await original.call(c.gateway,providerId);mutate(x);return x;};
 await assert.rejects(c.engine.process(id),e=>e.validationCheck===check);
 assert.equal(c.fake.calls.filter(x=>x.method!=='GET').length,before);
 const b=await c.service('billing047_service',{p_action:'get',p_id:id,p_data:{}});assert.equal(b.validation_check,check);assert.equal(b.provider_id,p.id);
 c.gateway.read=original;await c.engine.process(id);
});
test('INT-B04 invoice payer mismatch is identified; raw values never enter safe diagnosis',async()=>{
 const invoice=c.fake.charge(p.id);const payment=c.fake.payments.get('payment-'+invoice);payment.payer.id=404;
 await assert.rejects(c.engine.process(id),e=>{assert.deepEqual(safeDiagnostic(e),{validation_check:'payment_payer'});return e.code==='billing_binding_mismatch';});
 payment.payer.id=303;await c.engine.process(id);
 assert.deepEqual(safeDiagnostic({validationCheck:'private-person@example.invalid'}),{});
});
test('INT-B05 timeout after possible creation, empty/multiple search never repeats POST or grants access',async()=>{
 const original=c.gateway.fetchImpl;
 c.gateway.fetchImpl=async(url,init)=>{const r=await original(url,init);if(new URL(url).pathname==='/preapproval'&&init.method==='POST')throw Error('private transport');return r;};
 await assert.rejects(c.command('checkout','equipe','B'),/billing_provider_unavailable/);
 const bid=(await c.view('B')).subscription.id;const count=c.fake.calls.filter(x=>x.method==='POST').length;
 c.gateway.fetchImpl=original;
 const find=c.gateway.find;
 for(const results of [[],[{external_reference:bid},{external_reference:bid}]]){
  c.gateway.find=async()=>results;
  await assert.rejects(c.engine.process(bid),/billing_reconciliation_required/);
  assert.equal((await c.asUser('adminB','billing_capabilities',{p_org:c.orgs.B})).software,false);
 }
 c.gateway.find=find;await c.engine.process(bid);
 assert.equal(c.fake.calls.filter(x=>x.method==='POST').length,count);
});
test('INT-B06 leased work is pending, not a successful or financially confirmed reconciliation',async()=>{
 const leased=await c.service('billing047_service',{p_action:'lease',p_id:id,p_data:{}});
 const result=await c.engine.reconcile();assert.ok(result.pending>=1);assert.ok(result.confirmed<result.inspected);
 await c.service('billing047_service',{p_action:'release',p_id:id,p_data:{lease:leased.lease}});
});

});
