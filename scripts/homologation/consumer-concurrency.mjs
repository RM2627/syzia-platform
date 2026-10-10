// Two independent PostgreSQL connections. Operator-only; dedicated test project.
import {readFile,writeFile} from 'node:fs/promises';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateConsumerConfig} from './consumer-config.mjs';
import {safeError} from './config.mjs';
let config,state,url;
try{config=validateConsumerConfig(JSON.parse(await readFile('.homologation/consumer.json','utf8')));state=JSON.parse(await readFile('.homologation/consumer-state.json','utf8'));assert.equal(state.projectRef,config.projectRef);url=new URL(process.env.CONSUMER_TEST_DATABASE_URL);assert.ok(url.hostname===`db.${config.projectRef}.supabase.co`||decodeURIComponent(url.username).endsWith('.'+config.projectRef));assert.equal(url.protocol,'postgresql:')}catch{console.error('Conexão de teste ou estado inválido. Nenhuma conexão aberta.');process.exit(2)}
const a=new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true}}),b=new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true}});const results=[];let waiting;
async function setup(client,who){await client.query('begin');await client.query("set local statement_timeout='15s'");await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:state.users[who],role:'authenticated'})]);await client.query('set local role authenticated')}
try{
 await a.connect();await b.connect();const pids=await Promise.all([a.query('select pg_backend_pid() pid'),b.query('select pg_backend_pid() pid')]);assert.notEqual(pids[0].rows[0].pid,pids[1].rows[0].pid);
 // New unreserved requests are required. HTTP probe may already have booked one; cancel through UI first.
 await setup(a,'alice');await setup(b,'bob');const slots=(await a.query('select consumer_request_slots($1,$2) slots',[state.requests.alice,state.day])).rows[0].slots;assert.ok(slots.length);
 await a.query('select pg_advisory_xact_lock(734921501)');
 let secondFinished=false;waiting=b.query('select consumer_book($1,$2,null,$3)',[state.requests.bob,slots[0],randomUUID()]).then(r=>({ok:true,r}),e=>({ok:false,e})).finally(()=>{secondFinished=true});
 await a.query('select pg_sleep(0.25)');assert.equal(secondFinished,false,'Second connection must wait behind authorization lock');
 await a.query('select consumer_book($1,$2,null,$3)',[state.requests.alice,slots[0],randomUUID()]);await a.query('commit');const second=await waiting;assert.equal(second.ok,false);assert.equal(second.e.code,'23P01');await b.query('rollback');results.push({name:'Conexões independentes: apenas um vencedor no mesmo horário',status:'PASS'});
 await setup(a,'alice');const qa=(await a.query('select consumer_request_context($1) q',[state.requests.alice])).rows[0].q;const original=qa.appointments.find(x=>x.state==='confirmed');assert.ok(original);await a.query('commit');
 await setup(b,'bob');const next=(await b.query('select consumer_request_slots($1,$2) slots',[state.requests.bob,state.day])).rows[0].slots;assert.ok(next.length);await b.query('select consumer_book($1,$2,null,$3)',[state.requests.bob,next[0],randomUUID()]);await b.query('commit');
 await setup(a,'alice');await a.query('savepoint attempted_move');try{await a.query('select consumer_book($1,$2,$3,$4)',[state.requests.alice,next[0],original.code,randomUUID()]);throw Error('Overlap was accepted')}catch(e){assert.equal(e.code,'23P01');await a.query('rollback to savepoint attempted_move')};const after=(await a.query('select consumer_request_context($1) q',[state.requests.alice])).rows[0].q;assert.equal(new Date(after.appointments.find(x=>x.state==='confirmed').starts_at).getTime(),new Date(original.starts_at).getTime());await a.query('rollback');results.push({name:'Remarcação concorrente falha e preserva reserva anterior',status:'PASS'});
}catch(e){results.push({name:'Concorrência independente',status:'FAIL',...safeError(e)})}finally{await a.query('rollback').catch(()=>{});await b.query('rollback').catch(()=>{});await waiting;await Promise.allSettled([a.end(),b.end()])}
await writeFile('reports/phase-4-concurrency-external.json',JSON.stringify({environment:'PostgreSQL real do projeto dedicado; duas conexões independentes',at:new Date().toISOString(),tests:results,cleanup:'As reservas de teste confirmadas permanecem para inspeção; cancelar pela UI.'},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
