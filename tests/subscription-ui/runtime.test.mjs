import test from 'node:test';
import assert from 'node:assert/strict';
import {onlineBilling} from '../../server/billing/stripe/runtime.mjs';
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
const env={STRIPE_ENABLED:'true',STRIPE_ENVIRONMENT:'test',BILLING_CHECKOUT_MODE:'disabled',PLATFORM_APP_ORIGIN:'https://app.example.invalid',STRIPE_TEST_SECRET_KEY:'sk_test_'+'x'.repeat(24),STRIPE_TEST_WEBHOOK_SECRET:'whsec_'+'y'.repeat(24),STRIPE_TEST_ACCOUNT_ID:'acct_fixture',STRIPE_TEST_PRODUCT_ID:'prod_fixture',STRIPE_TEST_PRICE_MONTHLY:'price_monthly',STRIPE_TEST_PRICE_SEMIANNUAL:'price_semiannual',STRIPE_TEST_PRICE_ANNUAL:'price_annual'};
test('read-only management signal preserves existing contracts while new sales stay disabled',async()=>{
 for(const enabled of[false,true]){
  const calls=[],b=onlineBilling({env:{...env,STRIPE_OPERATIONS_ENABLED:String(enabled)},mp:{},service:async()=>assert.fail('no write'),fetchImpl:async()=>assert.fail('no provider call'),auth:async token=>token==='valid'?{id:'actor'}:null,
   asUser:async(token,name,args)=>{calls.push(name);assert.equal(token,'valid');if(name==='access_session')return{};if(args.p_org!==A)throw Error('access_denied');return{provider:'stripe',checkout_mode:'disabled',subscription:{id:'local-contract'},catalog:[{code:'monthly',price_cents:5990,checkout_available:true}]};}});
  const result=await b.user('checkout',{organization_id:A},'valid');assert.equal(result.stripe_operations_available,enabled);assert.equal(result.checkout_mode,'disabled');assert.equal(result.catalog[0].checkout_available,false);assert.equal(result.subscription.id,'local-contract');assert.deepEqual(calls,['access_session','billing069_context']);
  await assert.rejects(b.user('checkout',{organization_id:B},'valid'),/access_denied/);await assert.rejects(b.user('checkout',{organization_id:A},'invalid'),/access_denied/);
  assert.ok(!JSON.stringify(result).includes('sk_test_'));assert.ok(!JSON.stringify(result).includes('whsec_'));
 }
});
