import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from '../syzia-061/fixture.mjs';

test('064 integrated publication readiness, unchanged review tokens and private authorization',async t=>{
 const c=await fixture({through:63});
 const org=c.orgs.A,call=(name,args={})=>c.asUser('adminA',name,{p_org:org,...args});
 const draft=()=>call('consumer_page_draft',{p_show_prices:true});
 const publish=async()=>{const d=await draft();return call('consumer_publish_draft',{p_token:d.token,p_show_prices:true,p_expected_revision:d.page_revision});};
 const readiness=async()=>{const s=await call('onboarding_context');return {ready:s.ready,publication:s.items.find(x=>x.id==='publication'),manual:s.items.find(x=>x.id==='manual')};};
 try{
  await c.rawSQL("update company_settings set published_manual_id=null,support_mode='own',support_configured=true,human_enabled=false,faq_public_enabled=false where organization_id=$1",[org]);
  await publish();
  const before=await draft();
  await t.test('reproduces the 054–063 mismatch structurally, not by hiding the checklist',async()=>{
   assert.equal((await readiness()).ready,false);assert.equal(before.changed,false);
   const {payload,presence}=(await c.rawSQL('select v.payload,private.presence_payload($1,v.show_prices) presence from consumer_pages p join consumer_publications v on v.id=p.publication_id where p.organization_id=$1',[org])).rows[0];
   assert.equal(payload.template,'current');assert.deepEqual(payload,{...presence,template:'current'});
  });
  const functions=async()=>(await c.rawSQL("select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl from pg_proc p where p.oid in('public.consumer_page_draft(uuid,boolean)'::regprocedure,'public.consumer_publish_draft(uuid,text,boolean,integer)'::regprocedure,'private.onboarding_readiness(uuid)'::regprocedure)order by 1")).rows;
  const historical=await functions();
  const stored=(await c.rawSQL('select to_jsonb(v) row from consumer_publications v where organization_id=$1 order by id',[org])).rows;
  const sql=await readFile('supabase/migrations/202610280064_publication_readiness_templates.sql','utf8');
  await t.test('transaction rollback preserves functions, grants and snapshots',async()=>{
   await assert.rejects(c.db.exec(sql.replace(/commit;\s*$/,'select 1/0;commit;')),/division by zero/);await c.db.exec('rollback');
   assert.deepEqual(await functions(),historical);
  });
  await c.db.exec(sql);
  await t.test('fresh publication is ready with optional Manual and identical token',async()=>{
   const s=await readiness();assert.equal(s.ready,true);assert.equal(s.publication.complete,true);assert.equal(s.manual.required,false);
   assert.equal((await draft()).token,before.token);
   assert.deepEqual((await c.rawSQL('select to_jsonb(v) row from consumer_publications v where organization_id=$1 order by id',[org])).rows,stored);
   for(const row of await functions()){const prior=historical.find(x=>x.signature===row.signature);assert.equal(row.acl,prior.acl);if(!row.signature.includes('onboarding'))assert.equal(row.definition,prior.definition);}
  });
  await t.test('all public fields are compared; default legacy template alone is compatible',async()=>{
   const p=(await draft()).published_payload;
   for(const key of ['description','hours','services','branding','faqs','public_information']){
    const changed={...p,[key]:null};assert.equal((await c.rawSQL('select private.presence_publication_current($1,$2,true) valid',[org,JSON.stringify(changed)])).rows[0].valid,false,key);
   }
   assert.equal((await c.rawSQL('select private.presence_publication_current($1,$2,true) valid',[org,JSON.stringify({...p,template:null})])).rows[0].valid,false);
   const legacy={...p};delete legacy.template;
   assert.equal((await c.rawSQL('select private.presence_publication_current($1,$2,true) valid',[org,JSON.stringify(legacy)])).rows[0].valid,true);
  });
  await t.test('template changes invalidate readiness and stale publish tokens; republish restores',async()=>{
   const stale=await draft();await call('company_page_template_set',{p_template:'modern',p_revision:0});
   assert.equal((await readiness()).publication.complete,false);
   await assert.rejects(call('consumer_publish_draft',{p_token:stale.token,p_show_prices:true,p_expected_revision:stale.page_revision}),/page_draft_changed/);
   assert.equal((await draft()).published_payload.template,'current');await publish();assert.equal((await readiness()).ready,true);assert.equal((await draft()).published_payload.template,'modern');
   await assert.rejects(call('company_page_template_set',{p_template:'catalog',p_revision:0}),/page_draft_changed/);
  });
  await t.test('service quantity and price changes remain stale until reviewed publication',async()=>{
   const service=(await c.rawSQL('select id from services where organization_id=$1 and active order by id limit 1',[org])).rows[0].id;
   const revision=async()=>(await c.rawSQL('select revision from company_settings where organization_id=$1',[org])).rows[0].revision;
   await call('company_save',{p_entity:'service',p_id:service,p_expected_revision:await revision(),p_data:{quantity_enabled:true,quantity_min:1,quantity_max:4,quantity_unit:'unidade',quantity_duration:'proportional'}});
   assert.equal((await readiness()).ready,false);await publish();assert.equal((await readiness()).ready,true);
   await call('company_save',{p_entity:'service',p_id:service,p_expected_revision:await revision(),p_data:{price_mode:'fixed',price_cents:12345}});
   assert.equal((await readiness()).ready,false);await publish();assert.equal((await readiness()).ready,true);
  });
  await t.test('private function remains inaccessible and tenant boundaries remain enforced',async()=>{
   for(const role of ['anon','authenticated','service_role'])assert.equal((await c.rawSQL('select has_function_privilege($1,\'private.presence_publication_current(uuid,jsonb,boolean)\',\'EXECUTE\') permitted',[role])).rows[0].permitted,false);
   await assert.rejects(c.asUser('adminB','onboarding_context',{p_org:org}),/denied|forbidden/);
   await assert.rejects(c.service('consumer_publish_draft',{p_org:org,p_token:before.token,p_show_prices:true,p_expected_revision:before.page_revision}),/permission denied|denied/);
  });
 }finally{await c.db.close();}
});
