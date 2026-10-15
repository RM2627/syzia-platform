import test,{describe,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fixture} from '../billing-047/fixture.mjs';
import {users} from '../support/consumer-db.mjs';
describe('052 populated 053 upgrade and historical recovery',()=>{
 let c,migration,rollback,id,provider;
 const tables=['private.billing047_contracts','private.billing047_audit','private.billing047_payments','private.billing047_trial_reservations','private.trial_identifiers','private.billing051_identity_evidence','private.trial_grants','private.trial_claims','private.trial_requests','private.trial_consumed_keys','private.trial_audit','private.legal_acceptances','public.legal_documents'];
 const snapshot=async()=>{const r={};for(const t of tables)r[t]=(await c.rawSQL(`select to_jsonb(t) r from ${t} t order by to_jsonb(t)::text`)).rows.map(({r})=>{delete r.provider_modified_at;delete r.provider_version_observed;delete r.provider_resource_fingerprint;return r;});return r;};
 before(async()=>{
  c=await fixture({integrated:false,automaticTrial:false,verifiedIdentity:false});
  id=await c.asUser('adminA','billing047_prepare',{p_org:c.orgs.A,p_action:'checkout',p_version:c.versions.profissional,p_key:randomUUID(),p_trial:true});
  await c.db.exec(await readFile('supabase/migrations/202610140052_integrated_subscription_safety.sql','utf8'));
  const b=await c.service('billing047_service',{p_action:'lease',p_id:id,p_data:{}});
  // Entirely offline fixture: represent the subscription already created before this upgrade.
  const p=await c.gateway.create(b,'offline-historical-card-token','payer@example.invalid');provider=p.id;
  await c.service('billing047_service',{p_action:'bind',p_id:id,p_data:{lease:b.lease,provider_id:p.id,payer_reference:String(p.payer_id)}});
  await c.rawSQL("update private.billing047_contracts set create_started=true,state='reconciliation',operation_state='uncertain',error_code='billing_binding_mismatch',validation_check='version',lease=null,lease_until=null where id=$1",[id]);
  await c.rawSQL("insert into private.trial_requests(organization_id,plan_id,actor_id,risk_reason)select $1,plan_id,$2,'verification_required'from billing_plan_versions where id=$3",[c.orgs.A,c.users.adminA,c.versions.profissional]);
  delete c.fake.subscriptions.get(provider).version;
  migration=await readFile('supabase/migrations/202610140053_automatic_trial_optional_provider_version.sql','utf8');rollback=await readFile('docs/trial-052/ROLLBACK-053-ANTES-DO-USO.sql','utf8');
 });
 after(()=>c?.db.close());
 test('052-M01 rollback on failure preserves every historical row and functions',async()=>{
  const before=await snapshot();await assert.rejects(c.db.exec(migration.replace('commit;','select 1/0;commit;')),/division by zero/);await c.db.exec('rollback');assert.deepEqual(await snapshot(),before);
  assert.equal((await c.rawSQL('select private.billing051_eligibility($1,$2) result',[c.orgs.A,id])).rows[0].result,'verification_required');
 });
 test('052-M02 populated upgrade and pre-use rollback preserve records, signatures and grants',async()=>{
  const before=await snapshot();await c.db.exec(migration);assert.deepEqual(await snapshot(),before);assert.equal((await c.view()).eligibility,'eligible');
  await c.db.exec(rollback);assert.deepEqual(await snapshot(),before);assert.equal((await c.rawSQL('select private.billing051_eligibility($1,$2) result',[c.orgs.A,id])).rows[0].result,'verification_required');
  await c.db.exec(migration);
  for(const fn of ['billing047_service_pre053(text,uuid,jsonb)','billing047_service_core_pre053(text,uuid,jsonb)','billing047_service_pre052(text,uuid,jsonb)','billing047_context_pre053(uuid)'])for(const role of ['anon','authenticated','service_role'])assert.equal((await c.rawSQL("select has_function_privilege($1,$2,'execute') ok",[role,'public.'+fn])).rows[0].ok,false);
 });
 test('052-M03 historical pending trial and absent version recover same contract using only GET, once',async()=>{
  const prior=(await c.rawSQL('select id,provider_id,operation_id,trial_reserved,create_started from private.billing047_contracts where id=$1',[id])).rows[0];
  const reservations=(await c.rawSQL('select * from private.billing047_trial_reservations order by kind,fingerprint')).rows;
  const writes=c.fake.calls.filter(x=>x.method!=='GET').length;
  await c.engine.process(id);await c.engine.user('status',{organization_id:c.orgs.A},'adminA');await c.engine.reconcile();
  assert.deepEqual((await c.rawSQL('select id,provider_id,operation_id,trial_reserved,create_started from private.billing047_contracts where id=$1',[id])).rows[0],prior);
  assert.deepEqual((await c.rawSQL('select * from private.billing047_trial_reservations order by kind,fingerprint')).rows,reservations);
  const v=(await c.view()).subscription;assert.equal(v.state,'trialing');assert.equal(v.id,id);assert.equal(c.fake.calls.filter(x=>x.method!=='GET').length,writes);
  assert.equal(Date.parse(v.trial_start),Date.parse(c.fake.subscriptions.get(provider).date_created));
  assert.equal((await c.rawSQL('select count(*)::int n from private.trial_grants')).rows[0].n,1);
  assert.equal((await c.rawSQL('select count(*)::int n from private.billing051_identity_evidence')).rows[0].n,0);
  const request=(await c.rawSQL('select state,decided_by from private.trial_requests')).rows[0];assert.equal(request.state,'approved');assert.equal(request.decided_by,null);
  assert.equal((await c.rawSQL("select count(*)::int n from private.trial_audit where action='request_automatically_resolved'")).rows[0].n,1);
  assert.equal((await c.rawSQL('select validation_check from private.billing047_contracts where id=$1',[id])).rows[0].validation_check,null);
 });
 test('052-M04 post-use rollback and repeat migration reject without deleting history',async()=>{
  const before=await snapshot();await assert.rejects(c.db.exec(rollback),/billing053_rollback_requires_forward_repair/);await c.db.exec('rollback');assert.deepEqual(await snapshot(),before);
  await assert.rejects(c.db.exec(migration),/already exists/);await c.db.exec('rollback');assert.deepEqual(await snapshot(),before);
 });
});

test('052-M05 existing structural CPF from 040 is reevaluated without a new identity submission or proof',async()=>{
 const c=await fixture({automaticTrial:false,verifiedIdentity:false,afterUpgrade:async c=>{
  try{await c.db.query("insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref) select $1,kind,private.trial_fingerprint(kind,'BR:CPF:'||private.document_normalize('CPF',$2)),$3,'self_declared_structure_040' from unnest(ARRAY['business','responsible']) kind on conflict do nothing",[c.orgs.A,'52998224725',users.adminA]);}
  catch(e){await c.db.close();throw e;}
 }});
 try{
  const before=(await c.rawSQL('select * from private.trial_identifiers where organization_id=$1 order by kind',[c.orgs.A])).rows;
  assert.equal(before.filter(x=>x.evidence_ref==='self_declared_structure_040').length,2);
  assert.equal((await c.view()).eligibility,'verification_required');
  await c.db.exec(await readFile('supabase/migrations/202610140053_automatic_trial_optional_provider_version.sql','utf8'));
  assert.equal((await c.view()).eligibility,'eligible');
  assert.deepEqual((await c.rawSQL('select * from private.trial_identifiers where organization_id=$1 order by kind',[c.orgs.A])).rows,before);
  assert.equal((await c.rawSQL('select count(*)::int n from private.billing051_identity_evidence')).rows[0].n,0);
  assert.equal(c.fake.calls.length,0);
 }finally{await c.db.close();}
});
