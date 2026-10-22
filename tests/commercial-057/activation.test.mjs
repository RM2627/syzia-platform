import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {fixture} from '../billing-047/fixture.mjs';
import {commercialController} from '../../server/commercial/controller.mjs';
let c,ctl,d,configuration,mainInvite,claim,draft,org,checkout;
const migration='supabase/migrations/202610220058_invitation_activation.sql';
const hash=s=>createHash('sha256').update(s).digest('hex');
const call=(n,a={},who='root')=>c.asUser(who,n,a);
const sql=async(q,a=[])=> (await c.rawSQL(q,a)).rows;
const expires=()=>new Date(Date.now()+86400000).toISOString();
async function invite(email='recipient@example.invalid',purpose='activation') {
 const lead=(await call('commercial_contact_save',{p_id:null,p_revision:0,p_key:randomUUID(),p_data:{name:'Aurora Interiores',email,stage:'wants_trial'}})).id;
 await call('commercial_contact_authorize',{p_id:lead,p_purpose:purpose,p_authorized:true,p_notice:'local-test',p_evidence:'Autorização fictícia obtida exclusivamente nesta fixture.',p_expires:expires()});
 await call('commercial_demo_link',{p_demo:d.id,p_lead:lead});
 const args={p_id:randomUUID(),p_demo:d.id,p_lead:lead,p_purpose:purpose,p_hash:hash(randomUUID()),p_expires:expires()};
 await call('commercial_invite_for_contact',args);return {id:args.p_id,hash:args.p_hash,lead};
}
const request=(i,who='adminA')=>call('commercial_claim_request',{p_hash:i.hash,p_statement:null},who);
before(async()=>{
 process.env.SYZIA_OPTIONAL_MANUAL_CURRENT='1';process.env.SYZIA_OPERATION_CURRENT='1';
 c=await fixture();
 for(const f of ['202610180054_commercial_preparation.sql','202610200055_commercial_versions.sql','202610210056_commercial_preregistration.sql','202610210057_billing_completed_change_recovery.sql'])await c.db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 await sql("update auth.users set email='recipient@example.invalid' where id=$1",[c.users.adminA]);
 await sql("update auth.users set email='other@example.invalid' where id=$1",[c.users.adminB]);
 d=await call('commercial_demo_save',{p_id:null,p_revision:0,p_key:randomUUID(),p_lead:null,p_name:'Aurora Interiores',p_slug:null,p_plan:null,p_expires:new Date(Date.now()+14*86400000).toISOString()});
 configuration=(await sql('select private.commercial_config_export($1) v',[c.orgs.A]))[0].v;
 if(configuration.tables.services.filter(x=>x.active).length<2)configuration.tables.services.push({...configuration.tables.services[0],id:randomUUID(),name:'Serviço complementar',active:true});
 const reviewed=await call('commercial_demo_draft',{p_id:d.id,p_revision:d.revision,p_config:configuration,p_review:true});
 await call('commercial_demo_publish',{p_id:d.id,p_revision:reviewed.revision,p_config:configuration});
 d=await call('commercial_demo_edit_context',{p_id:d.id});
 mainInvite=await invite();
 // Populated legacy request is retained, then safely promoted only on matching identity.
 await call('commercial_claim_request',{p_hash:mainInvite.hash,p_statement:'Registro histórico fictício de solicitação do responsável.'},'adminA');
 const before=(await sql('select to_jsonb(q) v from private.commercial_claims q'))[0].v;
 await assert.rejects(c.service('commercial_materialization_service',{p_action:'pending',p_org:null,p_assets:{}}),e=>e.code==='42702');
 const ddl=await readFile(migration,'utf8');
 await assert.rejects(c.db.exec(ddl.replace(/commit;\s*$/,'select 1/0;commit;')),/division by zero/);await c.db.exec('rollback');
 assert.deepEqual((await sql('select to_jsonb(q) v from private.commercial_claims q'))[0].v,before);
 await c.db.exec(ddl);
 const after=(await sql('select to_jsonb(q) v from private.commercial_claims q'))[0].v;
 assert.equal(after.statement,before.statement);assert.equal(after.state,'requested');
 ctl=commercialController({asUser:c.asUser,service:c.service,auth:async t=>c.users[t]?{id:c.users[t]}:null,store:{},origins:{appOrigin:'https://app.example.invalid',publicOrigin:'https://demo.example.invalid'}});
});
after(async()=>{await ctl?.close();await c?.db.close();});
test('057-01 confirmed existing recipient continues without manual approval; historical statement stays intact',async()=>{
 claim=await request(mainInvite);assert.equal(claim.state,'approved');
 const q=(await sql('select * from private.commercial_claims where id=$1',[claim.id]))[0];
 assert.equal(q.authorization_method,'verified_invitation');assert.ok(q.recipient_verified_at);assert.equal(q.reviewed_by,null);assert.match(q.statement,/histórico/);
 assert.equal((await sql('select count(*)::int n from private.commercial_claim_reviews'))[0].n,0);
 assert.equal((await call('commercial_claim_context',{p_id:claim.id},'adminA')).organization_id,null);
});
test('057-02 new identity uses the existing identity registration, without company/trial at claim',async()=>{
 const uid=randomUUID();c.users.newRecipient=uid;
 await sql("insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,'new@example.invalid',now(),false)",[uid]);
 await c.service('access_selfservice_identity',{p_user:uid,p_name:'Lia Costa',p_username:'lia.057'});
 const q=await request(await invite('new@example.invalid'),'newRecipient');assert.equal(q.state,'approved');
 assert.equal((await call('commercial_claim_context',{p_id:q.id},'newRecipient')).organization_id,null);
 assert.equal((await sql('select count(*)::int n from organization_members where user_id=$1',[uid]))[0].n,0);
});
test('057-03 unconfirmed email, anonymous role and inactive profile cannot claim',async()=>{
 const i=await invite();await sql('update auth.users set email_confirmed_at=null where id=$1',[c.users.adminA]);
 await assert.rejects(request(i),/email_confirmation_required/);
 await sql('update auth.users set email_confirmed_at=now() where id=$1',[c.users.adminA]);
 await assert.rejects(request(i,'anon'),/permission denied/);
 await sql("update profiles set status='suspended' where id=$1",[c.users.adminA]);
 await assert.rejects(request(i),/access_denied/);
 await sql("update profiles set status='active' where id=$1",[c.users.adminA]);
});
test('057-04 expired, revoked and demonstration-purpose invitations are rejected',async()=>{
 for(const mode of ['expired','revoked','demonstration']){
  const i=await invite(undefined,mode==='demonstration'?'demonstration':'activation');
  if(mode==='expired')await sql("update private.commercial_invites set expires_at=now()-interval '1 second' where id=$1",[i.id]);
  if(mode==='revoked')await call('commercial_invite_revoke',{p_id:i.id});
  await assert.rejects(request(i),/invite_invalid/);
 }
});
test('057-05 possession does not authorize wrong recipient or changed destination; configuration stays private',async()=>{
 const i=await invite();await assert.rejects(request(i,'adminB'),/recipient_mismatch/);
 await assert.rejects(call('commercial_claim_context',{p_id:claim.id},'adminB'),/denied/);
 await sql("update private.acquisition_leads set email='changed@example.invalid' where id=$1",[i.lead]);
 await assert.rejects(request(i),/recipient_mismatch/);
 assert.equal((await sql('select claimed_by from private.commercial_invites where id=$1',[i.id]))[0].claimed_by,null);
});
test('057-06 repeated and overlapping requests reuse one claim and one verification event',async()=>{
 const i=await invite();const r=await Promise.all([request(i),request(i),request(i)]);
 assert.equal(new Set(r.map(x=>x.id)).size,1);
 assert.equal((await sql('select count(*)::int n from private.commercial_claims where invite_id=$1',[i.id]))[0].n,1);
 const q=(await sql('select * from private.commercial_claims where id=$1',[r[0].id]))[0];assert.equal(q.statement,null);assert.equal(q.authorization_method,'verified_invitation');
});
test('057-07 explicit historical rejection is not silently overturned',async()=>{
 const i=await invite();const q=await request(i);
 await call('commercial_claim_review',{p_id:q.id,p_approve:false,p_note:'Decisão excepcional fictícia de segurança registrada no teste.'});
 await assert.rejects(request(i),/activation_rejected/);
});
test('057-08 prepared immutable version survives later draft changes; incompatible plan and missing consent fail',async()=>{
 const ctx=await call('commercial_claim_context',{p_id:claim.id},'adminA');assert.deepEqual(ctx.configuration,configuration);
 const changed=structuredClone(configuration);changed.tables.company_settings[0].description='Rascunho posterior';
 await call('commercial_demo_draft',{p_id:d.id,p_revision:d.revision,p_config:changed,p_review:false});
 assert.deepEqual((await call('commercial_claim_context',{p_id:claim.id},'adminA')).configuration,configuration);
 await c.service('access_selfservice_identity',{p_user:c.users.adminA,p_name:'Marina Costa',p_username:'marina.057'});
 const plan=(await sql('select plan_id from billing_plan_versions where id=$1',[c.versions.profissional]))[0].plan_id;
 draft=await call('selfservice_save',{p_id:null,p_revision:0,p_name:'Aurora Interiores',p_slug:'aurora-ativada',p_phone:'81999990000',p_kind:'CPF',p_document:'52998224725',p_plan:plan,p_key:randomUUID()},'adminA');
 const args={p_id:claim.id,p_snapshot:ctx.snapshot_hash,p_draft:draft.id,p_revision:draft.revision,p_consent:true,p_conditions:'billing-047',p_reviewed:true};
 checkout=args;
 await assert.rejects(ctl.operator('activate',{...args,p_reviewed:false},'adminA'),/review_required/);
 await assert.rejects(ctl.operator('activate',{...args,p_consent:false},'adminA'),/consent_required/);
 const original=(await sql('select plan_version_id from private.selfservice_drafts where id=$1',[draft.id]))[0].plan_version_id;
 const limited=await call('billing_plan_save',{p_id:null,p_revision:0,p_data:{name:'Plano limitado da fixture',price_cents:8990,interval_months:1,trial_days:7,active:true,available:true,self_service:true,self_service_trial:true,site_visible:true,member_limit:3,service_limit:1,request_limit:null,ticket_limit:null,followup_limit:null,human_support:false,commercial_followups:false,quota_semantics:2,capabilities:{software:true,finance:false,analytics:false,commercial_followups:false,human_support:false}}});
 const limitedVersion=(await sql('select id from billing_plan_versions where plan_id=$1 order by version desc limit 1',[limited]))[0].id;
 await sql('update private.selfservice_drafts set plan_version_id=$2 where id=$1',[draft.id,limitedVersion]);
 await assert.rejects(ctl.operator('activate',args,'adminA'),/plan_incompatible/);
 await sql('update private.selfservice_drafts set plan_version_id=$2 where id=$1',[draft.id,original]);
});
test('057-09 identity is rechecked before completion; duplicate completion creates one restricted organization',async()=>{
 await sql("update auth.users set email='changed@example.invalid' where id=$1",[c.users.adminA]);
 await assert.rejects(ctl.operator('activate',checkout,'adminA'),/recipient_mismatch/);
 await sql("update auth.users set email='recipient@example.invalid' where id=$1",[c.users.adminA]);
 const results=await Promise.all([ctl.operator('activate',checkout,'adminA'),ctl.operator('activate',checkout,'adminA')]);
 org=results[0].organization_id;assert.ok(org);assert.equal(results[1].organization_id,org);
 assert.equal((await call('billing_capabilities',{p_org:org},'adminA')).software,false);
 for(const t of ['private.billing047_contracts','private.trial_grants','consumer_publications','services'])assert.equal((await sql('select count(*)::int n from '+t+' where organization_id=$1',[org]))[0].n,0);
});
test('057-10 abandoned checkout and missing financial confirmation never materialize',async()=>{
 const r=await ctl.operator('materialize',{organization_id:org},'adminA');assert.equal(r.financial_confirmation_required,true);
 await assert.rejects(ctl.operator('materialize',{organization_id:org},'adminB'),/denied/);
 assert.equal((await call('billing_capabilities',{p_org:org},'adminA')).software,false);
 assert.equal((await ctl.reconcile()).length,0);
});
test('057-11 existing checkout + simulated provider confirmation activates; reconciliation is idempotent and excludes fake history',async()=>{
 const command={organization_id:org,action:'checkout',plan_version_id:c.versions.profissional,request_key:randomUUID(),card_token:'offline-only-card',payer_email:'payer@example.invalid',trial_expected:true};
 let r;
 try{r=await c.engine.user('command',command,'adminA');}catch(e){if(e.code!=='billing_trial_changed')throw e;r=await c.engine.user('command',{...command,request_key:randomUUID(),trial_expected:false},'adminA');}
 if(r.subscription.state==='payment_pending'){
  assert.equal((await ctl.operator('materialize',{organization_id:org},'adminA')).financial_confirmation_required,true);
  c.fake.charge(r.subscription.provider_id||[...c.fake.subscriptions.keys()][0]);await c.engine.process(r.subscription.id);
 }
 const grants=(await sql('select count(*)::int n from private.trial_grants where organization_id=$1',[org]))[0].n;
 const first=await ctl.reconcile();assert.equal(first.find(x=>x.organization_id===org)?.result.activated,true);
 assert.equal((await ctl.reconcile()).length,0);
 assert.equal((await ctl.operator('materialize',{organization_id:org},'adminA')).reused,true);
 assert.equal((await call('billing_capabilities',{p_org:org},'adminA')).software,true);
 const services=await sql('select id,name from services where organization_id=$1',[org]);assert.equal(services.length,configuration.tables.services.length);
 assert.deepEqual(services.map(s=>s.name).sort(),configuration.tables.services.map(s=>s.name).sort());
 assert.ok(services.every(s=>!configuration.tables.services.some(v=>v.id===s.id)));
 for(const t of ['quote_requests','appointments','billing_invoices','consumer_publications'])assert.equal((await sql('select count(*)::int n from '+t+' where organization_id=$1',[org]))[0].n,0);
 assert.equal((await sql('select count(*)::int n from private.trial_grants where organization_id=$1',[org]))[0].n,grants);
 assert.equal((await sql('select count(*)::int n from private.billing047_contracts where organization_id=$1',[org]))[0].n,1);
});
test('057-12 reinforced session missing/revoked/foreign remains rejected; original valid session works',async()=>{
 const i=await invite(),sid=randomUUID();
 await sql('insert into private.access_enforced_users values($1) on conflict do nothing',[c.users.adminA]);
 await sql('insert into private.enterprise_sessions(session_id,user_id) values($1,$2)',[sid,c.users.adminA]);
 await assert.rejects(request(i),/access_denied/);
 const withSession=(session_id)=>c.tx('adminA',async()=>{await c.db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:c.users.adminA,session_id,is_anonymous:false})]);return c.rpc('commercial_claim_request',{p_hash:i.hash,p_statement:null});});
 await assert.rejects(withSession(randomUUID()),/access_denied/);
 assert.equal((await withSession(sid)).state,'approved');
 await sql('update private.enterprise_sessions set revoked=true where session_id=$1',[sid]);await assert.rejects(withSession(sid),/access_denied/);
});
test('057-13 RLS and grants preserved; wrappers cannot be bypassed by anonymous/authenticated/service roles',async()=>{
 const [t]=await sql("select relrowsecurity,relforcerowsecurity from pg_class where oid='private.commercial_claims'::regclass");assert.ok(t.relrowsecurity&&t.relforcerowsecurity);
 for(const role of ['anon','authenticated','service_role'])for(const fn of ['public.commercial_claim_complete_pre057(uuid,text,uuid,integer,boolean,text,boolean)','public.commercial_claim_context_pre057(uuid)','private.commercial_activation_identity(uuid)'])assert.equal((await sql('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,fn]))[0].allowed,false);
 assert.equal((await sql("select has_function_privilege('anon','public.commercial_claim_request(text,text)','EXECUTE') allowed"))[0].allowed,false);
});
test('057-14 eligible new recipient gets exactly seven days through the existing provider adapter, with no duplicate trial',async()=>{
 const q=(await sql('select * from private.commercial_claims where user_id=$1',[c.users.newRecipient]))[0];
 const plan=(await sql('select plan_id from billing_plan_versions where id=$1',[c.versions.profissional]))[0].plan_id;
 const draft=await call('selfservice_save',{p_id:null,p_revision:0,p_name:'Aurora Nova',p_slug:'aurora-nova-057',p_phone:'81999990001',p_kind:'CPF',p_document:'39053344705',p_plan:plan,p_key:randomUUID()},'newRecipient');
 const prepared=await ctl.operator('activate',{p_id:q.id,p_snapshot:q.snapshot_hash,p_draft:draft.id,p_revision:draft.revision,p_consent:true,p_conditions:'billing-047',p_reviewed:true},'newRecipient');
 const org2=prepared.organization_id;
 assert.equal((await call('billing_capabilities',{p_org:org2},'newRecipient')).software,false);
 const command={organization_id:org2,action:'checkout',plan_version_id:c.versions.profissional,request_key:randomUUID(),card_token:'offline-only-new-card',payer_email:'new@example.invalid',trial_expected:true};
 const r=await c.engine.user('command',command,'newRecipient');
 assert.equal(r.subscription.state,'trialing');
 const contract=(await sql('select trial_start,trial_end from private.billing047_contracts where organization_id=$1 and current',[org2]))[0];
 assert.ok(Math.abs((new Date(contract.trial_end)-new Date(contract.trial_start))/86400000-7)<0.001);
 const again=await c.engine.user('command',command,'newRecipient');assert.equal(again.subscription.id,r.subscription.id);
 await c.engine.process(r.subscription.id);await c.engine.process(r.subscription.id);
 const results=await ctl.reconcile();assert.equal(results.find(x=>x.organization_id===org2)?.result.activated,true);
 assert.equal((await sql('select count(*)::int n from private.billing047_contracts where organization_id=$1',[org2]))[0].n,1);
 assert.equal((await call('commercial_claim_context',{p_id:q.id},'newRecipient')).state,'materialized');
 await assert.rejects(call('commercial_claim_context',{p_id:claim.id},'newRecipient'),/denied/);
});
