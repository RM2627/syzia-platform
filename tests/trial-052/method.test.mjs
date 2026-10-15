import test,{describe,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../billing-047/fixture.mjs';
describe('052 card management without remote counter',()=>{
 let c,original,id,p,trial;before(async()=>{
  c=await fixture({verifiedIdentity:false});original=c.gateway.fetchImpl;
  c.gateway.fetchImpl=async(url,init)=>{
   const r=await original(url,init);
   if(new URL(url).pathname.startsWith('/preapproval/')&&!new URL(url).pathname.endsWith('search')){
    const body=await r.json();delete body.version;return Response.json(body);
   }return r;
  };
  const s=(await c.command()).subscription;id=s.id;trial=[s.trial_start,s.trial_end];p=[...c.fake.subscriptions.values()][0];
 });after(()=>c?.db.close());
 test('052-C01 PUT plus official GET confirms update with no version and no new subscription',async()=>{
  const posts=c.fake.calls.filter(x=>x.method==='POST').length;
  const v=(await c.command('method')).subscription;assert.equal(v.operation_pending,false);assert.deepEqual([v.trial_start,v.trial_end],trial);assert.equal(c.fake.calls.filter(x=>x.method==='POST').length,posts);
 });
 test('052-C02 timeout after possible card update: read recovery, no duplicate PUT',async()=>{
  const absent=c.gateway.fetchImpl;
  // The simulated provider assigns a genuinely different official card identifier.
  c.gateway.fetchImpl=async(url,init)=>{const r=await absent(url,init);if(init.method==='PUT'){p.card_id='second-official-card';p.last_modified=new Date(Date.now()+10).toISOString();throw Error('offline uncertain transport');}return r;};
  await assert.rejects(c.command('method'),/billing_provider_unavailable/);
  const writes=c.fake.calls.filter(x=>x.method!=='GET').length;c.gateway.fetchImpl=absent;await c.engine.process(id);await c.engine.process(id);
  const v=(await c.view()).subscription;assert.equal(v.operation_pending,false);assert.deepEqual([v.trial_start,v.trial_end],trial);assert.equal(c.fake.calls.filter(x=>x.method!=='GET').length,writes);
 });
 test('052-C03 timeout before visible card change remains uncertain; another token cannot resend',async()=>{
  const absent=c.gateway.fetchImpl;
  c.gateway.fetchImpl=async(url,init)=>{if(init.method==='PUT')throw Error('offline timeout');return absent(url,init);};
  await assert.rejects(c.command('method'),/billing_provider_unavailable/);const writes=c.fake.calls.filter(x=>x.method!=='GET').length;
  c.gateway.fetchImpl=absent;await c.command('method');await c.engine.process(id);
  assert.equal((await c.view()).subscription.operation_pending,true);assert.equal(c.fake.calls.filter(x=>x.method!=='GET').length,writes);
 });
});
