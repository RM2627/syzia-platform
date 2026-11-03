import test from 'node:test';
import assert from 'node:assert/strict';
import {onlineBilling} from '../../server/billing/stripe/runtime.mjs';
import {createBillingServer} from '../../server/billing/http.mjs';
import {eligibleActivationLink,eligibleContact} from '../../src/platform-commercial/policy.ts';
const origin='https://app.example.invalid';
function setup(){
 const calls=[],rows=[{code:'monthly',price_cents:5990,checkout_available:true}];
 const b=onlineBilling({env:{BILLING_CHECKOUT_MODE:'disabled',STRIPE_OPERATIONS_ENABLED:'false'},
 mp:{user:async()=>{throw Error('billing_disabled');}},
 service:async(name,args)=>{calls.push({name,args});assert.equal(name,'acquisition_plans');return rows;},
 auth:async()=>null,asUser:async()=>assert.fail('anonymous catalog must not impersonate a user'),fetchImpl:async()=>assert.fail('no provider request')});
 return {b,calls,rows};
}
test('071 public catalog needs no user session; backend disabled overrides stale DB availability without altering prices',async()=>{
 const f=setup(),r=await f.b.user('catalog',{});assert.equal(r[0].price_cents,5990);assert.equal(r[0].checkout_available,false);
 assert.equal(f.rows[0].checkout_available,true);assert.deepEqual(f.calls,[{name:'acquisition_plans',args:{}}]);
 await assert.rejects(f.b.user('catalog',{price_cents:1}),/payload_invalid/);
 await assert.rejects(f.b.user('checkout',{organization_id:'10000000-0000-0000-0000-000000000001'}),/access_denied/);
});
test('071 HTTP catalog preserves exact CORS, no-store and safe response; no subscription or email side effects',async()=>{
 const f=setup(),server=createBillingServer({origin,billing:f.b,log:()=>{}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port+'/billing/catalog';
 try{
  const r=await fetch(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json())[0].checkout_available,false);
  assert.equal((await fetch(url,{method:'POST',headers:{Origin:'https://other.example.invalid'},body:'{}'})).status,403);
  assert.equal(f.calls.length,1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('071 link eligibility is separate from email permission and only recorded interest permits recipient-free activation',()=>{
 const demo={state:'available',published_version_id:'v',expires_at:new Date(Date.now()+60000).toISOString()},c={email:null,stage:'wants_trial',suppressed:false,authorizations:[]};
 assert.equal(eligibleActivationLink(c,demo),true);assert.equal(eligibleContact(c,'activation'),false);
 assert.equal(eligibleActivationLink({...c,stage:'prospect'},demo),false);
 assert.equal(eligibleActivationLink({...c,email:'restricted@example.invalid'},demo),false);
 assert.equal(eligibleActivationLink({...c,suppressed:true},demo),false);
});
