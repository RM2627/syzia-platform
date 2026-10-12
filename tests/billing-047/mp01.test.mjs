// MP-01: offline evidence only. This suite never authenticates to Mercado Pago.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { MercadoPagoSubscriptions, verifiedSnapshot } from '../../server/billing/mercado-pago.mjs';
import { createBillingServer } from '../../server/billing/http.mjs';
import { fixture } from './fixture.mjs';
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  if (new URL(url).hostname !== '127.0.0.1') throw Error('MP01_external_network_forbidden');
  return realFetch(url, init);
};
const opts = { accessToken:'offline-only', collectorId:101, applicationId:202, publicKey:'offline-public',
  notificationUrl:'https://api.example.invalid/billing/notifications', appOrigin:'https://app.example.invalid' };
const secret = 'offline-hmac-fixture-only';
const raw = (type, id, extra = {}) => Buffer.from(JSON.stringify({type, data:{id}, ...extra}));
function signed(id, ts = '1780000000', requestId = 'offline-request-1') {
  const v1 = createHmac('sha256', secret).update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
  return { 'x-signature':`ts=${ts},v1=${v1}`, 'x-request-id':requestId };
}
const signedGateway = mode => new MercadoPagoSubscriptions({...opts, notificationAuth:mode, webhookSecret:secret});

test('MP01-01 segredo configurado não permite remover HMAC no modo resource_lookup', () => {
  const g = signedGateway('resource_lookup');
  assert.throws(() => g.notification(raw('subscription_preapproval','abc'),{},new URLSearchParams('data.id=abc')), e => e.code==='billing_webhook_invalid' && e.status===401);
});
test('MP01-02 HMAC válido, ID/query concordantes e três tópicos financeiros', () => {
  for (const type of ['subscription_preapproval','subscription_authorized_payment','payment'])
    assert.deepEqual(signedGateway('hmac').notification(raw(type,'abc'),signed('abc'),new URLSearchParams('data.id=abc')), {type,id:'abc'});
});
test('MP01-03 HMAC inválido, request-id alterado, ID/query divergente e vendedor divergente', () => {
  const g=signedGateway('hmac'), body=raw('subscription_preapproval','abc');
  for (const headers of [{}, {...signed('abc'),'x-signature':'ts=1780000000,v1='+'0'.repeat(64)}, {...signed('abc'),'x-request-id':'different'}])
    assert.throws(()=>g.notification(body,headers,new URLSearchParams('data.id=abc')), /billing_webhook_invalid/);
  assert.throws(()=>g.notification(body,signed('abc'),new URLSearchParams('data.id=other')), /billing_webhook_invalid/);
  assert.throws(()=>g.notification(raw('subscription_preapproval','abc',{user_id:999}),signed('abc'),new URLSearchParams('data.id=abc')), /billing_binding_mismatch/);
});
test('MP01-04 replay HMAC continua apenas indício, sem confiar em status, preço ou tenant do corpo', () => {
  const g=signedGateway('hmac'), p=raw('subscription_preapproval','abc',{status:'active',amount:1,organization_id:randomUUID()});
  assert.deepEqual(g.notification(p,signed('abc'),new URLSearchParams()),{type:'subscription_preapproval',id:'abc'});
  assert.deepEqual(g.notification(p,signed('abc'),new URLSearchParams()),{type:'subscription_preapproval',id:'abc'});
});
test('MP01-05 sem segredo, resource_lookup não declara autenticação de origem; HMAC exige segredo', () => {
  const g=new MercadoPagoSubscriptions(opts);
  assert.deepEqual(g.notification(raw('payment','abc',{status:'approved'}),{},new URLSearchParams()),{type:'payment',id:'abc'});
  assert.throws(()=>new MercadoPagoSubscriptions({...opts,notificationAuth:'hmac'}),/billing_configuration_invalid/);
});
test('MP01-06 payload inválido/grande/ID inseguro; evento de plano não vira assinatura', () => {
  const g=new MercadoPagoSubscriptions(opts);
  assert.throws(()=>g.notification(Buffer.from('{'),{},new URLSearchParams()),/billing_webhook_invalid/);
  assert.throws(()=>g.notification(Buffer.alloc(16385),{},new URLSearchParams()),/billing_webhook_invalid/);
  assert.throws(()=>g.notification(raw('payment','../../bad'),{},new URLSearchParams()),/billing_response_invalid/);
  assert.equal(g.notification(raw('subscription_preapproval_plan','plan'),{},new URLSearchParams()),null);
  assert.equal(g.notification(Buffer.from(JSON.stringify({topic:'preapproval',id:'abc'})),{},new URLSearchParams()),null);
});

const c=await fixture();
test.after(()=>c.db.close());
let a, providerA;
test('MP01-07 criação herda plano e não inventa start_date/free_trial/notification contract', async()=>{
  const transport=c.gateway.fetchImpl, sent=[];
  c.gateway.fetchImpl=async(url,init)=>{ if(init.method==='POST')sent.push(JSON.parse(init.body)); return transport(url,init); };
  try {
    a=await c.command(); providerA=[...c.fake.subscriptions.values()][0];
    assert.equal(a.subscription.state,'trialing');
    assert.equal(sent[0].preapproval_plan_id,'essencial-trial');
    assert.equal(sent[0].status,'authorized');
    assert.equal(sent[0].notification_url,c.gateway.notificationUrl);
    assert.equal(sent[0].auto_recurring,undefined);
    assert.equal(sent[0].transaction_amount,undefined);
    assert.equal(sent[0].first_invoice_offset,undefined);
  } finally {c.gateway.fetchImpl=transport;}
});
test('MP01-08 ausência de fatura não prova pagamento; authorized depende de trial confirmado', async()=>{
  const b=await c.service('billing047_service',{p_action:'get',p_id:a.subscription.id,p_data:{}});
  const snap=await verifiedSnapshot(c.gateway,b);
  assert.equal(snap.payments.length,0);assert.equal(snap.method_linked,true);
  assert.equal(Date.parse(snap.trial_end)-Date.parse(snap.trial_start),7*86400000);
  assert.equal((await c.view()).subscription.state,'trialing');
});
test('MP01-09 next_payment_date igual à criação é divergência, não trial homologado', async()=>{
  const b=await c.service('billing047_service',{p_action:'get',p_id:a.subscription.id,p_data:{}});
  const p=structuredClone(providerA);p.next_payment_date=p.date_created;
  await assert.rejects(verifiedSnapshot(c.gateway,b,p),/billing_trial_mismatch/);
  p.first_invoice_offset=7;await assert.rejects(verifiedSnapshot(c.gateway,b,p),/billing_trial_mismatch/);
  p.next_payment_date=providerA.next_payment_date;delete p.auto_recurring.free_trial;
  await assert.rejects(verifiedSnapshot(c.gateway,b,p),/billing_trial_mismatch/);
});
test('MP01-10 HTTP sem HMAC configurado falha antes de consultar recursos; logs seguros', async()=>{
  const savedSecret=c.gateway.webhookSecret, logs=[];c.gateway.webhookSecret=secret;
  const server=createBillingServer({origin:'https://app.example.invalid',billing:c.engine,log:e=>logs.push(e)});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  try {
    const url=`http://127.0.0.1:${server.address().port}/billing/notifications?data.id=${providerA.id}`;
    const before=c.fake.calls.length;
    let r=await fetch(url,{method:'POST',body:raw('subscription_preapproval',providerA.id)});
    assert.equal(r.status,401);assert.equal(c.fake.calls.length,before);
    r=await fetch(url,{method:'POST',headers:signed(providerA.id),body:raw('subscription_preapproval',providerA.id)});
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{accepted:true});
    const output=JSON.stringify(logs);for(const s of [secret,opts.accessToken,providerA.id,'x-signature','card_token']) assert.ok(!output.includes(s));
  } finally {c.gateway.webhookSecret=savedSecret;await new Promise(ok=>server.close(ok));}
});
test('MP01-11 webhook repetido/retorno simultâneo/fora de ordem não duplica efeito',async()=>{
  const body=raw('subscription_preapproval',providerA.id,{status:'cancelled',version:9999});
  await Promise.all([c.engine.webhook(body,{},new URLSearchParams()),c.engine.user('status',{organization_id:c.orgs.A},'adminA')]);
  const before=(await c.rawSQL('select revision from billing_subscriptions where organization_id=$1',[c.orgs.A])).rows[0].revision;
  await c.engine.webhook(body,{},new URLSearchParams());
  assert.equal((await c.rawSQL('select revision from billing_subscriptions where organization_id=$1',[c.orgs.A])).rows[0].revision,before);
  assert.equal((await c.view()).subscription.state,'trialing');
  assert.equal((await c.rawSQL('select count(*)::int n from private.trial_grants where organization_id=$1',[c.orgs.A])).rows[0].n,1);
});
test('MP01-12 perda de webhook recupera pagamento por GET; sem cobrança paralela',async()=>{
  c.fake.charge(providerA.id,'approved');const start=c.fake.calls.length;
  const result=await c.engine.reconcile();assert.equal(result.pending,0);
  assert.equal((await c.view()).subscription.state,'active');
  assert.ok(c.fake.calls.slice(start).every(x=>x.method==='GET'));
  const n=(await c.rawSQL('select count(*)::int n from private.billing047_payments')).rows[0].n;
  await c.engine.reconcile();assert.equal((await c.rawSQL('select count(*)::int n from private.billing047_payments')).rows[0].n,n);
});
test('MP01-13 cancelamento externo é recuperado sem apagar período/histórico',async()=>{
  const until=(await c.view()).subscription.access_until;
  providerA.status='cancelled';providerA.version++;providerA.last_modified=new Date().toISOString();
  await c.engine.reconcile();const v=await c.view();
  assert.equal(v.subscription.state,'cancel_scheduled');assert.equal(v.subscription.access_until,until);
});
test('MP01-14 isolamento A/B e origem de recurso divergente não concedem acesso',async()=>{
  await assert.rejects(c.engine.user('status',{organization_id:c.orgs.A},'adminB'),/denied|scope/);
  const collector=providerA.collector_id;providerA.collector_id=999;
  try {await assert.rejects(c.engine.webhook(raw('subscription_preapproval',providerA.id),{},new URLSearchParams()),/billing_binding_mismatch/);}
  finally {providerA.collector_id=collector;}
  assert.equal((await c.view('B')).subscription,null);
});
test('MP01-15 criação com trial incoerente permanece em reconciliação; não refaz POST',async()=>{
  const transport=c.gateway.fetchImpl;
  c.gateway.fetchImpl=async(url,init)=>{
    const res=await transport(url,init);
    if(init.method==='GET' && /^\/preapproval\/subscription-/.test(new URL(url).pathname)) {
      const p=await res.json();if(p.external_reference!==a.subscription.id)p.next_payment_date=p.date_created;
      return new Response(JSON.stringify(p));
    }
    return res;
  };
  try {
    await assert.rejects(c.command('checkout','equipe','B'),/billing_trial_mismatch/);
    assert.equal((await c.view('B')).subscription.state,'reconciliation');
    assert.equal((await c.rawSQL('select count(*)::int n from private.trial_grants where organization_id=$1',[c.orgs.B])).rows[0].n,0);
    const before=c.fake.calls.filter(x=>x.method==='POST').length;
    const r=await c.engine.reconcile();assert.ok(r.pending>=1);
    assert.equal(c.fake.calls.filter(x=>x.method==='POST').length,before);
  } finally {c.gateway.fetchImpl=transport;}
  await c.engine.reconcile();assert.equal((await c.view('B')).subscription.state,'trialing');
});
test('MP01-16 provider indisponível deixa pendência e recuperação preserva contrato',async()=>{
  c.fake.failNext(async()=>new Response('{}',{status:503}));
  const r=await c.engine.reconcile();assert.ok(r.pending>=1);
  const posts=c.fake.calls.filter(x=>x.method==='POST').length;
  const again=await c.engine.reconcile();assert.equal(again.pending,0);
  assert.equal(c.fake.calls.filter(x=>x.method==='POST').length,posts);
});
