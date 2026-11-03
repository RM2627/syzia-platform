import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {fixture} from '../stripe-online/fixture.mjs';
let c,offers,prior,prepared,demo,configuration,openInvite;
const sha=s=>createHash('sha256').update(s).digest('hex');
const sql=async(s,p=[]) => (await c.rawSQL(s,p)).rows;
const call=(n,p={},who='root')=>c.asUser(who,n,p);
before(async()=>{
 c=await fixture({existingMP:true});
 await sql("alter table auth.users add column if not exists raw_user_meta_data jsonb default '{}'::jsonb");
 await c.db.exec(await readFile('supabase/migrations/202611020070_registration_recovery.sql','utf8'));
 prior=(await sql('select to_jsonb(c) v from private.billing047_contracts c where organization_id=$1',[c.orgs.A]))[0].v;
 // Confirm the predecessor mismatch: public catalog excludes every 069 mapped version even when visible.
 await sql('update public.billing_plans p set active=true,available=true,site_visible=true,self_service=true where exists(select 1 from private.billing069_offers o join public.billing_plan_versions v on v.id=o.plan_version_id where v.plan_id=p.id)');
 const old=await call('acquisition_plans');assert.ok(!old.some(x=>x.name.includes('Completa')));
 const migration=await readFile('supabase/migrations/202611030071_commercial_catalog_activation.sql','utf8');
 await assert.rejects(c.db.exec(migration.replace(/commit;\s*$/, 'select 1/0;commit;')),/division by zero/);
 await c.db.exec('rollback');
 assert.equal((await sql("select to_regclass('private.registration071_candidates') v"))[0].v,null);
 try{await c.db.exec(migration);}catch(e){throw Error(e.message+' '+e.where+' '+e.internalQuery+' at '+e.internalPosition);}
 offers=await call('commercial_catalog_admin');
});
after(async()=>{await c?.db.close();});
test('071 canonical public/signup/subscription catalog, exact periods, immutable mapped versions and blocked checkout',async()=>{
 const publicRows=await call('acquisition_plans',{},'anon');
 assert.deepEqual(publicRows.map(x=>[x.price_cents,x.interval_months,x.saving_cents,x.discount_percent]),[[5990,1,0,0],[29940,6,6000,16.69],[47880,12,24000,33.39]]);
 assert.ok(publicRows.every(x=>x.product_name==='SYZIA Completa'&&x.provider==='stripe'&&!x.checkout_available));
 assert.deepEqual((await c.onlineView('adminB')).catalog,publicRows);
 assert.equal((await sql('select checkout_mode v from private.billing069_runtime'))[0].v,'disabled');
 await assert.rejects(call('billing069_prepare',{p_org:c.orgs.B,p_offer:'monthly',p_key:randomUUID(),p_trial:true,p_accepted:true},'adminB'),/billing_checkout_disabled/);
 assert.equal(c.calls.filter(x=>x.method==='POST').length,0);
});
test('071 super admin presentation changes reflect everywhere, optimistic revision and strict fields',async()=>{
 const o=offers[1],data={description:'Descrição comercial atualizada',active:true,site_visible:false,available:true};
 await assert.rejects(call('commercial_catalog_save',{p_id:o.id,p_revision:o.catalog_revision,p_data:data},'adminA'),/access_denied/);
 await assert.rejects(call('commercial_catalog_admin',{},'anon'),/permission denied|access_denied/);
 await assert.rejects(call('commercial_catalog_save',{p_id:o.id,p_revision:o.catalog_revision,p_data:{...data,price_cents:1}}));
 await call('commercial_catalog_save',{p_id:o.id,p_revision:o.catalog_revision,p_data:data});
 assert.equal((await call('acquisition_plans')).length,2);
 assert.equal((await c.onlineView('adminB')).catalog.length,2);
 await assert.rejects(call('commercial_catalog_save',{p_id:o.id,p_revision:o.catalog_revision,p_data:data}),/billing_revision_conflict/);
 await call('commercial_catalog_save',{p_id:o.id,p_revision:o.catalog_revision+1,p_data:{...data,site_visible:true}});
 assert.equal((await call('acquisition_plans'))[1].description,data.description);
 assert.equal((await call('acquisition_plans'))[1].version_id,o.version_id);
 await assert.rejects(call('billing_plan_save',{p_id:o.id,p_revision:1,p_data:{}}),/billing_catalog_managed/);
});
test('071 historical MP contract and provider mapping remain unchanged',async()=>{
 assert.deepEqual((await sql('select to_jsonb(c) v from private.billing047_contracts c where organization_id=$1',[c.orgs.A]))[0].v,prior);
 assert.equal((await c.onlineView()).provider,'mercado_pago');
 assert.equal((await sql('select count(*)::int n from private.billing069_offers'))[0].n,3);
});
test('071 Stripe preparation saves selected immutable version while completion remains blocked',async()=>{
 prepared=await call('selfservice_save',{p_id:null,p_revision:0,p_name:'Aurora Serviços',p_slug:'aurora-071',p_phone:'',p_kind:'CPF',p_document:'52998224725',p_plan:offers[2].id,p_key:randomUUID()},'adminB');
 assert.equal(prepared.plan.version_id,offers[2].version_id);assert.equal(prepared.plan.price_cents,47880);
 await assert.rejects(call('selfservice_complete',{p_id:prepared.id,p_revision:prepared.revision,p_consent:true,p_conditions:'stripe-completa-1'},'adminB'),/billing_checkout_disabled/);
 assert.equal((await call('selfservice_context',{},'adminB')).organization_id,null);
});

async function makeInvite(email=null,purpose='activation'){
 const lead=(await call('commercial_contact_save',{p_id:null,p_revision:0,p_key:randomUUID(),p_data:{name:'Aurora Interiores',email,stage:'wants_trial'}})).id;
 if(email)await call('commercial_contact_authorize',{p_id:lead,p_purpose:purpose,p_authorized:true,p_notice:'local fixture',p_evidence:'Autorização simulada no teste local',p_expires:new Date(Date.now()+86400000).toISOString()});
 await call('commercial_demo_link',{p_demo:demo.id,p_lead:lead});
 const a={p_demo:demo.id,p_lead:lead,p_purpose:purpose,p_id:randomUUID(),p_hash:sha(randomUUID()),p_expires:new Date(Date.now()+86400000).toISOString()};
 await call('commercial_invite_for_contact',a);return {id:a.p_id,hash:a.p_hash,lead};
}
const remember=(i,email)=>c.service('access_activation_remember',{p_hash:i.hash,p_email:email});
test('071 recipient-free activation is explicitly issued; demonstration link never becomes an activation',async()=>{
 demo=await call('commercial_demo_save',{p_id:null,p_revision:0,p_key:randomUUID(),p_lead:null,p_name:'Aurora Interiores',p_slug:null,p_plan:null,p_expires:new Date(Date.now()+14*86400000).toISOString()});
 configuration=(await sql('select private.commercial_config_export($1) v',[c.orgs.B]))[0].v;
 const reviewed=await call('commercial_demo_draft',{p_id:demo.id,p_revision:demo.revision,p_config:configuration,p_review:true});
 await call('commercial_demo_publish',{p_id:demo.id,p_revision:reviewed.revision,p_config:configuration});
 openInvite=await makeInvite();
 assert.equal((await sql('select recipient_mode from private.commercial_invites where id=$1',[openInvite.id]))[0].recipient_mode,'confirmed_signup');
 await assert.rejects(remember(await makeInvite(null,'demonstration'),'lia@example.invalid'),/registration_invitation_invalid/);
 for(const who of ['lia','other']){
  c.users[who]=randomUUID();await sql('insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) values($1,$2,null,false,$3)',[c.users[who],who+'@example.invalid',JSON.stringify({display_name:'Pessoa '+who,syzia_username:who+'.silva'})]);
 }
 await remember(openInvite,'lia@example.invalid');await remember(openInvite,'other@example.invalid');
 assert.equal((await sql('select email_hash,claimed_by from private.commercial_invites where id=$1',[openInvite.id]))[0].claimed_by,null);
 await assert.rejects(call('commercial_activation_resume',{p_invite:openInvite.id},'lia'));
 assert.equal((await sql('select claimed_by from private.commercial_invites where id=$1',[openInvite.id]))[0].claimed_by,null);
});
test('071 confirmed recipient locks one claim across devices; competing identity is rejected, snapshot preserved',async()=>{
 const counts=await sql('select (select count(*) from public.organizations) orgs,(select count(*) from private.billing047_contracts) contracts,(select count(*) from private.trial_grants) trials');
 for(const who of ['lia','other'])await sql('update auth.users set email_confirmed_at=now() where id=$1',[c.users[who]]);
 assert.deepEqual((await call('commercial_activation_pending',{},'lia')).map(x=>x.id),[openInvite.id]);
 const first=await call('commercial_activation_resume',{p_invite:openInvite.id},'lia');
 const again=await call('commercial_activation_resume',{p_invite:openInvite.id},'lia');
 assert.equal(first.id,again.id);assert.deepEqual(first.configuration,configuration);assert.equal(first.organization_id,null);
 const draft=await call('selfservice_save',{p_id:null,p_revision:0,p_name:'Aurora Interiores',p_slug:'aurora-preparada-071',p_phone:'',p_kind:'CPF',p_document:'52998224725',p_plan:offers[0].id,p_key:randomUUID()},'lia');
 await assert.rejects(call('commercial_claim_complete',{p_id:first.id,p_snapshot:first.snapshot_hash,p_draft:draft.id,p_revision:draft.revision,p_consent:true,p_conditions:'stripe-completa-1',p_reviewed:true},'lia'),/billing_checkout_disabled/);
 assert.equal((await call('commercial_claim_context',{p_id:first.id},'lia')).organization_id,null);
 await assert.rejects(call('commercial_claim_request',{p_hash:openInvite.hash,p_statement:null},'other'),/commercial_recipient_mismatch/);
 assert.deepEqual(await call('commercial_activation_pending',{},'other'),[]);
 assert.deepEqual(await sql('select (select count(*) from public.organizations) orgs,(select count(*) from private.billing047_contracts) contracts,(select count(*) from private.trial_grants) trials'),counts);
});
test('071 bound-email invitations retain strict recipient and current lead email validation',async()=>{
 const i=await makeInvite('lia@example.invalid');
 await assert.rejects(remember(i,'other@example.invalid'),/registration_invitation_invalid/);
 await remember(i,'lia@example.invalid');
 const q=await call('commercial_activation_resume',{p_invite:i.id},'lia');assert.equal(q.state,'approved');
 await sql("update private.acquisition_leads set email='other@example.invalid' where id=$1",[i.lead]);
 await assert.rejects(call('commercial_activation_resume',{p_invite:i.id},'lia'),/commercial_invite_invalid/);
});
test('071 expiry, revocation, permissions and hidden-offer tampering stay blocked',async()=>{
 for(const column of ["revoked_at=now()","expires_at=now()-interval '1 second'"]){
  const i=await makeInvite();await remember(i,'lia@example.invalid');
  await sql('update private.commercial_invites set '+column+' where id=$1',[i.id]);
  await assert.rejects(call('commercial_activation_resume',{p_invite:i.id},'lia'),/commercial_invite_invalid/);
  await assert.rejects(remember(i,'lia@example.invalid'),/registration_invitation_invalid/);
 }
 const r=(await sql("select relrowsecurity,relforcerowsecurity from pg_class where oid='private.registration071_candidates'::regclass"))[0];assert.deepEqual(r,{relrowsecurity:true,relforcerowsecurity:true});
 assert.equal((await sql("select has_table_privilege('authenticated','private.registration071_candidates','SELECT,INSERT,UPDATE,DELETE') v"))[0].v,false);
 await sql('insert into private.access_enforced_users values($1) on conflict do nothing',[c.users.lia]);
 await assert.rejects(call('commercial_activation_pending',{},'lia'),/access_denied/);
});
test('071 preserved 070 name/username and two registered sessions resume same claim; revocation is enforced',async()=>{
 const profile=await c.service('access_registration_profile',{p_user:c.users.lia});
 assert.equal(profile.username,'lia.silva');assert.equal(profile.name,'Pessoa lia');
 const account=await c.service('access_selfservice_identity',{p_user:c.users.lia,p_name:profile.name,p_username:profile.username});
 const a=randomUUID(),b=randomUUID();
 for(const session of [a,b])assert.equal(await c.service('access_register_session',{p_user:c.users.lia,p_session:session,p_account:account.id,p_generation:account.generation}),true);
 const resume=session=>c.tx('lia',async()=>{
  await c.db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:c.users.lia,session_id:session,role:'authenticated'})]);
  return c.rpc('commercial_activation_resume',{p_invite:openInvite.id});
 });
 const result=await Promise.all([resume(a),resume(b)]);assert.equal(result[0].id,result[1].id);
 await sql('update private.enterprise_sessions set revoked=true where session_id=$1',[a]);
 await assert.rejects(resume(a),/access_denied/);assert.equal((await resume(b)).id,result[0].id);
});
