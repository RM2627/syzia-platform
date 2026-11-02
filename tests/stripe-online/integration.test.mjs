import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { fixture } from './fixture.mjs';
import { stripeController } from '../../server/billing/stripe/controller.mjs';
const body=(c,offer='monthly',org='A')=>({organization_id:c.orgs[org],action:'checkout',offer,request_key:randomUUID(),trial_expected:true,accepted:true});
test('Fase 3 — Supabase SQL authority + official-shaped simulated Stripe',async t=>{
 const c=await fixture();let aid,sub;
 try{
  await t.test('migration defaults closed, old plans/mappings unchanged',async()=>{
   const v=await c.onlineView();assert.equal(v.checkout_mode,'disabled');assert.equal(v.confirmation_enabled,false);
   assert.deepEqual(v.catalog.map(x=>x.price_cents),[5990,29940,47880]);assert.deepEqual(v.catalog.map(x=>x.interval_months),[1,6,12]);
   assert.deepEqual((await c.view()).catalog.map(x=>x.price_cents),[4990,8990,14990]);
   await assert.rejects(c.engine.user('command',body(c),'adminA'),/disabled/);
   assert.equal(c.calls.filter(x=>x.method==='POST').length,0);
  });
  await t.test('RLS/FORCE RLS and service RPC remain inaccessible to browser',async()=>{
   const rows=(await c.rawSQL("select relrowsecurity,relforcerowsecurity from pg_class where relnamespace='private'::regnamespace and relname like 'billing069_%' and relkind='r'")).rows;
   assert.equal(rows.length,5);assert.ok(rows.every(x=>x.relrowsecurity&&x.relforcerowsecurity));
   await assert.rejects(c.asUser('adminA','billing069_service',{p_action:'runtime',p_id:null,p_data:{}}),/permission denied/);
   await assert.rejects(c.asUser('adminA','billing069_preflight',{}),/access_denied/);
   assert.equal((await c.asUser('root','billing069_preflight',{})).allowed,true);
  });
  await c.configure();
  await t.test('authentication, organization isolation and test allowlist',async()=>{
   await assert.rejects(c.engine.user('command',body(c),'missing'),/access_denied/);
   await assert.rejects(c.engine.user('command',body(c),'adminB'),/permission_denied/);
   await c.configure('stripe',true,[c.orgs.B]);
   await assert.rejects(c.engine.user('command',body(c),'adminA'),/disabled/);await c.configure();
  });
  await t.test('concurrent tabs reserve one existing financial contract; trial pending until official reads',async()=>{
   const results=await Promise.allSettled([c.engine.user('command',body(c),'adminA'),c.engine.user('command',body(c),'adminA')]);
   assert.ok(results.some(r=>r.status==='fulfilled'));const v=await c.onlineView();aid=v.subscription.id;
   assert.equal(v.subscription.state,'payment_pending');
   assert.equal(c.calls.filter(x=>x.path==='/checkout/sessions'&&x.method==='POST').length,1);
   const s=(await c.rawSQL('select state from public.billing_subscriptions where organization_id=$1',[c.orgs.A])).rows[0];assert.equal(s.state,'pending');
   assert.equal((await c.rawSQL('select count(*)::int n from private.trial_grants where organization_id=$1',[c.orgs.A])).rows[0].n,0);
   const post=c.calls.find(x=>x.path==='/checkout/sessions'&&x.method==='POST');
   assert.equal(post.body['allowed_payment_method_types[0]'],'card');assert.ok(!Object.hasOwn(post.body,'payment_method_types[0]'));
   assert.equal(post.body['subscription_data[trial_period_days]'],'7');assert.equal(post.body['line_items[0][price]'],'price_monthly');
  });
  await t.test('Mercado Pago cannot lease or prepare mutations against a Stripe binding',async()=>{
   await assert.rejects(c.service('billing047_service',{p_action:'lease',p_id:aid,p_data:{}}),/provider_mismatch/);
   assert.ok(!(await c.service('billing047_service',{p_action:'list',p_id:null,p_data:{}})).includes(aid));
   await assert.rejects(c.command('cancel'),/provider_mismatch/);
  });
  await t.test('trial confirmed via GET applies to existing trial/capability ledger once',async()=>{
   sub=await c.complete(aid);sub.cancel_at_period_end=true;c.objects.set(sub.id,sub);
   await c.engine.process(aid);assert.equal((await c.onlineView()).subscription.state,'cancel_scheduled');
   await c.engine.user('command',{organization_id:c.orgs.A,action:'resume',request_key:randomUUID()},'adminA');await c.engine.process(aid);
   const v=await c.onlineView();assert.equal(v.subscription.state,'trialing');
   assert.equal((await c.rawSQL('select count(*)::int n from private.trial_grants where organization_id=$1',[c.orgs.A])).rows[0].n,1);
   assert.equal((await c.rawSQL('select private.billing_effective(s) state from public.billing_subscriptions s where organization_id=$1',[c.orgs.A])).rows[0].state,'trial');
   assert.match((await c.rawSQL('select reason from private.trial_grants where organization_id=$1',[c.orgs.A])).rows[0].reason,/Stripe/);
  });
  await t.test('raw signature, replay dedupe, no raw body persisted; receipt survives controller restart',async()=>{
   const e={id:'evt_valid',type:'customer.subscription.updated',livemode:false,data:{object:{id:sub.id,metadata:sub.metadata,customer:sub.customer,email:'never-store@example.invalid'}}};
   const raw=Buffer.from(JSON.stringify(e)),now=Math.floor(Date.now()/1000),sig='t='+now+',v1='+createHmac('sha256',c.cfg.webhookSecret).update(`${now}.`).update(raw).digest('hex');
   await assert.rejects(c.engine.webhook(raw,{'stripe-signature':sig.replace('v1=','v1=f')}),/signature/);
   await c.engine.webhook(raw,{'stripe-signature':sig});await c.engine.webhook(raw,{'stripe-signature':sig});
   let rows=(await c.rawSQL('select * from private.billing069_inbox')).rows;assert.equal(rows.length,1);assert.equal(rows[0].status,'pending');assert.ok(!JSON.stringify(rows).includes('never-store'));
   const restarted=stripeController({gateway:c.gateway,service:c.service,asUser:c.asUser,auth:async()=>null,mode:'disabled'});
   await restarted.reconcile();rows=(await c.rawSQL('select * from private.billing069_inbox')).rows;assert.equal(rows[0].status,'done');
  });
  await t.test('false event order/foreign customer never changes entitlement',async()=>{
   const stored=c.objects.get(sub.id);c.objects.set(sub.id,{...stored,customer:'cus_foreign'});
   await assert.rejects(c.engine.process(aid),/mismatch/);c.objects.set(sub.id,stored);await c.engine.process(aid);
   assert.equal((await c.onlineView()).subscription.state,'trialing');
  });
  await t.test('cancel/resume uses original provider while acquisitions are disabled',async()=>{
   await c.configure('disabled');const managed=stripeController({gateway:c.gateway,service:c.service,asUser:c.asUser,auth:async k=>({id:c.users[k]}),mode:'disabled'});
   await managed.user('command',{organization_id:c.orgs.A,action:'cancel',request_key:randomUUID()},'adminA');
   assert.equal((await c.onlineView()).subscription.state,'cancel_scheduled');
   await managed.user('command',{organization_id:c.orgs.A,action:'resume',request_key:randomUUID()},'adminA');assert.equal((await c.onlineView()).subscription.state,'trialing');await c.configure();
  });
  await t.test('semiannual full-period invoice and fixed amount; no monthly installments',async()=>{
   const r=await c.engine.user('command',body(c,'semiannual','B'),'adminB');const id=r.subscription.id;
   const row=await c.sql('get',id);assert.equal(row.amount_cents,29940);assert.equal(row.interval_months,6);
   await c.complete(id,{paid:true});await c.engine.process(id);assert.equal((await c.onlineView('adminB')).subscription.state,'active');
   assert.equal((await c.rawSQL('select amount_cents from private.billing047_payments where contract_id=$1',[id])).rows[0].amount_cents,29940);
  });
  await t.test('environment mappings immutable and alternate account cannot query contracts',async()=>{
   await assert.rejects(c.service('billing069_service',{p_action:'get',p_id:aid,p_data:{environment:'production',account_id:c.cfg.account}}),/provider_mismatch/);
   await assert.rejects(c.service('billing069_configure',{p_mode:'disabled',p_environment:'test',p_confirmation:false,p_test_orgs:[],p_entries:[{code:'monthly',account_id:'acct_other',product_id:c.cfg.product,price_id:c.cfg.prices.monthly}]}),/immutable/);
  });
  await t.test('unbound existing POC subscription does not become an organization or clog the inbox',async()=>{
   const raw=Buffer.from(JSON.stringify({id:'evt_foreign',type:'customer.subscription.updated',livemode:false,data:{object:{id:'sub_unbound'}}})),now=Math.floor(Date.now()/1000);
   const signature=`t=${now},v1=`+createHmac('sha256',c.cfg.webhookSecret).update(`${now}.`).update(raw).digest('hex');
   await c.engine.webhook(raw,{'stripe-signature':signature});await c.engine.reconcile();
   assert.equal((await c.rawSQL("select status from private.billing069_inbox where event_id='evt_foreign'")).rows[0].status,'unbound');
   assert.equal((await c.rawSQL("select count(*)::int n from private.billing047_contracts where provider_id='sub_unbound'")).rows[0].n,0);
  });
 }finally{await c.db.close();}
});

test('Fase 3 — annual, timeout and MP coexistence (new disposable DB)',async t=>{
 const c=await fixture({existingMP:true});try{
  await t.test('populated 047 contract is preserved by 069; only additive provider discriminator',async()=>{
   const after=(await c.rawSQL('select to_jsonb(c) value from private.billing047_contracts c where id=$1',[c.priorMP.id])).rows[0].value;
   assert.equal(after.provider,'mercado_pago');delete after.provider;assert.deepEqual(after,c.priorMP);
  });
  await c.configure('internal');const mp=await c.view();const mpid=mp.subscription.id;
  await c.configure();
  await t.test('existing Mercado Pago can still reconcile after selector switches',async()=>{
   await c.engine.process(mpid).then(()=>assert.fail('Stripe accepted MP'),e=>assert.match(e.message,/provider_mismatch/));
   await c.engine.user('command',body(c,'annual'),'adminA').then(()=>assert.fail('duplicate provider'),e=>assert.match(e.message,/existing_subscription/));
   await c.engine.process(mpid).catch(()=>{}); // Stripe remains unable to touch it.
   await c.command('cancel'); // The original Mercado Pago engine still manages it.
   assert.ok((await c.service('billing047_service',{p_action:'list',p_id:null,p_data:{}})).includes(mpid));
  });
  await t.test('annual prepaid at 47880; never activated on a browser return',async()=>{
   c.fail({path:'/checkout/sessions',after:true});
   await assert.rejects(c.engine.user('command',body(c,'annual','B'),'adminB'),/network_uncertain/);
   const id=(await c.onlineView('adminB')).subscription.id;
   assert.equal((await c.engine.user('status',{organization_id:c.orgs.B},'adminB')).subscription.state,'reconciliation');
   const created=c.calls.filter(x=>x.path==='/checkout/sessions'&&x.method==='POST').length;
   await assert.rejects(c.engine.user('command',body(c,'annual','B'),'adminB'),/reconciliation_required/);
   assert.equal(c.calls.filter(x=>x.path==='/checkout/sessions'&&x.method==='POST').length,created);
   await c.complete(id,{paid:true});
   const session=[...c.objects.values()].find(x=>x.client_reference_id===id);
   const raw=Buffer.from(JSON.stringify({id:'evt_recovery',type:'checkout.session.completed',livemode:false,data:{object:session}})),now=Math.floor(Date.now()/1000);
   const sig=`t=${now},v1=`+createHmac('sha256',c.cfg.webhookSecret).update(`${now}.`).update(raw).digest('hex');
   await c.engine.webhook(raw,{'stripe-signature':sig});await c.engine.reconcile();
   assert.equal((await c.onlineView('adminB')).subscription.state,'active');
   const p=(await c.rawSQL('select amount_cents,period_end,debit_at from private.billing047_payments where contract_id=$1',[id])).rows[0];assert.equal(p.amount_cents,47880);assert.ok(Date.parse(p.period_end)-Date.parse(p.debit_at)>360*86400000);
   c.fail('network');await assert.rejects(c.engine.process(id),/network_uncertain/);
   const posts=c.calls.filter(x=>x.method==='POST').length;await c.engine.reconcile();assert.equal(c.calls.filter(x=>x.method==='POST').length,posts);
  });
 }finally{await c.db.close();}
});
