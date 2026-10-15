import test,{describe,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from '../billing-047/fixture.mjs';
import {normalizeCPF} from '../../shared/cpf.mjs';
import {verifiedSnapshot} from '../../server/billing/mercado-pago.mjs';

const cpfCases=[['digits','52998224725',true],['mask','529.982.247-25',true],['second_valid','11144477735',true],['first_check','52998224735',false],['second_check','52998224724',false],['repeated','11111111111',false],['short','5299822472',false],['long','529982247250',false],['letter','5299822472x',false],['slash','529/982/24725',false],['newline','52998224725\n',false],['empty','',false]];
describe('052 automatic eligibility and CPF',()=>{
 let c;before(async()=>{c=await fixture({verifiedIdentity:false});});after(()=>c?.db.close());
 for(const [name,value,valid] of cpfCases) test('052-CPF '+name+': identical browser/server decision',async()=>{
  assert.equal(normalizeCPF(value)!==null,valid);
  const result=(await c.rawSQL("select private.document_normalize('CPF',$1) is not null valid",[value])).rows[0];assert.equal(result.valid,valid);
 });
 test('052-A01 first trial eligible without manual identity, phone or legacy policy approval; no access yet',async()=>{
  await c.rawSQL("update private.trial_policy set auto_enabled=false,required_types=ARRAY['business','responsible','phone']");
  assert.equal((await c.view()).eligibility,'eligible');
  assert.equal((await c.rawSQL('select count(*)::int n from private.billing051_identity_evidence')).rows[0].n,0);
  await c.asUser('adminA','billing047_prepare',{p_org:c.orgs.A,p_action:'checkout',p_version:c.versions.profissional,p_key:randomUUID(),p_trial:true});
  assert.equal((await c.asUser('adminA','billing_capabilities',{p_org:c.orgs.A})).software,false);
  assert.equal((await c.rawSQL('select count(*)::int n from private.trial_grants')).rows[0].n,0);
 });
 let initial,p;
 test('052-A old self-service review is reevaluated on read without a new document, request or changed history',async()=>{
  const plan=(await c.rawSQL('select plan_id from billing_plan_versions where id=$1',[c.versions.essencial])).rows[0].plan_id;
  const d=await c.asUser('adminB','selfservice_save',{p_id:null,p_revision:0,p_name:'Fixture automática',p_slug:'fixture-automatic-052',p_phone:'11999998888',p_kind:'CPF',p_document:'11144477735',p_plan:plan,p_key:randomUUID()});
  await c.rawSQL("update private.selfservice_drafts set state='review',eligibility='verification_required' where id=$1",[d.id]);
  const before=(await c.rawSQL('select * from private.selfservice_drafts where id=$1',[d.id])).rows;
  const current=await c.asUser('adminB','selfservice_context',{});assert.equal(current.id,d.id);assert.equal(current.eligibility,'eligible');assert.equal(current.state,'ready');
  assert.deepEqual((await c.rawSQL('select * from private.selfservice_drafts where id=$1',[d.id])).rows,before);
  assert.equal((await c.rawSQL('select count(*)::int n from private.billing051_identity_evidence')).rows[0].n,0);
 });
 test('052-A exceptional conflict or denial blocks; missing structural identity is not automatically accepted',async()=>{
  await c.rawSQL("insert into private.trial_requests(organization_id,plan_id,actor_id,state,risk_reason)select $1,plan_id,$2,'denied','documented_exception' from billing_plan_versions where id=$3",[c.orgs.B,c.users.adminB,c.versions.essencial]);
  assert.equal((await c.view('B')).eligibility,'previous_review');await assert.rejects(c.command('checkout','essencial','B'),/trial_review_required/);
  const result=(await c.rawSQL('select private.billing051_eligibility($1) result',[randomUUID()])).rows[0].result;assert.equal(result,'verification_required');
 });
 test('052-A02 two tabs, no remote version: one subscription, reservation and seven-day grant',async()=>{
  const original=c.gateway.fetchImpl;
  c.gateway.fetchImpl=async(url,init)=>{const r=await original(url,init);if(new URL(url).pathname.startsWith('/preapproval/')&&!new URL(url).pathname.endsWith('search')){const body=await r.json();delete body.version;return Response.json(body);}return r;};
  const results=await Promise.allSettled([c.command('checkout','profissional'),c.command('checkout','profissional')]);
  assert.ok(results.some(x=>x.status==='fulfilled'));assert.ok(results.every(x=>x.status==='fulfilled'||/billing_operation_pending/.test(x.reason.message)));
  initial=(await c.view()).subscription;p=[...c.fake.subscriptions.values()][0];
  assert.equal(initial.state,'trialing');assert.equal(Date.parse(initial.trial_end)-Date.parse(initial.trial_start),7*86400000);
  assert.equal(c.fake.calls.filter(x=>x.method==='POST').length,1);
  assert.equal((await c.rawSQL('select count(*)::int n from private.trial_grants')).rows[0].n,1);
  const contract=(await c.rawSQL('select provider_version,provider_modified_at from private.billing047_contracts')).rows[0];assert.equal(contract.provider_version,-1);assert.ok(contract.provider_modified_at);
  assert.equal((await c.rawSQL('select count(*)::int n from private.billing051_identity_evidence')).rows[0].n,0);
 });
 test('052-A03 return, repeated webhooks and reconciler reuse original subscription and dates',async()=>{
  const writes=c.fake.calls.filter(x=>x.method!=='GET').length;
  await c.engine.user('status',{organization_id:c.orgs.A},'adminA');
  const raw=Buffer.from(JSON.stringify({type:'subscription_preapproval',data:{id:p.id}}));
  await c.engine.webhook(raw,{},new URLSearchParams());await c.engine.webhook(raw,{},new URLSearchParams());await c.engine.reconcile();
  const current=(await c.view()).subscription;assert.equal(current.id,initial.id);assert.equal(current.trial_end,initial.trial_end);
  assert.equal(c.fake.calls.filter(x=>x.method!=='GET').length,writes);assert.equal((await c.rawSQL('select count(*)::int n from private.trial_grants')).rows[0].n,1);
 });
 test('052-A04 same responsible at another company remains ineligible; denied requests remain exceptional',async()=>{
  await c.asUser('adminB','billing047_identify',{p_org:c.orgs.B,p_kind:'CPF',p_document:'529.982.247-25'});
  assert.equal((await c.view('B')).eligibility,'previous_identity');await assert.rejects(c.command('checkout','essencial','B'),/billing_trial_changed/);
  assert.equal(c.fake.calls.filter(x=>x.method==='POST').length,1);
 });
 test('052-A05 permissions, tenant isolation and private history unchanged',async()=>{
  for(const who of ['worker','adminB']) await assert.rejects(c.engine.user('status',{organization_id:c.orgs.A},who),/denied|scope/);
  for(const role of ['anon','authenticated']){
   assert.equal((await c.rawSQL("select has_function_privilege($1,'public.billing047_service(text,uuid,jsonb)','execute') allowed",[role])).rows[0].allowed,false);
   assert.equal((await c.rawSQL("select has_table_privilege($1,'private.billing047_contracts','select') allowed",[role])).rows[0].allowed,false);
  }
  const r=(await c.rawSQL("select relrowsecurity,relforcerowsecurity from pg_class where oid='private.billing047_contracts'::regclass")).rows[0];assert.ok(r.relrowsecurity&&r.relforcerowsecurity);
  const audit=JSON.stringify((await c.rawSQL('select * from private.billing047_audit')).rows);assert.doesNotMatch(audit,/52998224725|11144477735|@example|offline-token|offline-fixture/);
 });
});

describe('052 resource version and stale snapshots',()=>{
 let c,id,p,original;before(async()=>{c=await fixture({verifiedIdentity:false});original=c.gateway.read;id=(await c.command()).subscription.id;p=[...c.fake.subscriptions.values()][0];});after(()=>c?.db.close());
 for(const [name,value,valid] of [['absent',undefined,true],['zero',0,true],['positive',5,true],['null',null,false],['string','0',false],['negative',-1,false],['fraction',1.5,false],['unsafe',Number.MAX_SAFE_INTEGER+1,false]]) test('052-V '+name,async()=>{
  const resource=structuredClone(p);if(value===undefined)delete resource.version;else resource.version=value;
  const b=await c.service('billing047_service',{p_action:'get',p_id:id,p_data:{}});
  if(valid){const s=await verifiedSnapshot(c.gateway,b,resource);assert.equal(Object.hasOwn(s,'version'),value!==undefined);}
  else await assert.rejects(verifiedSnapshot(c.gateway,b,resource),e=>e.validationCheck==='version');
 });
 test('052-V own undefined, NaN and infinity are invalid values, not absence',async()=>{
  const b=await c.service('billing047_service',{p_action:'get',p_id:id,p_data:{}});
  for(const version of [undefined,NaN,Infinity])await assert.rejects(verifiedSnapshot(c.gateway,b,{...structuredClone(p),version}),e=>e.validationCheck==='version');
 });
 for(const [check,change] of [['collector_id',x=>x.collector_id=999],['application_id',x=>x.application_id=999],['payer_id',x=>x.payer_id=999],['plan_id',x=>x.preapproval_plan_id='other-plan'],['external_reference',x=>x.external_reference=randomUUID()],['currency',x=>x.auto_recurring.currency_id='USD'],['amount',x=>x.auto_recurring.transaction_amount=0.01],['recurrence',x=>x.auto_recurring.frequency=2],['trial_duration',x=>x.auto_recurring.free_trial.frequency=1],['first_charge',x=>x.next_payment_date=x.date_created],['status',x=>x.status='approved']]) test('052-V absent does not bypass '+check,async()=>{
  const r=structuredClone(p);delete r.version;change(r);
  const b=await c.service('billing047_service',{p_action:'get',p_id:id,p_data:{}});
  await assert.rejects(verifiedSnapshot(c.gateway,b,r),e=>e.validationCheck===check);
 });
 test('052-V old timestamp and ambiguous equal-time changes fail closed before any provider write',async()=>{
  const writes=c.fake.calls.filter(x=>x.method!=='GET').length;
  for(const equal of [false,true]){
   c.gateway.read=async providerId=>{const r=await original.call(c.gateway,providerId);delete r.version;if(equal)r.card_id='different-card';else r.last_modified=new Date(Date.parse(r.last_modified)-1).toISOString();return r;};
   await assert.rejects(c.command('method'),/billing_stale_snapshot/);
  }
  assert.equal(c.fake.calls.filter(x=>x.method!=='GET').length,writes);c.gateway.read=original;
 });
 test('052-V SQL rejects explicit null/string counter and expired lease without changing financial history',async()=>{
  const b=await c.service('billing047_service',{p_action:'lease',p_id:id,p_data:{}}),s=await verifiedSnapshot(c.gateway,b,p);
  for(const version of [null,'0',-1,0.2]) await assert.rejects(c.service('billing047_service',{p_action:'apply',p_id:id,p_data:{...s,version,lease:b.lease}}),/billing_response_invalid/);
  await assert.rejects(c.service('billing047_service',{p_action:'apply',p_id:id,p_data:{...s,lease:randomUUID()}}),/billing_lease_conflict/);
  await c.service('billing047_service',{p_action:'release',p_id:id,p_data:{lease:b.lease}});
 });
 test('052-V restored version does not prove ordering over a prior versionless snapshot at the same timestamp',async()=>{
  c.gateway.read=async providerId=>{const r=await original.call(c.gateway,providerId);delete r.version;return r;};await c.engine.process(id);
  p.version+=1;const card=p.card_id;p.card_id='ambiguous-same-time-card';c.gateway.read=original;
  await assert.rejects(c.engine.process(id),/billing_stale_snapshot/);
  p.card_id=card;await c.engine.process(id);
  const b=await c.service('billing047_service',{p_action:'get',p_id:id,p_data:{}});assert.equal(b.error_code,null);assert.equal(b.validation_check,null);
 });
});
