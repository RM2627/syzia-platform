// Prepared for a dedicated external test project. Never invoked by local regression.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {validateCentralConfig} from './central-config.mjs';
if(!process.argv.includes('--read-only')){console.error('Use --read-only. Nenhuma conexão aberta.');process.exit(2)}
let c;try{c=validateCentralConfig(JSON.parse(await readFile('.homologation/operations.json','utf8')))}catch{console.error('Configuração dedicada ausente/inválida. Nenhuma conexão aberta.');process.exit(2)}
const results=[];
async function request(who,name,args){const r=await fetch(c.url+(name==='/auth/v1/user'?name:'/rest/v1/rpc/'+name),{method:args?'POST':'GET',headers:{apikey:c.publishableKey,Authorization:'Bearer '+c.tokens[who],'Content-Type':'application/json'},...(args?{body:JSON.stringify(args)}:{}),signal:AbortSignal.timeout(20000)});return {ok:r.ok,data:await r.json()}}
async function test(name,fn){try{await fn();results.push({name,status:'PASS'})}catch{results.push({name,status:'FAIL'})}}
await test('Tokens conferidos no Auth real',async()=>{for(const who of ['adminA','agentA','agentB','consumerA','consumerB']){const r=await request(who,'/auth/v1/user');assert.ok(r.ok);assert.equal(r.data.id,JSON.parse(Buffer.from(c.tokens[who].split('.')[1],'base64url')).sub)}});
await test('Gestor A recebe checklist derivada e estado pessoal',async()=>{const r=await request('adminA','onboarding_context',{p_org:c.organizations.a});assert.ok(r.ok);assert.equal(r.data.ready,r.data.items.filter(i=>i.required).every(i=>i.complete));assert.ok(r.data.items.every(i=>i.href.startsWith('/painel/'+c.organizations.a)));assert.ok(!JSON.stringify(r.data).includes(c.organizations.b))});
await test('Home A não inclui identificador de B',async()=>{const r=await request('adminA','operations_home',{p_org:c.organizations.a});assert.ok(r.ok);assert.ok(!JSON.stringify(r.data).includes(c.organizations.b))});
for(const fn of ['onboarding_context','operations_home']){
 await test(fn+': gestor A não consulta B',async()=>{const r=await request('adminA',fn,{p_org:c.organizations.b});assert.equal(r.ok,false);assert.equal(r.data.code,'42501')});
 for(const who of ['agentA','agentB','consumerA','consumerB'])await test(fn+': acesso negado a '+who,async()=>{const r=await request(who,fn,{p_org:c.organizations.a});assert.equal(r.ok,false);assert.equal(r.data.code,'42501')});
}
await writeFile('reports/operations-external-results.json',JSON.stringify({environment:'SUPABASE EXTERNO; execução solicitada pelo usuário',at:new Date().toISOString(),results},null,2));console.log(results.map(r=>r.status+' '+r.name).join('\n'));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
