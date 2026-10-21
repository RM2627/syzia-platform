import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID, createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {demoFixture} from '../commercial-implementation/demo-fixture.mjs';
import {createDemoMediaHandler} from '../../server/commercial/media.mjs';
import {commercialController} from '../../server/commercial/controller.mjs';
import {commercialRecoveryCycle} from '../../server/commercial/runtime.mjs';
import {commercial055Manifest, assertCommercial055File} from '../support/commercial055-integrity.mjs';

let x, controller, server, base, bytes, a, b, definition, secondDefinition, logs = [], operatorActive = true;
const operator = randomUUID();
const origins = {appOrigin:'https://app.example.invalid', publicOrigin:'https://demo.example.invalid'};
const service = (name,args) => x.store.transaction(async c => {
  await c.query('set local role service_role');
  return x.store.call(c,name,args);
});
const pending = () => service('commercial_materialization_service',{p_action:'pending',p_org:null,p_assets:{}});
const reserve = session => x.store.rpc(session.token,session===b?secondDefinition:definition,'company','consumer_reserve_company_media',{
  p_org:session.organization.id,p_mime:'image/png',p_size:bytes.length,p_key:randomUUID(),
});
const headers = session => ({Origin:origins.appOrigin,Authorization:`Bearer ${session.token}.company`,'X-Commercial-Authorization':'Bearer synthetic-admin-session'});
const request = (session,code,method='GET',extra={}) => fetch(`${base}/demonstration-media/company-media/${code}`,{
  method,headers:{...headers(session),...(method==='POST'?{'Content-Type':'image/png'}:{}),...extra},
  body:method==='POST'?bytes:undefined,signal:AbortSignal.timeout(8000),
});
before(async()=>{
  x=await demoFixture();
  definition={id:randomUUID(),name:'Ateliê Aurora',slug:'atelie-aurora',generation:1,expires_at:new Date(Date.now()+86400000).toISOString()};
  a=await x.store.begin(definition,'editor',operator);
  secondDefinition={...definition,id:randomUUID(),name:'Estúdio Horizonte',slug:'estudio-horizonte'};
  b=await x.store.begin(secondDefinition,'editor',operator);
  controller=commercialController({store:x.store,service,
    auth:async token=>token==='synthetic-admin-session'&&operatorActive?{id:operator}:null,
    asUser:async(token,name,args)=>{
      assert.equal(name,'commercial_demo_edit_context');assert.equal(args.p_id,definition.id);
      if(!operatorActive||token!=='synthetic-admin-session')throw Error('access_denied');
      return definition;
    },
  });
  bytes=await sharp({create:{width:48,height:32,channels:3,background:'#406260'}}).png().withMetadata({exif:{IFD0:{Artist:'SYNTHETIC-PRIVATE-METADATA'}}}).toBuffer();
  server=http.createServer(createDemoMediaHandler({store:x.store,controller,origins,resolvePublic:async()=>definition,log:r=>logs.push(r)}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{server?.closeAllConnections();if(server)await new Promise(r=>server.close(r));await x?.store.close();});

test('HF01-A1 authorized reservation, upload, finalization, retry and sanitized download',async()=>{
  const {code}=await reserve(a);
  const up=await request(a,code,'POST');assert.equal(up.status,200,await up.text());
  assert.equal((await request(a,code,'POST')).status,200);
  const down=await request(a,code);assert.equal(down.status,200);
  const data=Buffer.from(await down.arrayBuffer());assert.equal((await sharp(data).metadata()).exif,undefined);
  const row=(await x.db.query('select state,sha256,width,height from company_media where public_code=$1',[code])).rows[0];
  assert.equal(row.state,'ready');assert.equal(row.width,48);assert.equal(row.height,32);assert.match(row.sha256,/^[a-f0-9]{64}$/);
  assert.equal((await x.db.query('select count(*)::int n from demo_private.objects')).rows[0].n,1);
});
test('HF01-A2 cross-organization media, consumer impersonation and foreign origin remain blocked',async()=>{
  const {code}=await reserve(b);
  assert.notEqual((await request(a,code,'POST')).status,200);
  const own=await reserve(a);
  assert.notEqual((await request(a,own.code,'POST',{Authorization:`Bearer ${a.token}.consumer`})).status,200);
  assert.equal((await request(a,own.code,'POST',{Origin:'https://foreign.example.invalid'})).status,403);
});
test('HF01-A3 missing/revoked administrative identity cannot restore the editor',async()=>{
  const {code}=await reserve(a);
  assert.equal((await request(a,code,'POST',{'X-Commercial-Authorization':''})).status,403);
  operatorActive=false;
  try{assert.equal((await request(a,code,'POST')).status,403);}finally{operatorActive=true;}
});
test('HF01-A4 SQL permission refusal retains HTTP 403 and emits safe gateway classification',async()=>{
  const {code}=await reserve(a);const s=await x.store.mediaContext(a.token,definition);logs=[];
  await x.db.query("update organization_members set status='suspended'where organization_id=$1 and user_id=$2",[s.organization_id,s.manager_id]);
  try {
    const r=await request(a,code,'POST');assert.equal(r.status,403);assert.equal((await r.json()).error,'access_denied');
    assert.ok(logs.some(r=>r.operation==='consumer_gateway_company_media'&&r.code==='42501'&&r.reason==='company_media_access_denied'));
    const text=JSON.stringify(logs);for(const secret of [a.token,'synthetic-admin-session',s.manager_id,'@demonstration.invalid'])assert.ok(!text.includes(secret));
  }finally{await x.db.query("update organization_members set status='active'where organization_id=$1 and user_id=$2",[s.organization_id,s.manager_id]);}
});
test('HF01-A5 expired and revoked demo sessions remain blocked',async()=>{
  for(const expired of [true,false]){
    const s=await x.store.begin(definition,'editor',operator);const {code}=await reserve(s);
    if(expired)await x.db.query("update demo_private.sessions set expires_at=clock_timestamp()-interval '1 minute'where token_hash=$1",[createHash('sha256').update(s.token).digest('hex')]);
    else await x.store.end(s.token);
    assert.equal((await request(s,code,'POST')).status,403);
  }
});
test('HF01-B1 unmodified 055 reproduces 42702 even with no pending materializations',async()=>{
  assert.equal((await x.db.query('select count(*)::int n from private.commercial_materializations')).rows[0].n,0);
  await assert.rejects(pending,e=>e.code==='42702'&&e.message.includes('b.organization_id'));
  let cleaned=false;const records=[];
  await commercialRecoveryCycle({controller,store:{cleanup:async()=>{await x.store.cleanup();cleaned=true;}},log:r=>records.push(r)});
  assert.equal(cleaned,true);
  assert.deepEqual(records,[{event:'commercial_reconciliation_unavailable',stage:'materialization_reconcile',code:'42702'}]);
});
test('HF01-B2 guarded SQL fixes the alias only; grants, owner, RLS, history and repeated application preserved',async()=>{
  const metadata=async()=>({
    functions:(await x.db.query("select proowner,proacl,prosecdef,proconfig from pg_proc where oid='public.commercial_materialization_service(text,uuid,jsonb)'::regprocedure")).rows,
    tables:(await x.db.query("select oid,relrowsecurity,relforcerowsecurity from pg_class where relnamespace in('private'::regnamespace,'public'::regnamespace,'demo_private'::regnamespace)order by oid")).rows,
    media:(await x.db.query('select to_jsonb(m) v from company_media m order by id')).rows,
  });
  const previous=await metadata(), sql=await readFile('scripts/commercial/hf01-reconciliation.sql','utf8');
  // Inject a failure before COMMIT: function change must roll back too.
  await assert.rejects(x.db.exec(sql.replace(/commit;\s*$/,'select 1/0;commit;')),/division by zero/);await x.db.exec('rollback');
  await assert.rejects(pending,e=>e.code==='42702');
  await x.db.exec(sql);await x.db.exec(sql);assert.deepEqual(await pending(),[]);assert.deepEqual(await controller.reconcile(),[]);
  assert.deepEqual(await metadata(),previous);
  const grants=(await x.db.query("select has_function_privilege('service_role','public.commercial_materialization_service(text,uuid,jsonb)','EXECUTE') service,has_function_privilege('authenticated','public.commercial_materialization_service(text,uuid,jsonb)','EXECUTE') authenticated")).rows[0];
  assert.deepEqual(grants,{service:true,authenticated:false});
  const rollback=await readFile('scripts/commercial/hf01-reconciliation-rollback.sql','utf8');await x.db.exec(rollback);await x.db.exec(rollback);
  await assert.rejects(pending,e=>e.code==='42702');await x.db.exec(sql);assert.deepEqual(await pending(),[]);
});
test('HF01-B3 cleanup errors and pending results are distinguishable; raw secrets never logged',async()=>{
  const records=[];
  await commercialRecoveryCycle({controller:{reconcile:async()=>[{organization_id:'PRIVATE-ID',error:'RAW-SECRET'}]},store:{cleanup:async()=>{throw {code:'42P01',message:'token=PRIVATE; person@example.invalid',details:'sensitive'};}},log:r=>records.push(r)});
  assert.deepEqual(records,[{event:'commercial_reconciliation_pending',stage:'materialization_reconcile'},{event:'commercial_reconciliation_unavailable',stage:'demo_cleanup',code:'42P01'}]);
  records.length=0;
  await commercialRecoveryCycle({controller:{reconcile:async()=>{throw {code:'SECRET',message:'PRIVATE'};}},store:{cleanup:async()=>{}},log:r=>records.push(r)});
  assert.equal(records[0].code,'unclassified');assert.ok(!JSON.stringify(records).includes('PRIVATE'));
});
test('HF01-I authorized files accept LF/CRLF only; content changes and false predecessors are rejected',async()=>{
  for(const p of ['server/commercial/media.mjs','server/commercial/runtime.mjs']) {
    const bytes=await readFile(p), previous=commercial055Manifest.transitions[p].before[0];
    assertCommercial055File(p,bytes,previous);
    assertCommercial055File(p,Buffer.from(bytes.toString().replaceAll('\r\n','\n').replaceAll('\n','\r\n')),previous);
    assert.throws(()=>assertCommercial055File(p,Buffer.concat([bytes,Buffer.from('UNAUTHORIZED')]),previous),/mismatch/);
    assert.throws(()=>assertCommercial055File(p,bytes,'0'.repeat(64)),/predecessor/);
  }
});
