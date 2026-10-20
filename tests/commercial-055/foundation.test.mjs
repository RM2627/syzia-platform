import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fixture } from '../billing-047/fixture.mjs';
import {commercialController} from '../../server/commercial/controller.mjs';
let c, d, config;
const call=(name,args={},who='root')=>c.asUser(who,name,args);
const payload=()=>({p_id:null,p_revision:0,p_key:randomUUID(),p_lead:null,p_name:'Ateliê Aurora',p_slug:null,p_plan:null,p_expires:new Date(Date.now()+14*86400000).toISOString()});
before(async()=>{
 process.env.SYZIA_OPTIONAL_MANUAL_CURRENT='1';process.env.SYZIA_OPERATION_CURRENT='1';
 c=await fixture();
 for(const n of ['202610180054_commercial_preparation.sql','202610200055_commercial_versions.sql'])await c.db.exec(await readFile('supabase/migrations/'+n,'utf8'));
 config=(await c.rawSQL('select private.commercial_config_export($1) v',[c.orgs.A])).rows[0].v;
});
after(()=>c?.db.close());
test('055-F01 creates preparation without lead or plan; normalizes and reserves slug',async()=>{
 d=await call('commercial_demo_save',payload());assert.equal(d.slug,'atelie-aurora');
 const ctx=await call('commercial_demo_edit_context',{p_id:d.id});assert.equal(ctx.plan_version_id,null);assert.equal(ctx.lead_id,null);
 assert.ok((await call('commercial_management')).demos.some(x=>x.id===d.id));
});
test('055-F02 retries are idempotent; collisions reserve distinct identifiers',async()=>{
 const p=payload();const [a,b]=await Promise.all([call('commercial_demo_save',p),call('commercial_demo_save',p)]);
 assert.equal(a.id,b.id);assert.equal(a.slug,'atelie-aurora-2');
 await assert.rejects(call('commercial_demo_save',{...p,p_name:'Outra configuração'}),/idempotency_conflict/);
 await assert.rejects(call('commercial_demo_save',{...payload(),p_slug:d.slug}),/slug_taken/);
});
test('055-F03 subscriber and anonymous cannot manage; reserved slugs rejected',async()=>{
 await assert.rejects(call('commercial_demo_save',payload(),'adminA'),/denied/);
 await assert.rejects(call('commercial_demo_save',{...payload(),p_slug:'admin'}),/slug_invalid/);
 await assert.rejects(call('commercial_demo_save',{...payload(),p_plan:c.versions.profissional}),/plan_selected_at_activation/);
});
test('055-F04 drafts cannot resolve publicly or publish without review',async()=>{
 await assert.rejects(c.service('commercial_service',{p_action:'demo',p_data:{id:d.id}}),/unavailable/);
 await assert.rejects(call('commercial_demo_publish',{p_id:d.id,p_revision:d.revision,p_config:config}),/review_required/);
 d={...d,...await call('commercial_demo_draft',{p_id:d.id,p_revision:d.revision,p_config:config,p_review:false})};
 assert.deepEqual((await call('commercial_demo_edit_context',{p_id:d.id})).configuration,config);
});
test('055-F05 review and publish preserve immutable version while new draft remains private',async()=>{
 d={...d,...await call('commercial_demo_draft',{p_id:d.id,p_revision:d.revision,p_config:config,p_review:true})};
 d={...d,...await call('commercial_demo_publish',{p_id:d.id,p_revision:d.revision,p_config:config})};
 const next=structuredClone(config);next.tables.company_settings[0].description='Novo rascunho privado';
 d={...d,...await call('commercial_demo_draft',{p_id:d.id,p_revision:d.revision,p_config:next,p_review:false})};
 const current=await call('commercial_demo_edit_context',{p_id:d.id});
 d={...d,...await call('commercial_demo_save',{...payload(),p_id:d.id,p_revision:d.revision,p_name:'Nome do próximo rascunho',p_expires:current.expires_at})};
 const live=await c.service('commercial_service',{p_action:'demo',p_data:{id:d.id}});
 assert.deepEqual(live.configuration,config);assert.equal(live.draft_configuration,undefined);assert.equal(live.name,'Ateliê Aurora');
 await assert.rejects(c.rawSQL('update private.commercial_versions set name=$1 where id=$2',['Alterado',d.version_id]),/immutable/);
});
test('055-F05b independent contacts receive distinct invitations pinned to the same published version',async()=>{
 const ids=[];
 for(const n of [1,2]) {
  const lead=(await call('commercial_contact_save',{p_id:null,p_revision:0,p_key:randomUUID(),p_data:{name:'Responsável '+n,company:'Estúdio '+n,email:'responsavel'+n+'@example.invalid',stage:'wants_trial'}})).id;
  await call('commercial_contact_authorize',{p_id:lead,p_purpose:'activation',p_authorized:true,p_notice:'commercial-v1',p_evidence:'Solicitou convite e autorizou contato por e-mail.',p_expires:new Date(Date.now()+86400000).toISOString()});
  const args={p_demo:d.id,p_lead:lead,p_purpose:'activation',p_id:randomUUID(),p_hash:randomUUID().replaceAll('-','').repeat(2),p_expires:new Date(Date.now()+86400000).toISOString()};
  await assert.rejects(call('commercial_invite_for_contact',args),/not_linked/);
  await call('commercial_demo_link',{p_demo:d.id,p_lead:lead});
  const invite=await call('commercial_invite_for_contact',args);assert.equal(invite.lead_id,lead);assert.equal(invite.company,'Ateliê Aurora');ids.push(invite.id);
 }
 assert.notEqual(ids[0],ids[1]);
 const invites=(await c.rawSQL('select lead_id,version_id from private.commercial_invites where id=any($1::uuid[])',[ids])).rows;
 assert.notEqual(invites[0].lead_id,invites[1].lead_id);assert.equal(invites[0].version_id,invites[1].version_id);
 assert.equal((await call('commercial_management')).links.filter(x=>x.demo_id===d.id).length,2);
});
test('055-F05c snapshot rejects foreign references and operational rows',async()=>{
 const bad=structuredClone(config);bad.tables.service_addons=[{id:randomUUID(),service_id:randomUUID(),name:'Adicional',price_cents:100,price_mode:'fixed',duration_minutes:0,active:true}];
 await assert.rejects(call('commercial_demo_draft',{p_id:d.id,p_revision:d.revision,p_config:bad,p_review:true}),/configuration_reference_invalid/);
 bad.tables.customers=[{id:randomUUID()}];
 await assert.rejects(call('commercial_demo_draft',{p_id:d.id,p_revision:d.revision,p_config:bad,p_review:true}),/configuration_invalid/);
 assert.equal((await call('commercial_demo_edit_context',{p_id:d.id})).revision,d.revision);
});
test('055-F06 suspended demonstrations reject existing public access',async()=>{
 await call('commercial_demo_revoke',{p_id:d.id,p_revision:d.revision});
 await assert.rejects(c.service('commercial_service',{p_action:'demo',p_data:{id:d.id}}),/unavailable/);
});
test('055-F07 all new tables force RLS and synthetic editor identities are unavailable',async()=>{
 for(const t of ['commercial_versions','commercial_demo_contacts','commercial_preparation_events']){
  const x=(await c.rawSQL("select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass",['private.'+t])).rows[0];assert.ok(x.relrowsecurity&&x.relforcerowsecurity);
 }
 await assert.rejects(c.service('commercial_editor_service',{p_demo:d.id,p_actor:c.users.root}),/permission denied/);
});
test('055-F08 original reinforced session survives editor restoration; missing, foreign and revoked sessions fail',async()=>{
 const sid=randomUUID();
 await c.rawSQL('insert into private.access_enforced_users values($1)on conflict do nothing',[c.users.root]);
 await c.rawSQL('insert into private.enterprise_sessions(session_id,user_id)values($1,$2)',[sid,c.users.root]);
 const ctl=commercialController({
  auth:async t=>t==='original-session'?{id:c.users.root}:t==='other-session'?{id:c.users.adminB}:null,
  asUser:async(token,name,args)=>c.tx('root',async()=>{
   await c.db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:c.users.root,session_id:sid,is_anonymous:false})]);
   return c.rpc(name,args);
  }),service:c.service,store:{session:async()=>({source_id:d.id,kind:'editor',actor_id:c.users.root})},
  origins:{appOrigin:'https://app.example.invalid',publicOrigin:'https://demo.example.invalid'},
 });
 await assert.rejects(call('commercial_demo_edit_context',{p_id:d.id}),/denied/);
 assert.equal((await ctl.demoDefinition('opaque-demo-session','original-session')).d.id,d.id);
 await assert.rejects(ctl.demoDefinition('opaque-demo-session'),/session_required/);
 await assert.rejects(ctl.demoDefinition('opaque-demo-session','other-session'),/denied/);
 await c.rawSQL('update private.enterprise_sessions set revoked=true where session_id=$1',[sid]);
 await assert.rejects(ctl.demoDefinition('opaque-demo-session','original-session'),/denied/);
 await ctl.close();
});
