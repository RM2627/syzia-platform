// Operator-run only. No deployment; no account provisioning; no production data.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {validateConsumerConfig} from './consumer-config.mjs';
import {safeError} from './config.mjs';
const mode=process.argv[2]||'--read-only';let c;
try{if(!['--read-only','--mutations'].includes(mode))throw Error();c=validateConsumerConfig(JSON.parse(await readFile('.homologation/consumer.json','utf8')))}catch{console.error('Configuração de teste ausente/inválida. Nenhuma requisição enviada.');process.exit(2)}
const results=[];async function http(path,who,method='GET',body){const r=await fetch(c.url+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{apikey:c.publishableKey,Authorization:'Bearer '+(c.tokens[who]||c.publishableKey),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();return {ok:r.ok,status:r.status,data}}
async function rpc(who,name,args){const r=await http('/rest/v1/rpc/'+name,who,'POST',args);if(!r.ok)throw Object.assign(Error('rpc_failed'),{code:r.data.code});return r.data}
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name)}catch(e){results.push({name,status:'FAIL',...safeError(e)});console.log('FAIL '+name)}}
async function denied(who,name,args,code='42501'){const r=await http('/rest/v1/rpc/'+name,who,'POST',args);assert.equal(r.data.code,code)}
let A,B,adminOrg,state;
try{
 const identities={};for(const who of ['alice','bob','adminA']){const r=await http('/auth/v1/user',who);assert.ok(r.ok);identities[who]=r.data.id}assert.equal(new Set(Object.values(identities)).size,3);
 A=await rpc('anon','consumer_public_page',{p_slug:c.slugs.a});B=await rpc('anon','consumer_public_page',{p_slug:c.slugs.b});assert.ok(A&&B);assert.match(A.name,/fictíci[ao]|homologa/i);assert.match(B.name,/fictíci[ao]|homologa/i);
 const ctx=await rpc('adminA','foundation_context',{});adminOrg=ctx.organizations.find(o=>o.slug===c.slugs.a)?.id;assert.ok(adminOrg);
 await test('Projeções públicas isoladas e sem campos internos',async()=>{assert.notEqual(A.revision,B.revision);assert.ok(!/organization_id|exception_contact|internal|platform_roles|manual_sections/.test(JSON.stringify([A,B])))});
 await test('UUID/código aleatório não concede leitura',()=>denied('bob','consumer_request_context',{p_code:'r_000000000000000000000000'}));
 await test('Nenhuma escrita direta em permissões ou clientes',async()=>{for(const table of ['attendant_permissions','customers','appointments','consumer_pages']){const r=await http('/rest/v1/'+table+'?organization_id=eq.'+adminOrg,'alice','PATCH',{organization_id:adminOrg});assert.ok(!r.ok)}});
 await test('Hash de link não é exposto por PostgREST',async()=>{const r=await http('/rest/v1/request_access_tokens?select=*','alice');assert.ok(r.ok);assert.deepEqual(r.data,[])});
 if(mode==='--mutations'){
 const service=A.services.find(s=>s.price_mode==='fixed'&&s.direct_booking);assert.ok(service,'Prepare um serviço fixo e agendável.');
 const answers=Object.fromEntries(service.questions.map(q=>[q.code,q.kind==='choice'?q.options[0]:q.kind==='number'?1:q.kind==='boolean'?true:'Resposta fictícia']));
 const args={p_slug:c.slugs.a,p_revision:A.revision,p_service:service.code,p_addons:[],p_answers:answers,p_customer:{name:'Consumidor fictício de homologação',whatsapp:'81999990000',email:null,notice_version:'consumer-v1',accepted_notice:true},p_notes:'Homologação técnica; dados fictícios.',p_contact:false,p_expected_cents:service.price_cents,p_key:randomUUID()};
 await test('Preço manipulado é recusado pelo PostgREST',()=>denied('alice','consumer_create_request',{...args,p_expected_cents:service.price_cents+1},'22023'));
 const qa=await rpc('alice','consumer_create_request',args),qb=await rpc('bob','consumer_create_request',{...args,p_key:randomUUID()});
 await test('Repetição de criação idempotente',async()=>assert.deepEqual(await rpc('alice','consumer_create_request',args),qa));
 for(const [who,q]of [['alice',qa],['bob',qb]])await rpc(who,'consumer_submit_request',{p_code:q.code,p_attachment_count:0,p_key:randomUUID()});
 await test('Mesmo telefone não concede identidade entre consumidores',()=>denied('bob','consumer_request_context',{p_code:qa.code}));
 await test('RLS de clientes e solicitações com JWT real',async()=>{const r=await http('/rest/v1/quote_requests?select=public_code&public_code=eq.'+qa.code,'bob');assert.ok(r.ok);assert.deepEqual(r.data,[])});
 const link=await rpc('alice','consumer_create_tracking_link',{p_code:qa.code,p_manage:false});await rpc('bob','consumer_redeem_tracking_link',{p_code:qa.code,p_secret:link.secret});
 await test('Link de consulta não permite mutação',()=>denied('bob','consumer_set_contact',{p_code:qa.code,p_allowed:true}));await rpc('alice','consumer_revoke_tracking',{p_code:qa.code});
 await test('Revogação bloqueia sessão previamente existente',()=>denied('bob','consumer_request_context',{p_code:qa.code}));
 const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10),slots=await rpc('anon','consumer_slots',{p_slug:c.slugs.a,p_service:service.code,p_addons:[],p_day:day});assert.ok(slots.length);
 await test('Duas requisições HTTP paralelas obtêm exatamente uma reserva',async()=>{const argsA={p_code:qa.code,p_start:slots[0],p_previous:null,p_key:randomUUID()},argsB={...argsA,p_code:qb.code,p_key:randomUUID()};const r=await Promise.all([http('/rest/v1/rpc/consumer_book','alice','POST',argsA),http('/rest/v1/rpc/consumer_book','bob','POST',argsB)]);assert.equal(r.filter(x=>x.ok).length,1);assert.equal(r.filter(x=>x.data.code==='23P01').length,1)});
 state={projectRef:c.projectRef,users:identities,requests:{alice:qa.code,bob:qb.code},slug:c.slugs.a,service:service.code,day};await writeFile('.homologation/consumer-state.json',JSON.stringify(state,null,2),{mode:0o600});
 }
}catch(e){results.push({name:'Pré-condições/fixtures',status:'FAIL',...safeError(e)})}
await mkdir('reports',{recursive:true});await writeFile('reports/phase-4-http-external.json',JSON.stringify({environment:'Supabase externo executado pelo operador',at:new Date().toISOString(),mode,tests:results,scope:'Somente testes listados; não certifica Storage/CAPTCHA/SMTP/restauração ou toda a Fase 4.'},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
