import test, {describe, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fixture} from '../billing-047/fixture.mjs';
describe('Integrated upgrade',()=>{
let c,migration,rollback;
before(async()=>{c=await fixture({integrated:false});migration=await readFile('supabase/migrations/202610140052_integrated_subscription_safety.sql','utf8');rollback=await readFile('docs/integrated-051/ROLLBACK-052-ANTES-DO-USO.sql','utf8');});
after(()=>c?.db.close());
const tables=['private.billing047_contracts','private.billing047_audit','private.billing047_payments','private.billing047_trial_reservations','private.trial_identifiers','private.trial_grants','private.trial_claims','private.trial_consumed_keys','private.trial_extensions','private.trial_audit','private.legal_acceptances','public.legal_documents'];
const snapshot=async()=>{
 const result={};for(const t of tables) result[t]=(await c.rawSQL(`select to_jsonb(t) row from ${t} t order by to_jsonb(t)::text`)).rows.map(({row})=>{for(const col of ['validation_check','provider_payer_id','method_started','method_before_card','method_last_four'])delete row[col];return row;});return result;
};
let historicalSnapshot,id;
test('INT-M01 failed populated migration rolls back all columns/functions, contracts, reservations and legal history',async()=>{
 id=await c.asUser('adminA','billing047_prepare',{p_org:c.orgs.A,p_action:'checkout',p_version:c.versions.profissional,p_key:randomUUID(),p_trial:true});historicalSnapshot=await snapshot();
 await assert.rejects(c.db.exec(migration.replace('commit;','select 1/0;commit;')),/division by zero/);await c.db.exec('rollback');
 assert.deepEqual(await snapshot(),historicalSnapshot);
 assert.equal((await c.rawSQL("select to_regclass('private.billing051_identity_evidence') r")).rows[0].r,null);
});
test('INT-M02 upgrade over populated 051 preserves every historical row, permissions and pending contract',async()=>{
 await c.db.exec(migration);assert.deepEqual(await snapshot(),historicalSnapshot);
 assert.equal((await c.view()).subscription.id,id);
 for(const fn of ['billing047_context_pre052(uuid)','billing047_prepare_pre052(uuid,text,uuid,uuid,boolean)','billing047_service_pre052(text,uuid,jsonb)','billing_trial_verify_pre052(uuid,text,text,text,text,boolean)']) for(const role of ['anon','authenticated','service_role']) assert.equal((await c.rawSQL('select has_function_privilege($1,$2,\'execute\') allowed',[role,'public.'+fn])).rows[0].allowed,false);
});
test('INT-M03 pre-use rollback is transactional, preserves history and original function access',async()=>{
 await c.db.exec(rollback);assert.deepEqual(await snapshot(),historicalSnapshot);
 assert.equal((await c.rawSQL("select to_regclass('private.billing051_identity_evidence') r")).rows[0].r,null);
 assert.equal((await c.view()).subscription.id,id);
});
test('INT-M04 reused historical reserved checkout waits for trusted proof, then recovers same contract',async()=>{
 await c.db.exec(migration);
 await assert.rejects(c.command('checkout','profissional'),/billing_trial_evidence_required/);
 assert.equal(c.fake.calls.length,0);assert.equal((await c.view()).subscription.id,id);
 await c.asUser('root','billing051_verify_identity',{p_org:c.orgs.A,p_type:'CPF',p_value:'52998224725',p_method:'document_checked',p_confirmed:true});
 const v=await c.command('checkout','profissional');assert.equal(v.subscription.id,id);assert.equal(v.subscription.state,'trialing');assert.equal(c.fake.subscriptions.size,1);
});
test('INT-M05 rollback after usage is blocked without deleting evidence, payments, trial or legal history',async()=>{
 const historicalSnapshot=await snapshot();await assert.rejects(c.db.exec(rollback),/billing_rollback_requires_forward_repair/);await c.db.exec('rollback');assert.deepEqual(await snapshot(),historicalSnapshot);
 await assert.rejects(c.db.exec(migration),/already exists/);await c.db.exec('rollback');assert.deepEqual(await snapshot(),historicalSnapshot);
});

});
