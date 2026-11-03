import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmationPending} from '../../src/billing/subscription-view.ts';
import {onlineBilling} from '../../server/billing/stripe/runtime.mjs';
test('financial verification requires a real local contract, not a prepared signup or return flag',()=>{
 for(const s of[null,{pending:true},{state:'pending'},{retorno:1},{id:'c',state:'active',pending:false},{id:'c',state:'trialing',pending:false},{id:'c',state:'canceled',pending:false}])assert.equal(confirmationPending(s),false);
 for(const s of[{id:'c',state:'payment_pending'},{id:'c',state:'reconciliation'},{id:'c',state:'active',pending:true}])assert.equal(confirmationPending(s),true);
});
test('catalog stays visible to allowed members outside test allowlist; backend still refuses checkout before provider/write',async()=>{
 const org='10000000-0000-4000-8000-000000000002',rows=['monthly','semiannual','annual'].map((code,i)=>({code,price_cents:[5990,29940,47880][i],checkout_available:true}));
 const env={STRIPE_ENABLED:'true',STRIPE_ENVIRONMENT:'test',STRIPE_OPERATIONS_ENABLED:'true',BILLING_CHECKOUT_MODE:'stripe',PLATFORM_APP_ORIGIN:'https://app.example.invalid',STRIPE_TEST_SECRET_KEY:'sk_test_'+'x'.repeat(24),STRIPE_TEST_WEBHOOK_SECRET:'whsec_'+'y'.repeat(24),STRIPE_TEST_ACCOUNT_ID:'acct_fixture',STRIPE_TEST_PRODUCT_ID:'prod_fixture',STRIPE_TEST_PRICE_MONTHLY:'price_monthly',STRIPE_TEST_PRICE_SEMIANNUAL:'price_semiannual',STRIPE_TEST_PRICE_ANNUAL:'price_annual'};
 const b=onlineBilling({env,mp:{},service:async()=>assert.fail('No database mutation'),fetchImpl:async()=>assert.fail('No provider request'),auth:async token=>token==='valid'?{id:'verified'}:null,asUser:async(token,fn,args)=>{
  assert.equal(token,'valid');if(fn==='access_session')return{};
  assert.equal(fn,'billing069_context');if(args.p_org!==org)throw Error('access_denied');
  return{checkout_mode:'stripe',environment:'test',test_allowed:false,confirmation_enabled:true,catalog:rows,subscription:null};
 }});
 assert.deepEqual((await b.user('checkout',{organization_id:org},'valid')).catalog,rows);
 await assert.rejects(b.user('stripe/command',{organization_id:org,action:'checkout',offer:'monthly',trial_expected:true,accepted:true,request_key:'20000000-0000-4000-8000-000000000001'},'valid'),/checkout_disabled/);
 await assert.rejects(b.user('checkout',{organization_id:org},'invalid'),/access_denied/);
 await assert.rejects(b.user('checkout',{organization_id:'10000000-0000-4000-8000-000000000009'},'valid'),/access_denied/);
});
