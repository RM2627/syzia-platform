import test, {before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {stripeController} from '../../server/billing/stripe/controller.mjs';
import {canStartCheckout} from '../../src/billing/subscription-view.ts';

// No migrations are applied. Only the new predicate/admin RPC and the four actual
// guard expressions are exercised in an in-memory fixture, without external I/O.
const migration = readFileSync('supabase/migrations/202611030072_stripe_sandbox_scope.sql','utf8');
const prior = readFileSync('supabase/migrations/202611020069_stripe_online.sql','utf8');
const wrapper = readFileSync('supabase/migrations/202611030071_commercial_catalog_activation.sql','utf8');
const replacements = [...migration.matchAll(/\('([^']+)',\s*\$old\$([\s\S]*?)\$old\$,\s*\$new\$([\s\S]*?)\$new\$,(\d)\)/g)]
  .map(([,target,oldText,newText,count])=>({target,oldText,newText,count:Number(count)}));
const functions = migration.slice(migration.indexOf('create function private.billing072_organization_allowed'),migration.indexOf('-- Retain the 071'));
const configure = migration.slice(migration.indexOf('create function public.billing072_configure_sandbox'),migration.lastIndexOf('commit;'));
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
let db;
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
const allowed=async org=>(await query('select private.billing072_organization_allowed($1,r) value from private.billing069_runtime r',[org]))[0].value;
async function role(name,action) {
  await db.exec('begin;set local role '+name);
  try {const result=await action();await db.exec('commit');return result;}
  catch(e){await db.exec('rollback');throw e;}
}
const setGeneral=value=>role('service_role',()=>query('select public.billing072_configure_sandbox($1) value',[value]));
function definition(name) {
  const start=prior.indexOf('create function public.'+name+'(');
  assert.ok(start>=0);return prior.slice(start,prior.indexOf('end;$$;',start)+7);
}
function patched(name) {
  let text=definition(name);
  for(const r of replacements.filter(r=>r.target.startsWith('public.'+name+'(')||r.target.startsWith('public.'+name+'_pre071('))) {
    assert.equal(text.split(r.oldText).length-1,r.count);text=text.replaceAll(r.oldText,r.newText);
  }
  return text;
}
const prepareGuard=()=>patched('billing069_prepare').match(/if (.*?)then raise exception 'billing_checkout_disabled'/)[1];
const startGuard=()=>patched('billing069_service').match(/if (.*?)then raise exception 'billing_checkout_disabled'/)[1];
const applyGuard=()=>patched('billing069_service').match(/if (.*?) then raise exception 'billing_confirmation_disabled'/)[1];
async function blocked(guard,org,environment='test') {
  return (await query(`select (${guard.replaceAll('p_org','$1::uuid')}) blocked from private.billing069_runtime r
    cross join (select $1::uuid organization_id) c cross join (select $2::text environment) s`,[org,environment]))[0].blocked;
}
before(async()=>{
  db=new PGlite();
  // Minimal test schema. No application database, secrets, contracts or migrations.
  await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;
    create table private.billing069_runtime(singleton boolean primary key default true check(singleton),
      checkout_mode text not null default 'disabled',environment text not null default 'test',
      confirmation_enabled boolean not null default false,test_organizations uuid[] not null default '{}',
      ${migration.match(/add column ([^;]+);/)[1]});
    create table private.billing047_audit(event text not null);
    alter table private.billing069_runtime enable row level security;
    alter table private.billing069_runtime force row level security;
    alter table private.billing047_audit enable row level security;
    alter table private.billing047_audit force row level security;
    ${functions}
    ${configure}`);
});
after(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('truncate private.billing069_runtime,private.billing047_audit;insert into private.billing069_runtime(singleton) values(true)');
});

test('default remains closed; enabling general scope does not turn on checkout or confirmation',async()=>{
  assert.equal(await allowed(A),false);
  const before=(await query('select to_jsonb(r) value from private.billing069_runtime r'))[0].value;
  await setGeneral(true);
  const after=(await query('select to_jsonb(r) value from private.billing069_runtime r'))[0].value;
  assert.deepEqual(after,{...before,test_all_organizations:true});
  assert.equal(await blocked(prepareGuard(),A),true);
  assert.equal(await blocked(startGuard(),A),true);
  assert.equal(await blocked(applyGuard(),A),true);
});
test('restricted scope preserves allowlist; general scope admits other organizations; rollback restores restriction',async()=>{
  await query('update private.billing069_runtime set test_organizations=$1',[[''+A]]);
  assert.equal(await allowed(A),true);assert.equal(await allowed(B),false);
  await setGeneral(true);assert.equal(await allowed(B),true);assert.equal(await allowed(null),false);
  await setGeneral(false);assert.equal(await allowed(A),true);assert.equal(await allowed(B),false);
  assert.deepEqual((await query('select test_organizations value from private.billing069_runtime'))[0].value,[A]);
});
test('null entries fail closed and neither null organization nor invalid environment opens scope',async()=>{
  await query('update private.billing069_runtime set test_organizations=$1',[[null]]);
  assert.equal(await allowed(B),false);
  await setGeneral(true);assert.equal(await allowed(null),false);
  await query("update private.billing069_runtime set environment='invalid'");assert.equal(await allowed(A),false);
});
test('general Sandbox cannot be enabled in production; existing production predicate remains independent',async()=>{
  await db.exec("update private.billing069_runtime set environment='production'");
  await assert.rejects(setGeneral(true),/billing_environment_mismatch/);
  assert.equal((await query('select test_all_organizations value from private.billing069_runtime'))[0].value,false);
  assert.equal(await allowed(B),true); // Existing production behavior; other production controls are unchanged.
  await setGeneral(false);
  assert.equal(await blocked(prepareGuard(),B,'production'),true); // checkout still disabled
});
test('administrative RPC is service-only; anonymous/authenticated cannot toggle or update private runtime',async()=>{
  for(const name of ['anon','authenticated']) {
    await assert.rejects(role(name,()=>query('select public.billing072_configure_sandbox(true)')),/permission denied/);
    await assert.rejects(role(name,()=>query('update private.billing069_runtime set test_all_organizations=true')),/permission denied/);
  }
  const grants=await query(`select has_function_privilege('service_role','public.billing072_configure_sandbox(boolean)','EXECUTE') admin,
    has_function_privilege('authenticated','private.billing072_organization_allowed(uuid,private.billing069_runtime)','EXECUTE') helper,
    has_table_privilege('service_role','private.billing069_runtime','UPDATE') direct`);
  assert.deepEqual(grants[0],{admin:true,helper:false,direct:false});
  const acl=await query("select relrowsecurity,relforcerowsecurity from pg_class where oid='private.billing069_runtime'::regclass");
  assert.deepEqual(acl[0],{relrowsecurity:true,relforcerowsecurity:true});
});
test('null administrative setting rejected; audit contains only transitions, not identifiers; transaction rollback',async()=>{
  await assert.rejects(setGeneral(null),/billing_configuration_invalid/);
  await setGeneral(true);await setGeneral(true);await setGeneral(false);
  assert.deepEqual(await query('select event from private.billing047_audit'),[
    {event:'stripe_sandbox_general_enabled'},{event:'stripe_sandbox_restricted_enabled'}]);
  await db.exec('begin;set local role service_role');
  await query('select public.billing072_configure_sandbox(true)');await db.exec('rollback');
  assert.equal(await allowed(B),false);
  assert.equal((await query('select count(*)::int n from private.billing047_audit'))[0].n,2);
});
test('four exact historical guards replaced, no other function content changed; 071 wrappers preserved',()=>{
  assert.equal(replacements.length,3);assert.equal(replacements.reduce((n,r)=>n+r.count,0),4);
  for(const name of ['billing069_context','billing069_prepare','billing069_service']) {
    let restored=patched(name);
    for(const r of replacements.filter(r=>r.target.startsWith('public.'+name+'(')||r.target.startsWith('public.'+name+'_pre071(')))restored=restored.replaceAll(r.newText,r.oldText);
    assert.equal(restored,definition(name));
  }
  assert.match(wrapper,/return public.billing069_prepare_pre071\(p_org,p_offer,p_key,p_trial,p_accepted\)/);
  assert.match(wrapper,/return r\|\|jsonb_build_object\('catalog',public.acquisition_plans\(\)\)/);
  assert.match(migration,/billing072_predecessor_mismatch/);
  assert.match(migration,/pg_advisory_xact_lock\(734921501\)/);
  assert.equal((migration.match(/execute replace/g)||[]).length,1);
});
test('structural rollback restores all four exact previous expressions without deleting contract or audit data',()=>{
  const rollback=readFileSync('docs/stripe-sandbox/rollback-072.sql','utf8');
  const inverse=[...rollback.matchAll(/\('([^']+)',\s*\$old\$([\s\S]*?)\$old\$,\s*\$new\$([\s\S]*?)\$new\$,(\d)\)/g)];
  assert.equal(inverse.length,3);
  for(let i=0;i<inverse.length;i++) {
    const [,target,oldText,newText,count]=inverse[i],forward=replacements[i];
    assert.equal(target,forward.target);assert.equal(oldText,forward.newText);assert.equal(newText,forward.oldText);assert.equal(Number(count),forward.count);
  }
  assert.match(rollback,/billing072_disable_general_before_rollback/);
  assert.doesNotMatch(rollback,/delete from|truncate|cascade/i);
});
test('actual SQL guards: matrix covers context, preparation, start, apply, mode, confirmation and environment mismatch',async()=>{
  for(const general of [false,true]) for(const listed of [false,true]) for(const confirmation of [false,true]) for(const mode of ['disabled','internal','stripe']) {
    await query('update private.billing069_runtime set test_all_organizations=$1,test_organizations=$2,confirmation_enabled=$3,checkout_mode=$4',
      [general,listed?[A]:[],confirmation,mode]);
    const permit=general||listed;
    assert.equal(await allowed(A),permit);
    assert.equal(await blocked(prepareGuard(),A),!(mode==='stripe'&&confirmation&&permit));
    assert.equal(await blocked(startGuard(),A),!(mode==='stripe'&&confirmation&&permit));
    assert.equal(await blocked(applyGuard(),A),!(confirmation&&permit)); // confirmation remains possible while new sales disabled
    assert.equal(await blocked(startGuard(),A,'production'),true);
    assert.equal(await blocked(applyGuard(),A,'production'),true);
  }
});

function controllerHarness({revoke=false,denial=null,mode='stripe',operations=true}={}) {
  const calls=[],org=B;
  const view=async()=>({checkout_mode:'stripe',environment:'test',stripe_available:true,confirmation_enabled:true,
    test_allowed:await allowed(org),eligibility:'eligible',subscription:null});
  const engine=stripeController({mode,gateway:{cfg:{environment:'test',operationsEnabled:operations},catalog:async()=>{calls.push('catalog');}},
    auth:async token=>token==='valid'?{id:'verified'}:null,
    asUser:async(token,name,args)=>{
      if(name==='access_session')return{};
      if(args.p_org!==org)throw Error('permission_denied');
      if(name==='billing069_context'){calls.push('context');return view();}
      assert.equal(name,'billing069_prepare');calls.push('prepare');
      if(revoke)await setGeneral(false); // stale view cannot authorize a later preparation
      if(await blocked(prepareGuard(),org))throw Error('billing_checkout_disabled');
      assert.equal(args.p_key,'20000000-0000-4000-8000-000000000001');
      assert.equal(args.p_trial,true);assert.equal(args.p_accepted,true);assert.equal(args.p_offer,'monthly');
      if(denial)throw Error(denial);
      return '20000000-0000-4000-8000-000000000002';
    },service:async(name,args)=>{assert.equal(name,'billing069_service');assert.equal(args.p_action,'lease');calls.push('lease');return null;}
  });
  const command=(extra={},token='valid')=>engine.user('command',{organization_id:org,action:'checkout',offer:'monthly',
    request_key:'20000000-0000-4000-8000-000000000001',trial_expected:true,accepted:true,...extra},token);
  return {calls,view,command};
}
async function enableFixture(){await db.exec("update private.billing069_runtime set checkout_mode='stripe',confirmation_enabled=true");await setGeneral(true);}
test('frontend and controller consume the same computed scope; general mode reaches existing preparation without granting access',async()=>{
  await enableFixture();const h=controllerHarness();
  assert.equal(canStartCheckout(await h.view()),true);
  const response=await h.command();assert.equal(response.subscription,null);
  assert.deepEqual(h.calls,['context','catalog','prepare','lease','context']);
  await setGeneral(false);const denied=controllerHarness();
  assert.equal(canStartCheckout(await denied.view()),false);
  await assert.rejects(denied.command(),/checkout_disabled/);assert.deepEqual(denied.calls,['context']);
});
test('stale frontend authorization cannot bypass current database preparation scope',async()=>{
  await enableFixture();const h=controllerHarness({revoke:true});
  assert.equal(canStartCheckout(await h.view()),true);
  await assert.rejects(h.command(),/checkout_disabled/);assert.ok(!h.calls.includes('lease'));
});
test('general scope preserves authentication, organization boundary and strict command payload',async()=>{
  await enableFixture();const h=controllerHarness();
  await assert.rejects(h.command({},'invalid'),/access_denied/);
  await assert.rejects(h.command({organization_id:A}),/permission_denied/);
  await assert.rejects(h.command({test_allowed:true}),/payload/);
  assert.ok(!h.calls.includes('catalog'));
});
test('eligibility and existing contract blockers are not replaced by general scope',async()=>{
  await enableFixture();
  for(const denial of ['billing_trial_changed','trial_review_required','billing_existing_subscription','billing_capacity_exceeded']) {
    const h=controllerHarness({denial});await assert.rejects(h.command(),new RegExp(denial));assert.ok(!h.calls.includes('lease'));
  }
  const h=controllerHarness();
  assert.equal(canStartCheckout({...await h.view(),eligibility:'verification_required'}),false);
  assert.equal(canStartCheckout({...await h.view(),subscription:{id:'existing'}}),false);
});
test('Render acquisition and operations switches remain required even with general Sandbox scope',async()=>{
  await enableFixture();
  for(const opts of [{mode:'disabled'},{mode:'internal'},{operations:false}]) {
    const h=controllerHarness(opts);await assert.rejects(h.command(),/checkout_disabled/);assert.deepEqual(h.calls,[]);
  }
});
