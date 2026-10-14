import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import sharp from 'sharp';
import { createUnifiedServer, startUnified, scheduleReconciliation, unifiedRuntime } from '../../server/unified.mjs';
import { fixture } from '../billing-047/fixture.mjs';
import { randomUUID } from 'node:crypto';
process.env.SYZIA_OPTIONAL_MANUAL_CURRENT='0';
const origin='https://app.example.invalid';
const c=await fixture({afterUpgrade:async c=>c.db.exec(await (await import('node:fs/promises')).readFile('supabase/migrations/202610090048_unified_backend_optional_manual.sql','utf8')).then(async()=>{if(process.env.SYZIA_OPERATION_CURRENT==='1')await(await import('../../scripts/syzia-049/fixture.mjs')).upgradeOperationFixture(c.db);})});
const logs=[],stored=new Map(),records=new Map();
const sid='session-fixture-048',jwt='x.'+Buffer.from(JSON.stringify({session_id:sid})).toString('base64url')+'.x';
const bytes=await sharp({create:{width:48,height:48,channels:3,background:'#32465a'}}).png().toBuffer();
const code='m_'+'1'.repeat(24),privateCode='f_'+'2'.repeat(24);
for(const value of [code,privateCode])records.set(value,{path:'tenant-a/'+value,mime:'image/png',size:bytes.length,state:'pending'});
let rejectStorage=false,delayResolve;
const runtime={
 platform:{origin,access:async (path,body,ctx)=>{if(path==='/access/context'&&ctx.token!=='allowed')throw Object.assign(Error('access_denied'),{code:'access_denied'});if(body.delay)await new Promise(r=>delayResolve=r);return {ok:true,path};}},
 attachments:{origin,verifier:{auth:{getUser:async token=>({data:{user:token===jwt?{id:c.users.adminA}:null}})}},server:{rpc:async(name,args)=>{
  const key=(args.p_args||args).p_code,r=records.get(key);
  if(!r||args.p_session&&args.p_session!==sid)return {error:{code:'42501'}};
  if(name==='access_media'&&args.p_args.p_ticket!==undefined&&args.p_args.p_ticket!=='ticket-a')return {error:{code:'42501'}};
  if(args.p_operation?.startsWith('consumer_finalize'))r.state='ready';
  return {data:r};
 },storage:{from:()=>({upload:async(path,data)=>{if(rejectStorage)return {error:{statusCode:503}};stored.set(path,data);return {};},download:async path=>stored.has(path)?{data:new Blob([stored.get(path)])}:{error:{statusCode:404}}})}}},
 billing:{origin,billing:c.engine},
};
const app=await startUnified({runtime,env:{PORT:'0',HOST:'127.0.0.1'},signals:false,log:x=>logs.push(x)});
const base='http://127.0.0.1:'+app.server.address().port;
const post=(path,body={},token='adminA',extra={})=>fetch(base+path,{method:'POST',headers:{origin,authorization:'Bearer '+token,'content-type':'application/json',...extra},body:JSON.stringify(body)});
test.after(async()=>{await app.stop();await c.db.close();});
test('048-H01 uma porta: health, plataforma, billing e mídia usam os handlers existentes',async()=>{
 const health=await fetch(base+'/health');assert.equal(health.status,200);assert.deepEqual((await health.json()).modules,['platform','attachments','billing']);
 assert.equal((await post('/access/identity-login')).status,200);
 assert.equal((await post('/billing/config',{})).status,200);
 assert.equal(app.server.listening,true);assert.equal(app.server.requestTimeout,60000);assert.equal(app.server.headersTimeout,15000);
 assert.equal((await fetch(base+'/unknown')).status,404);
});
test('048-H02 CORS exato, preflight e autenticação continuam por módulo',async()=>{
 for(const path of ['/access/context','/billing/config','/company-media/'+code]){
  assert.equal((await fetch(base+path,{method:'OPTIONS',headers:{origin:'https://evil.example.invalid'}})).status,403);
  const pre=await fetch(base+path,{method:'OPTIONS',headers:{origin}});assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),origin);
 }
 assert.equal((await post('/access/context',{},'unauthorized')).status,400);
 assert.equal((await fetch(base+'/company-media/'+code,{headers:{origin}})).status,401);
 assert.notEqual((await post('/billing/status',{organization_id:c.orgs.A},'unknown')).status,200);
});
test('048-H03 upload/download sanitizado, anexo privado, ticket, mídia pública e isolamento',async()=>{
 for(const [path,key]of [['company-media',code],['attachments',privateCode]]){
  const up=await fetch(base+'/'+path+'/'+key,{method:'POST',headers:{origin,authorization:'Bearer '+jwt,'content-type':'image/png'},body:bytes});assert.equal(up.status,200,await up.text());
  const get=await fetch(base+'/'+path+'/'+key,{headers:{origin,authorization:'Bearer '+jwt,'x-download-ticket':'ticket-a'}});assert.equal(get.status,200);assert.ok((await get.arrayBuffer()).byteLength>0);assert.equal(get.headers.get('cache-control'),'no-store');
 }
 assert.equal((await fetch(base+'/attachments/'+privateCode,{headers:{origin,authorization:'Bearer '+jwt,'x-download-ticket':'tenant-b'}})).status,403);
 assert.equal((await fetch(base+'/media/'+code)).status,200);
 assert.equal((await fetch(base+'/company-media/m_'+'9'.repeat(24),{headers:{origin,authorization:'Bearer '+jwt}})).status,403);
});
test('048-H04 checkout simulado, duas abas, webhook sem Origin, duplicação e reconciliação',async()=>{
 const payload={organization_id:c.orgs.A,action:'checkout',request_key:randomUUID(),plan_version_id:c.versions.essencial,card_token:'offline-token-for-048-tests',trial_expected:true,payer_email:'titular@example.invalid'};
 const result=await post('/billing/command',payload);assert.equal(result.status,200,await result.clone().text());assert.equal((await result.json()).subscription.state,'trialing');
 const both=await Promise.all([post('/billing/command',payload),post('/billing/command',payload)]);assert.ok(both.every(x=>x.status===200));
 const p=[...c.fake.subscriptions.values()][0],hook=JSON.stringify({type:'subscription_preapproval',data:{id:p.id},user_id:101});
 for(let i=0;i<2;i++){const r=await fetch(base+'/billing/notifications',{method:'POST',body:hook});assert.equal(r.status,200,await r.text());}
 const r=await c.engine.reconcile();assert.equal(r.pending,0);assert.equal(c.fake.calls.filter(x=>x.method==='POST').length,1);
 assert.notEqual((await post('/billing/status',{organization_id:c.orgs.A},'adminB')).status,200);
 assert.equal((await c.view()).subscription.state,'trialing');
});
test('048-H05 erros e limites não vazam tokens, URLs nem corpo',async()=>{
 const secret='sensitive-canary-048';const bad=await fetch(base+'/access/login',{method:'POST',headers:{origin},body:'{'+secret});assert.notEqual(bad.status,200);
 const tooBig=await post('/access/login',{value:secret+'a'.repeat(5000)});assert.equal(tooBig.status,413);
 const tooBigBilling=await post('/billing/status',{value:secret+'a'.repeat(17000)});assert.equal(tooBigBilling.status,413);
 records.get(code).state='pending';rejectStorage=true;
 assert.equal((await fetch(base+'/company-media/'+code,{method:'POST',headers:{origin,authorization:'Bearer '+jwt,'content-type':'image/png'},body:bytes})).status,503);rejectStorage=false;
 assert.ok(!JSON.stringify(logs).includes(secret));assert.ok(!JSON.stringify(logs).includes(jwt));assert.ok(!JSON.stringify(logs).includes('offline-token'));
});
test('048-H06 reconciliador não sobrepõe execuções e para junto do servidor',async()=>{
 let calls=0,release;const job=scheduleReconciliation(async()=>{calls++;await new Promise(r=>release=r);return {inspected:1,succeeded:1,pending:0};},{intervalMs:100000,log:()=>{}});
 const running=job.run();await Promise.resolve();await job.run();assert.equal(calls,1);release();await running;await job.stop();await job.run();assert.equal(calls,1);
});
test('048-H07 encerramento drena requisição em andamento sem truncar resposta',async()=>{
 const local=await startUnified({runtime,env:{PORT:'0',HOST:'127.0.0.1'},signals:false,log:()=>{}});
 const request=fetch('http://127.0.0.1:'+local.server.address().port+'/access/login',{method:'POST',headers:{origin},body:'{"delay":true}'});
 while(!delayResolve)await new Promise(r=>setTimeout(r,5));const closing=local.stop();delayResolve();assert.equal((await request).status,200);assert.equal((await closing).forced,false);assert.equal(local.server.listening,false);
});
test('048-H08 entrada de produção usa PORT, um Node, e responde a SIGTERM',{skip:process.platform==='win32'?'Windows força encerramento via child.kill; drenagem portátil coberta pela 049-H01':false},async()=>{
 const child=spawn(process.execPath,['server/unified.mjs'],{env:{...process.env,NODE_ENV:'test',PORT:'0',HOST:'127.0.0.1',PLATFORM_APP_ORIGIN:origin,CONSUMER_ORIGIN:origin,SUPABASE_URL:'https://fixture.invalid',SUPABASE_PUBLISHABLE_KEY:'offline-public',SUPABASE_SERVICE_ROLE_KEY:'offline-service',MERCADO_PAGO_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',x=>output+=x);const exited=once(child,'exit');
 try {for(let n=0;n<200&&!output.includes('api_ready');n++)await new Promise(r=>setTimeout(r,10));const ready=output.split('\n').filter(Boolean).map(x=>JSON.parse(x)).find(x=>x.event==='api_ready');assert.ok(ready,output);assert.equal((await fetch('http://127.0.0.1:'+ready.port+'/health')).status,200);child.kill('SIGTERM');const [code]=await exited;assert.equal(code,0);assert.match(output,/api_stopped/);assert.ok(!output.includes('offline-service'));}finally{if(child.exitCode===null)child.kill('SIGKILL');}
});
test('048-H09 ausência de credenciais e origem insegura falham antes de abrir listener',()=>{
 assert.throws(()=>unifiedRuntime({PLATFORM_APP_ORIGIN:origin}),/environment|variables|Configure/);
 assert.throws(()=>unifiedRuntime({NODE_ENV:'production',PLATFORM_APP_ORIGIN:'http://app.example.invalid'}),/api_origin_invalid/);
 assert.throws(()=>unifiedRuntime({PLATFORM_APP_ORIGIN:'https://app.example.invalid/path'}),/api_origin_invalid/);
});
