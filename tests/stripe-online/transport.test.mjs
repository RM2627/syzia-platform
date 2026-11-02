import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { StripeGateway,verifyWebhook } from '../../server/billing/stripe/gateway.mjs';
import { onlineBilling } from '../../server/billing/stripe/runtime.mjs';
import { billingRuntime } from '../../server/billing/runtime.mjs';
import { createBillingServer } from '../../server/billing/http.mjs';
import { API_VERSION } from '../../server/billing/stripe/policy.mjs';
const env={STRIPE_ENABLED:'true',STRIPE_ENVIRONMENT:'test',BILLING_CHECKOUT_MODE:'disabled',PLATFORM_APP_ORIGIN:'https://app.example.invalid',STRIPE_TEST_SECRET_KEY:'sk_test_'+'x'.repeat(24),STRIPE_TEST_WEBHOOK_SECRET:'whsec_'+'y'.repeat(24),STRIPE_TEST_ACCOUNT_ID:'acct_fixture',STRIPE_TEST_PRODUCT_ID:'prod_fixture',STRIPE_TEST_PRICE_MONTHLY:'price_monthly',STRIPE_TEST_PRICE_SEMIANNUAL:'price_semiannual',STRIPE_TEST_PRICE_ANNUAL:'price_annual'};
const mp={user:async()=>({provider:'mercado_pago'}),reconcile:async()=>({inspected:1,succeeded:1,pending:0}),webhook:async()=>({accepted:true,provider:'mercado_pago'})};
test('backend selector invalid fails; disabled never falls back; MP commands retain original provider',async()=>{
 const args={env,mp,service:async()=>{},asUser:async()=>({}),auth:async()=>({id:'user'}),fetchImpl:async()=>assert.fail('external call')};
 assert.throws(()=>onlineBilling({...args,env:{...env,BILLING_CHECKOUT_MODE:'hosted'}}),/configuration_invalid/);
 const b=onlineBilling(args);await assert.rejects(b.user('command',{action:'checkout'},'token'),/disabled/);
 assert.equal((await b.user('command',{action:'cancel'},'token')).provider,'mercado_pago');
 await assert.rejects(b.user('stripe/command',{organization_id:'ignored',action:'checkout'},'token'),/payload_invalid/);
});
test('Stripe runtime works with Mercado Pago disabled; Supabase Auth identity and reinforced session used',async()=>{
 const calls=[];
 const client={auth:{getUser:async token=>({data:{user:token==='valid'?{id:'verified'}:null},error:null})},rpc:async(name,args)=>{calls.push(name);return {data:name==='billing069_context'?{checkout_mode:'disabled',provider:null}: {},error:null};}};
 const r=billingRuntime({...env,SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'simulation-only',MERCADO_PAGO_ENABLED:'false'},{createClientImpl:()=>client,fetchImpl:async()=>assert.fail('network')});
 assert.equal((await r.billing.user('checkout',{organization_id:'10000000-0000-0000-0000-000000000001'},'valid')).checkout_mode,'disabled');
 assert.deepEqual(calls,['access_session','billing069_context']);
 await assert.rejects(r.billing.user('checkout',{organization_id:'10000000-0000-0000-0000-000000000001'},'invalid'),/access_denied/);
});
test('online HTTP route keeps raw signed bytes; independent MP hook; CORS and safe failure',async()=>{
 const receipts=[],logs=[];
 const service=async(name,args)=>{receipts.push({name,args});return {accepted:true};};
 const b=onlineBilling({env,mp,service,asUser:async()=>{},auth:async()=>null,fetchImpl:async()=>assert.fail('no provider call during receipt')});
 const server=createBillingServer({origin:env.PLATFORM_APP_ORIGIN,billing:b,log:x=>logs.push(x)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  const payload={id:'evt_http',type:'customer.subscription.updated',livemode:false,data:{object:{id:'sub_http',metadata:{},email:'private@example.invalid'}}};
  const raw=Buffer.from(JSON.stringify(payload)),now=Math.floor(Date.now()/1000),signature='t='+now+',v1='+createHmac('sha256',env.STRIPE_TEST_WEBHOOK_SECRET).update(`${now}.`).update(raw).digest('hex');
  let r=await fetch(base+'/billing/stripe/notifications',{method:'POST',body:raw,headers:{'Stripe-Signature':signature}});assert.equal(r.status,200);assert.equal(receipts.length,1);
  assert.ok(!JSON.stringify(receipts).includes('private@'));
  r=await fetch(base+'/billing/stripe/notifications',{method:'POST',body:Buffer.concat([raw,Buffer.from(' ')]),headers:{'Stripe-Signature':signature}});assert.equal(r.status,400);
  r=await fetch(base+'/billing/notifications',{method:'POST',body:'{}'});assert.equal((await r.json()).provider,'mercado_pago');
  r=await fetch(base+'/billing/checkout',{method:'POST',body:'{}'});assert.equal(r.status,403);
  r=await fetch(base+'/billing/stripe/notifications',{method:'POST',body:'x'.repeat(65537)});assert.equal(r.status,413);
  assert.ok(!JSON.stringify(logs).includes('private@'));assert.ok(!JSON.stringify(logs).includes('whsec_'));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('production/test namespaces and expired signature are blocked',()=>{
 const args={env,mp,service:async()=>{},asUser:async()=>{},auth:async()=>null};
 assert.throws(()=>onlineBilling({...args,env:{...env,STRIPE_ENVIRONMENT:'production'}}),/credential_invalid/);
 assert.throws(()=>onlineBilling({...args,env:{...env,STRIPE_PRODUCTION_PRODUCT_ID:env.STRIPE_TEST_PRODUCT_ID}}),/overlap/);
 assert.throws(()=>verifyWebhook(Buffer.from('{}'),'t=1000000000,v1='+'0'.repeat(64),env.STRIPE_TEST_WEBHOOK_SECRET),/signature/);
});
test('Super Admin preflight checks official catalog and DB mapping without POST',async()=>{
 const calls=[],mapping=['monthly','semiannual','annual'].map(code=>({code,account_id:env.STRIPE_TEST_ACCOUNT_ID,product_id:env.STRIPE_TEST_PRODUCT_ID,price_id:'price_'+code}));
 const fetchImpl=async(url,init)=>{
  calls.push(init.method);assert.equal(init.method,'GET');const path=new URL(url).pathname;
  if(path.endsWith('/account'))return Response.json({id:env.STRIPE_TEST_ACCOUNT_ID});
  if(path.includes('/products/'))return Response.json({id:env.STRIPE_TEST_PRODUCT_ID,active:true,livemode:false});
  const code=path.split('_').at(-1),index=['monthly','semiannual','annual'].indexOf(code);
  return Response.json({id:'price_'+code,active:true,livemode:false,product:env.STRIPE_TEST_PRODUCT_ID,currency:'brl',unit_amount:[5990,29940,47880][index],type:'recurring',recurring:{interval:'month',interval_count:[1,6,12][index],usage_type:'licensed'},billing_scheme:'per_unit'});
 };
 const b=onlineBilling({env,mp,service:async()=>assert.fail('no DB mutation'),auth:async()=>({id:'verified'}),asUser:async(token,name)=>{
  if(name==='access_session')return {};
  if(token!=='root')throw new Error('access_denied');
  return {environment:'test',mappings:mapping};
 },fetchImpl});
 await assert.rejects(b.user('stripe/preflight',{},'staff'),/access_denied/);assert.equal(calls.length,0);
 const r=await b.user('stripe/preflight',{},'root');assert.equal(r.database_mapping_verified,true);assert.equal(r.financial_writes,false);assert.equal(r.checkout_mode,'disabled');assert.equal(calls.length,5);
});
test('official REST adapter: no credential leakage or unexpected writes; 5xx/timeouts uncertain',async()=>{
 const cfg={environment:'test',livemode:false,apiVersion:API_VERSION,key:'sk_test_private',operationsEnabled:false};
 const blocked=new StripeGateway(cfg,async()=>assert.fail('POST forbidden'));
 await assert.rejects(blocked.request('POST','/customers',{},'stable'),/operations_disabled/);
 for(const response of [async()=>new Response('private@example.invalid sk_test_secret',{status:500}),async()=>{throw new Error('private@example.invalid');}]){
  const gateway=new StripeGateway({...cfg,operationsEnabled:true},response);
  await assert.rejects(gateway.request('POST','/customers',{},'stable'),e=>{assert.equal(e.uncertain,true);assert.ok(!e.message.includes('private@'));assert.ok(!e.message.includes('sk_test'));return true;});
 }
});
