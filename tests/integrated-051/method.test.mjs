import test, {describe, before, after} from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../billing-047/fixture.mjs';
describe('Integrated method',()=>{
let c,original;
before(async()=>{c=await fixture();original=c.gateway.fetchImpl;});
after(()=>c?.db.close());
let a,b,p,trial,invoice;
test('INT-D01 post-trial rejection yields grace and only verified tenant payment history',async()=>{
 c.gateway.fetchImpl=async(url,init)=>{
  const r=await original(url,init);
  if(new URL(url).pathname==='/preapproval'&&init.method==='POST'){
   const body=await r.json();const live=c.fake.subscriptions.get(body.id);
   live.date_created=new Date(Date.now()-40*86400000).toISOString();live.next_payment_date=new Date(Date.parse(live.date_created)+7*86400000).toISOString();return Response.json(live);
  }return r;
 };
 a=(await c.command()).subscription;p=c.fake.subscriptions.get([...c.fake.subscriptions.keys()][0]);
 assert.equal(a.state,'payment_pending');trial=[a.trial_start,a.trial_end];
 invoice=c.fake.charge(p.id,'rejected',{debitAt:new Date(Date.now()-86400000).toISOString()});
 c.fake.payments.get('payment-'+invoice).card={id:p.card_id,last_four_digits:'1111'};
 await c.engine.process(a.id);
 const v=(await c.view()).subscription;
 assert.equal(v.state,'grace_period');assert.equal(v.method_last_four,'1111');assert.equal(v.payments.length,1);assert.equal(v.payments[0].state,'failed');
 assert.equal((await c.view('B')).subscription,null);
 await assert.rejects(c.engine.user('status',{organization_id:c.orgs.A},'adminB'),/denied|scope/);
});
test('INT-D02 definitive card-update 400 permits new explicit attempt and preserves grace, trial and subscription',async()=>{
 c.gateway.fetchImpl=async(url,init)=>init.method==='PUT'?new Response('{}',{status:400}):original(url,init);
 await assert.rejects(c.command('method'),/billing_provider_invalid_request/);
 const v=(await c.view()).subscription;assert.equal(v.state,'grace_period');assert.equal(v.method_retryable,true);assert.equal(v.operation_pending,false);
 assert.deepEqual([v.trial_start,v.trial_end],trial);assert.equal(c.fake.subscriptions.size,1);
});
test('INT-D03 successful update is confirmed by PUT response plus GET, never settles failed invoice or resets trial',async()=>{
 c.gateway.fetchImpl=original;const count=c.fake.calls.filter(x=>x.method==='POST').length;
 const v=(await c.command('method')).subscription;
 assert.equal(v.state,'grace_period');assert.equal(v.operation_pending,false);assert.equal(v.payments[0].state,'failed');assert.equal(v.method_last_four,null);
 assert.deepEqual([v.trial_start,v.trial_end],trial);assert.equal(c.fake.calls.filter(x=>x.method==='POST').length,count);
 assert.equal((await c.rawSQL('select count(*)::int n from private.trial_grants where organization_id=$1',[c.orgs.A])).rows[0].n,1);
});
test('INT-D04 only official recovered payment restores active access; repeated webhook effects are idempotent',async()=>{
 c.fake.charge(p.id,'approved',{invoiceId:invoice,debitAt:c.fake.invoices.get(invoice).debit_date});
 const raw=Buffer.from(JSON.stringify({type:'subscription_authorized_payment',data:{id:invoice}}));
 await c.engine.webhook(raw,{},new URLSearchParams());await c.engine.webhook(raw,{},new URLSearchParams());
 const v=(await c.view()).subscription;assert.equal(v.state,'active');assert.equal(v.payments.length,1);assert.equal(v.payments[0].state,'paid');
 assert.deepEqual([v.trial_start,v.trial_end],trial);
});
test('INT-D05 timeout after update recovers by reading existing card, no second PUT, POST or trial',async()=>{
 b=(await c.command('checkout','profissional','B')).subscription;
 c.gateway.fetchImpl=async(url,init)=>{const r=await original(url,init);if(init.method==='PUT')throw Error('uncertain-no-secret');return r;};
 await assert.rejects(c.command('method',null,'B'),/billing_provider_unavailable/);
 const count=c.fake.calls.filter(x=>x.method!=='GET').length;
 c.gateway.fetchImpl=original;await c.engine.process(b.id);
 assert.equal(c.fake.calls.filter(x=>x.method!=='GET').length,count);
 const v=(await c.view('B')).subscription;assert.equal(v.operation_pending,false);assert.equal(v.trial_end,b.trial_end);
});
test('INT-D06 timeout without observed change remains pending; new token cannot replay a possibly sent update',async()=>{
 c.gateway.fetchImpl=async(url,init)=>{if(init.method==='PUT')throw Error('before-response');return original(url,init);};
 await assert.rejects(c.command('method',null,'B'),/billing_provider_unavailable/);
 let puts=0;c.gateway.fetchImpl=async(url,init)=>{if(init.method==='PUT')puts++;return original(url,init);};
 await c.command('method',null,'B');await c.engine.process(b.id);
 assert.equal(puts,0);assert.equal((await c.view('B')).subscription.operation_pending,true);
 const live=[...c.fake.subscriptions.values()].find(x=>x.external_reference===b.id);live.card_id='official-new-card-after-delay';live.version++;
 await c.engine.process(b.id);assert.equal((await c.view('B')).subscription.operation_pending,false);
});
test('INT-D07 mismatched existing amount prevents card mutation; no unauthenticated or cross-tenant mutation',async()=>{
 const amount=p.auto_recurring.transaction_amount;p.auto_recurring.transaction_amount=0.01;
 const before=c.fake.calls.filter(x=>x.method!=='GET').length;
 await assert.rejects(c.command('method'),e=>e.validationCheck==='amount');
 assert.equal(c.fake.calls.filter(x=>x.method!=='GET').length,before);p.auto_recurring.transaction_amount=amount;
 for(const who of ['worker','adminB']) await assert.rejects(c.engine.user('command',{organization_id:c.orgs.A,action:'method',request_key:crypto.randomUUID(),card_token:'offline-method-token'},who),/denied|scope/);
});

});
