import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
process.env.SYZIA_TEAM_CURRENT='1';process.env.SYZIA_FLEXIBLE_CURRENT='1';process.env.SYZIA_BILLING_CURRENT='1';process.env.SYZIA_OPTIONAL_MANUAL_CURRENT='0';
const h=await import('../support/current-db.mjs');
const {db,as,scalar,orgs,users}=h;
const rpc=async(name,args={})=>{const m=(await db.query("select proargnames,proargtypes::oid[]types from pg_proc where pronamespace='public'::regnamespace and proname=$1",[name])).rows[0];return scalar(`select public.${name}(${m.proargnames.map((n,i)=>`${n}=>$${i+1}`).join(',')})`,m.proargnames.map((n,i)=>m.types[i]===3802?JSON.stringify(args[n]??null):args[n]??null));};
async function snapshot(){await db.exec('reset role');const rows=(await db.query("select n.nspname||'.'||c.relname name,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private')and c.relkind='r'order by 1")).rows;for(const r of rows){r.hash=createHash('sha256').update(JSON.stringify((await db.query(`select to_jsonb(t) row from ${r.name} t order by to_jsonb(t)::text`)).rows)).digest('hex');}return rows;}
await db.exec('commit;reset role');const before=await snapshot();
// Concrete 047 baseline: employee grants + saved autonomy are insufficient without a published Manual.
await db.exec('begin');await h.grantWorker(h.allGrants);await h.autonomy(['price_list','quote_create','quote_send','schedule','discount','follow_up'],10,false);await db.exec('reset role');await db.query('update company_settings set published_manual_id=null where organization_id=$1',[orgs.A]);await as('worker');const beforePermission=await rpc('company_attendant_permission',{p_org:orgs.A,p_action:'quote_send',p_discount:0});await db.exec('rollback;reset role');
await db.exec(await readFile('supabase/migrations/202610090048_unified_backend_optional_manual.sql','utf8'));
const after=await snapshot();
if(process.env.SYZIA_OPERATION_CURRENT === "1")await(await import("../../scripts/syzia-049/fixture.mjs")).upgradeOperationFixture(db);
test.beforeEach(async()=>db.exec('begin'));
test.afterEach(async()=>db.exec('rollback;reset role'));
test.after(async()=>db.close());
async function withoutManual(mode='own'){
 await h.grantWorker(h.allGrants);await h.autonomy(['price_list','quote_create','quote_send','quote_items','schedule','reschedule','cancel','discount','follow_up','whatsapp'],10,false);
 await db.exec('reset role');await db.query("update company_settings set published_manual_id=null,support_configured=true,support_mode=$2,human_enabled=false,faq_public_enabled=false where organization_id=$1",[orgs.A,mode]);
}
const revision=()=>scalar('select revision from company_settings where organization_id=$1',[orgs.A]);
test('048-M01 upgrade sobre banco populado preserva todos os dados e RLS/FORCE RLS',()=>{assert.deepEqual(after,before);assert.equal(beforePermission,false);});
test('048-M02 empresa sem Manual publica página e conclui checklist mínimo',async()=>{
 await withoutManual();const p=await h.publish();assert.ok(p.services.length);await as('adminA');const r=await rpc('onboarding_context',{p_org:orgs.A});
 const manual=r.items.find(x=>x.id==='manual');assert.equal(manual.required,false);assert.equal(manual.complete,false);assert.equal(manual.label,'Manual da empresa — Opcional');assert.equal(r.ready,true,JSON.stringify(r.items.filter(x=>x.required&&!x.complete)));
 const checks=await rpc('company_readiness',{p_org:orgs.A});assert.ok(!('manual_published'in checks));assert.ok(Object.values(checks).every(Boolean));
 await rpc('company_set_activation',{p_org:orgs.A,p_expected_revision:await revision(),p_human:true,p_public_faq:false});
 assert.equal(await scalar('select human_enabled from company_settings where organization_id=$1',[orgs.A]),true);
 const home=await rpc('operations_home',{p_org:orgs.A});assert.ok(home);
});
test('048-M03 Manual parcial permanece rascunho e não impede publicação nem grants',async()=>{
 await withoutManual();await as('adminA');const mid=await rpc('company_create_manual',{p_org:orgs.A,p_expected_revision:await revision(),p_title:'Rascunho opcional 048'});
 await db.exec('reset role');await db.query("update manual_sections set content=''where manual_id=$1",[mid]);await h.publish();await as('worker');assert.equal(await rpc('company_attendant_permission',{p_org:orgs.A,p_action:'quote_send',p_discount:0}),true);
});
test('048-M04 funcionário próprio pode ser cadastrado e ter vínculo sem treinamento',async()=>{
 await withoutManual();await as('adminA');const result=await rpc('access_reserve',{p_org:orgs.A,p_display:'Pessoa própria fictícia 048',p_username:'equipe.propria48',p_email:'equipe048@example.invalid',p_phone:'11999994444',p_role:'own_attendant',p_key:randomUUID()});assert.ok(result.id);
 await db.exec('reset role');await db.query('insert into auth.users(id,email_confirmed_at,is_anonymous)values($1,now(),false)',[result.user_id]);await db.exec('set local role service_role');
 await rpc('access_finish_provision',{p_id:result.id,p_actor:users.adminA,p_hash:'a'.repeat(64)});await db.exec('reset role');assert.equal(await scalar('select is_attendant from organization_members where organization_id=$1 and user_id=$2',[orgs.A,result.user_id]),true);
});
test('048-M05 atendimento próprio assume e responde sem Manual',async()=>{
 await withoutManual();await h.publish();await as('worker');await rpc('central_presence',{p_state:'available'});
 await db.exec('reset role');await db.query("update tickets set assignee_id=null,state='queued',routing_scope='company'where public_code=$1",[h.legacy.codes.A]);await as('worker');
 let ctx=await rpc('central_context',{p_code:h.legacy.codes.A});await rpc('central_act',{p_code:h.legacy.codes.A,p_revision:ctx.ticket.revision,p_action:'claim',p_data:{},p_key:randomUUID()});
 ctx=await rpc('central_context',{p_code:h.legacy.codes.A});assert.equal(ctx.manual.id,null);await rpc('central_act',{p_code:h.legacy.codes.A,p_revision:ctx.ticket.revision,p_action:'message',p_data:{body:'Resposta da equipe própria sem Manual.'},p_key:randomUUID()});
 await as('alice');const thread=await rpc('central_consumer_thread',{p_request:h.legacy.requests.A});assert.ok(thread.messages.some(x=>x.body==='Resposta da equipe própria sem Manual.'));
});
test('048-M06 solicitação, proposta por funcionário, aprovação e Agenda continuam sem Manual',async()=>{
 await withoutManual();const {q}=await h.review();const proposal=await h.proposal(q,[h.line()],h.discount,'worker');assert.ok(proposal.r.code);await h.approve(q,proposal.r);assert.ok((await h.records(q)).length);
});
test('048-M07 autonomia salva limita descontos sem exigir publicação',async()=>{
 await withoutManual();await as('worker');assert.equal(await rpc('company_attendant_permission',{p_org:orgs.A,p_action:'discount',p_discount:10}),true);assert.equal(await rpc('company_attendant_permission',{p_org:orgs.A,p_action:'discount',p_discount:11}),false);
 assert.equal((await rpc('operations_quote_catalog',{p_org:orgs.A})).max_discount_percent,10);
 await h.grants('worker',h.quoteGrants);await as('worker');assert.equal((await rpc('operations_quote_catalog',{p_org:orgs.A})).max_discount_percent,10, 'Orçamentos próprios não exigem grants da Central para respeitar autonomia de preço');
 await h.autonomy(['price_list','quote_send'],0,false);await as('worker');assert.equal(await rpc('company_attendant_permission',{p_org:orgs.A,p_action:'discount',p_discount:1}),false);assert.equal((await rpc('operations_quote_catalog',{p_org:orgs.A})).max_discount_percent,0);
});
test('048-M08 retirada de grant e isolamento A/B continuam bloqueando',async()=>{
 await withoutManual();await h.grants('worker',h.centralGrants);await as('worker');assert.equal(await rpc('company_attendant_permission',{p_org:orgs.A,p_action:'quote_send',p_discount:0}),false);
 await h.denied(()=>rpc('onboarding_context',{p_org:orgs.B}));await as('adminB');await h.denied(()=>rpc('consumer_page_draft',{p_org:orgs.A,p_show_prices:true}));
});
test('048-M09 compartilhado sem Manual fica impedido; equipe própria opera no modo misto',async()=>{
 await withoutManual('mixed');await h.publish();await as('shared');assert.equal(await rpc('company_attendant_permission',{p_org:orgs.A,p_action:'quote_send',p_discount:0}),false);
 await db.exec('reset role');assert.equal(await scalar('select private.central_eligible($1,$2)',[orgs.A,users.shared]),false);
 await as('worker');assert.equal(await rpc('company_attendant_permission',{p_org:orgs.A,p_action:'quote_send',p_discount:0}),true);
 await as('adminA');const onboarding=await rpc('onboarding_context',{p_org:orgs.A});assert.equal(onboarding.ready,true);assert.equal(onboarding.items.find(x=>x.id==='human_ready').complete,false);
 await h.denied(async()=>rpc('company_set_activation',{p_org:orgs.A,p_expected_revision:await revision(),p_human:true,p_public_faq:false}),/company_not_ready_for_human/);
});
test('048-M10 Manual completo e suporte compartilhado mantêm exigências e autonomia',async()=>{
 await h.autonomy(['price_list','quote_create','quote_send'],0,true);await as('shared');assert.equal(await rpc('company_attendant_permission',{p_org:orgs.A,p_action:'quote_send',p_discount:0}),true);
 await h.autonomy(['price_list','quote_create','quote_send','follow_up'],0,false);await as('shared');assert.equal(await rpc('company_attendant_permission',{p_org:orgs.A,p_action:'follow_up',p_discount:0}),false);
});
test('048-M11 Comercial usa autonomia e horário explícito sem Manual',async()=>{
 await withoutManual();await db.exec('reset role');assert.equal(await scalar('select private.commercial_can_operate($1,$2)',[orgs.A,users.worker]),true);const cfg=await scalar("select private.commercial_effective($1,null,'quote_followup')",[orgs.A]);assert.ok(cfg.contact_hours.length);
 await as('worker');assert.ok(await rpc('commercial_list',{p_filters:{org:orgs.A},p_offset:0}));
});
test('048-M12 publicação ainda rejeita dados mínimos ausentes',async()=>{
 await withoutManual();await db.exec('reset role');await db.query("update company_settings set description=''where organization_id=$1",[orgs.A]);await as('adminA');const d=await rpc('consumer_page_draft',{p_org:orgs.A,p_show_prices:true});assert.equal(d.ready,false);await h.denied(()=>rpc('consumer_publish_draft',{p_org:orgs.A,p_token:d.token,p_show_prices:true,p_expected_revision:d.page_revision}),/page_not_ready/);
});
test('048-M13 nova empresa com zero versões de Manual publica com os dados mínimos',async()=>{
 await as('root');const id=await scalar('select foundation_create_organization($1,$2,$3)',['Empresa nova fictícia 048','nova048',users.adminB]);
 await rpc('billing_exemption_set',{p_org:id,p_kind:'internal',p_capabilities:{software:true,human_support:false,commercial_followups:true},p_reason:'Empresa descartável de teste local 048',p_key:randomUUID()});
 await as('adminB');const verification=await rpc('access_verification_context',{p_org:id});await rpc('access_verify_document',{p_org:id,p_kind:'CPF',p_document:'52998224725',p_revision:verification.revision,p_key:randomUUID()});
 await rpc('company_initialize',{p_org:id});
 await db.exec('reset role');await db.query("update company_settings set description='Empresa nova fictícia para teste local',service_regions='São Paulo',payment_methods='Na empresa',business_hours=$2,support_configured=true,support_mode='own'where organization_id=$1",[id,JSON.stringify([{day:1,open:'09:00',close:'17:00'}])]);
 await as('adminB');await rpc('company_save',{p_org:id,p_entity:'service',p_id:null,p_expected_revision:await scalar('select revision from company_settings where organization_id=$1',[id]),p_data:{name:'Serviço novo fictício',price_mode:'fixed',price_cents:10000,duration_minutes:60,active:true,quotes_allowed:true}});
 const d=await rpc('consumer_page_draft',{p_org:id,p_show_prices:true});assert.equal(d.ready,true);await rpc('consumer_publish_draft',{p_org:id,p_token:d.token,p_show_prices:true,p_expected_revision:d.page_revision});
 assert.equal(await scalar('select count(*)::int from manual_versions where organization_id=$1',[id]),0);const setup=await rpc('onboarding_context',{p_org:id});assert.equal(setup.ready,true);assert.equal(setup.items.find(x=>x.id==='manual').required,false);
});
test('048-M14 proposta da Central sem Manual registra auditoria com vínculo opcional',async()=>{
 await withoutManual();const {p,s}=await h.setup({mode:'fixed',contract:'evaluation'});const q=await h.draft(p,[h.empty(s)]);await h.complete(q,(await h.slots(p,[h.empty(s)]))[0]);
 await db.exec('reset role');const ticket=await scalar('select public_code from tickets where request_id=(select id from quote_requests where public_code=$1)',[q.code]);await db.query("update tickets set assignee_id=null,state='queued',routing_scope='company'where public_code=$1",[ticket]);await as('worker');await rpc('central_presence',{p_state:'available'});
 let ctx=await rpc('central_context',{p_code:ticket});await rpc('central_act',{p_code:ticket,p_revision:ctx.ticket.revision,p_action:'claim',p_data:{},p_key:randomUUID()});ctx=await rpc('central_context',{p_code:ticket});
 const result=await rpc('central_review_quote',{p_code:ticket,p_revision:ctx.ticket.revision,p_discount:10,p_expires:h.expiry(),p_reason:'Desconto dentro da autonomia definida',p_expected_cents:9000,p_key:randomUUID(),p_positions:[0]});assert.ok(result.code);
 await db.exec('reset role');const audit=(await db.query('select manual_id,discount_percent from central_quote_actions where version_id=(select id from quote_versions where public_code=$1)',[result.code])).rows[0];assert.equal(audit.manual_id,null);assert.equal(audit.discount_percent,10);
});
