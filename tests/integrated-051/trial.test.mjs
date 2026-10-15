import test, {describe, before, after} from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../billing-047/fixture.mjs';
// Historical 052 policy regression; current automatic policy has its own 053 suite.
describe('Historical 052 trial and simple superadmin review',()=>{
let c,initialCapabilities;
before(async()=>{c=await fixture({automaticTrial:false,verifiedIdentity:false});initialCapabilities=await c.asUser('adminA','billing_capabilities',{p_org:c.orgs.A});});
after(()=>c?.db.close());
const verify=(org=c.orgs.A,type='CPF',value='52998224725',confirmed=true,actor='root')=>c.asUser(actor,'billing051_verify_identity',{p_org:org,p_type:type,p_value:value,p_method:type==='phone'?'verified_contact':'document_checked',p_confirmed:confirmed});
test('INT-A01 typed CPF is not proof; automatic eligibility neither reserves nor grants without evidence',async()=>{
 assert.equal((await c.view()).eligibility,'verification_required');
 await assert.rejects(c.command(),/trial_review_required/);
 assert.equal(c.fake.calls.length,0);
 assert.equal((await c.rawSQL('select count(*)::int n from private.billing047_contracts')).rows[0].n,0);
});
test('INT-A02 simplified verification requires superadmin, explicit confirmation and valid document',async()=>{
 await assert.rejects(verify(c.orgs.A,'CPF','52998224725',true,'adminA'),/denied|scope/);
 await assert.rejects(verify(c.orgs.A,'CPF','52998224725',false),/trial_verification_required/);
 await assert.rejects(verify(c.orgs.A,'CPF','00000000000'),/document_invalid/);
 assert.equal((await c.view()).eligibility,'verification_required');
});
test('INT-A03 verified company alone does not satisfy required responsible identity',async()=>{
 await c.asUser('root','billing_trial_verify',{p_org:c.orgs.A,p_kind:'business',p_value:'BR:CPF:52998224725',p_evidence:'fictitious-document-review',p_reason:'Documento fictício conferido em teste local',p_verified:true});
 assert.equal((await c.view()).eligibility,'verification_required');
});
test('INT-A04 one explicit CPF review records company and responsible atomically, auto-eligible without manual trial grant',async()=>{
 const identifiers=(await c.rawSQL('select * from private.trial_identifiers order by id')).rows;
 assert.equal(await verify(),'eligible');
 assert.deepEqual((await c.rawSQL('select * from private.trial_identifiers order by id')).rows,identifiers);
 const evidence=(await c.rawSQL('select kind from private.billing051_identity_evidence where organization_id=$1 order by kind',[c.orgs.A])).rows;
 assert.deepEqual(evidence.map(x=>x.kind),['business','responsible']);
 assert.equal((await c.view()).eligibility,'eligible');
 assert.equal((await c.rawSQL('select count(*)::int n from private.trial_grants')).rows[0].n,0);
 assert.deepEqual(await c.asUser('adminA','billing_capabilities',{p_org:c.orgs.A}),initialCapabilities);
 assert.equal((await c.view()).subscription,null);
});
let initial;
test('INT-A05 automatic seven-day grant follows official subscription and card, two tabs create one',async()=>{
 await Promise.all([c.command(),c.command()]); initial=(await c.view()).subscription;
 assert.equal(initial.state,'trialing');
 assert.equal(Date.parse(initial.trial_end)-Date.parse(initial.trial_start),7*86400000);
 assert.equal(c.fake.calls.filter(x=>x.method==='POST').length,1);
 assert.equal((await c.rawSQL("select count(*)::int n from private.trial_grants where mode='automatic' and organization_id=$1",[c.orgs.A])).rows[0].n,1);
});
test('INT-A06 card/email/plan/cancellation do not reset original dates, reservation, identity or grant',async()=>{
 const before=(await c.rawSQL('select * from private.billing047_trial_reservations order by kind,fingerprint')).rows;
 await c.command('method');
 await c.command('checkout','essencial','A',{payer_email:'other-payer@example.invalid'});
 await c.command('change','profissional');
 await c.command('cancel');
 const s=(await c.view()).subscription;
 assert.equal(s.trial_start,initial.trial_start);assert.equal(s.trial_end,initial.trial_end);
 assert.deepEqual((await c.rawSQL('select * from private.billing047_trial_reservations order by kind,fingerprint')).rows,before);
 assert.equal(c.fake.calls.filter(x=>x.method==='POST').length,1);
 assert.equal((await c.view()).eligibility,'previous_grant');
});
test('INT-A07 same responsible at another company cannot get another trial; deleting registry is denied',async()=>{
 await verify(c.orgs.B,'CPF','52998224725');
 assert.equal((await c.view('B')).eligibility,'previous_identity');
 await assert.rejects(c.command('checkout','essencial','B'),/billing_trial_changed/);
 await assert.rejects(c.rawSQL('delete from private.billing051_identity_evidence'),/immutable|denied/);
 await assert.rejects(c.rawSQL('truncate private.billing047_trial_reservations'),/immutable|denied/);
});
test('INT-A08 evidence/claims/history remain private; no raw document, email or credentials in new evidence',async()=>{
 for(const role of ['adminA','adminB','worker','anon']) await assert.rejects(c.tx(role,()=>c.db.query('select * from private.billing051_identity_evidence')),/permission denied/);
 const serialized=JSON.stringify((await c.rawSQL('select * from private.billing051_identity_evidence')).rows);
 assert.doesNotMatch(serialized,/52998224725|11144477735|example.invalid|token|CVV/);
 const rls=(await c.rawSQL("select relrowsecurity,relforcerowsecurity from pg_class where oid='private.billing051_identity_evidence'::regclass")).rows[0];
 assert.equal(rls.relrowsecurity,true);assert.equal(rls.relforcerowsecurity,true);
});

});

describe('Integrated exceptional identity checks',()=>{
 let c;before(async()=>{c=await fixture({automaticTrial:false});});after(()=>c?.db.close());
 test('INT-A09 explicit manual policy is not silently bypassed by valid evidence',async()=>{
  await c.rawSQL('update private.trial_policy set auto_enabled=false');
  assert.equal((await c.view()).eligibility,'manual_policy');
  await assert.rejects(c.command(),/trial_review_required/);assert.equal(c.fake.calls.length,0);
  await c.rawSQL('update private.trial_policy set auto_enabled=true');
  assert.equal((await c.view()).eligibility,'eligible');
 });
 test('INT-A10 conflicting identities stay exceptional even after superadmin records a second real review',async()=>{
  const result=await c.asUser('root','billing051_verify_identity',{p_org:c.orgs.A,p_type:'CPF',p_value:'11144477735',p_method:'in_person',p_confirmed:true});
  assert.equal(result,'identity_conflict');assert.equal((await c.view()).eligibility,'identity_conflict');
  await assert.rejects(c.command(),/trial_review_required/);assert.equal(c.fake.calls.length,0);
  assert.equal((await c.rawSQL('select count(*)::int n from private.trial_grants')).rows[0].n,0);
 });
 test('INT-A11 phone proof is explicit, normalized and cannot stand in for a document review',async()=>{
  const args={p_org:c.orgs.B,p_type:'phone',p_value:'11999998888',p_method:'document_checked',p_confirmed:true};
  await assert.rejects(c.asUser('root','billing051_verify_identity',args),/trial_verification_required/);
  await c.rawSQL("update private.trial_policy set required_types=ARRAY['business','responsible','phone']");
  assert.equal((await c.view('B')).eligibility,'verification_required');
  assert.equal(await c.asUser('root','billing051_verify_identity',{...args,p_method:'verified_contact'}),'eligible');
  const evidence=(await c.rawSQL("select kind,evidence_ref from private.billing051_identity_evidence where organization_id=$1 and kind='phone'",[c.orgs.B])).rows;
  assert.equal(evidence.length,1);assert.match(evidence[0].evidence_ref,/^review-/);
 });
});
