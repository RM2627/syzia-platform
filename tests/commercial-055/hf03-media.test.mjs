import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoStore } from '../../server/commercial/demo-store.mjs';

const org = '11111111-1111-4111-8111-111111111111';
const manager = '22222222-2222-4222-8222-222222222222';
const consumer = '33333333-3333-4333-8333-333333333333';
const source = '44444444-4444-4444-8444-444444444444';
const ready = (id) => ({id, state:'ready', mime:'image/png', sha256:'a'.repeat(64), object_path:`${org}/${id}`, public_code:`m_${'a'.repeat(24)}`});
const pending = (id) => ({...ready(id), state:'pending', sha256:null});

function fixture(configuration) {
  const statements = [];
  const c = {
    async query(sql, args = []) {
      statements.push({sql, args});
      if (sql.includes('select purpose from demo_private.identity')) return {rows:[{purpose:'syzia-commercial-demo-054'}]};
      if (sql.includes('from demo_private.sessions s join demo_private.instances')) return {rows:[{
        source_id:source, generation:1, kind:'editor', manager_id:manager, consumer_id:consumer,
        organization_id:org, session_expires:new Date(Date.now()+60000)
      }]};
      if (sql.includes('from pg_proc')) return {rows:[{names:['p_org','p_show_prices'],types:[2950,16],required:1}]};
      if (sql.includes('select public.consumer_page_draft(')) return {rows:[{result:{ready:true}}]};
      if (sql.includes('private.commercial_config_export')) return {rows:[{result:structuredClone(configuration)}]};
      return {rows:[]};
    },
    release() {}
  };
  return {store:createDemoStore({connect:async()=>c}), statements};
}
const base = (media, extras = {}) => ({format:'syzia-config-054',template:'current',tables:{
  company_media:media,company_branding:[{logo_id:'logo',cover_id:'cover'}],
  portfolio_items:[],services:[],...extras
}});
const definition = {id:source,generation:1};

test('HF03: retains two ready media and removes six unreferenced pending uploads',async()=>{
  const media=[ready('logo'),ready('cover'),...Array.from({length:6},(_,i)=>pending(`old-${i}`))];
  const {store}=fixture(base(media));
  const exported=await store.export('synthetic-test-token',definition);
  assert.deepEqual(exported.tables.company_media.map(m=>m.id),['logo','cover']);
  assert.equal(exported.tables.company_branding[0].logo_id,'logo');
  assert.equal(exported.tables.company_branding[0].cover_id,'cover');
});

for (const [label,extras] of [
  ['logo',{company_branding:[{logo_id:'old',cover_id:'cover'}]}],
  ['cover',{company_branding:[{logo_id:'logo',cover_id:'old'}]}],
  ['portfolio',{portfolio_items:[{id:'p',media_ids:['old']}]}],
  ['service',{services:[{id:'s',image_media_id:'old'}]}],
]) {
  test(`HF03: rejects pending media referenced by ${label}`,async()=>{
    const {store}=fixture(base([ready('logo'),ready('cover'),pending('old')],extras));
    await assert.rejects(store.export('synthetic-test-token',definition),/commercial_media_not_ready/);
  });
}

test('HF03: exports identical filtered configuration for save, review and publish',async()=>{
  const {store}=fixture(base([ready('logo'),ready('cover'),pending('old')]));
  const save=await store.export('synthetic-test-token',definition,{requireReady:false});
  const review=await store.export('synthetic-test-token',definition,{requireReady:true});
  const publish=await store.export('synthetic-test-token',definition,{requireReady:true});
  assert.deepEqual(save,review);
  assert.deepEqual(review,publish);
});
