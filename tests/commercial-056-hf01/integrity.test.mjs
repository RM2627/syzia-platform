import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {hf056,hf056Expected,assertHF056File} from '../support/commercial056-hf01-integrity.mjs';
test('HF01-I01 only six authorized UI/test files change; wrong predecessors and content mutations fail',()=>{
 assert.deepEqual(Object.keys(hf056.transitions).sort(),[
  'src/platform-commercial/InvitationPreparation.tsx','src/platform-commercial/Management.tsx','src/platform-commercial/commercial-management.css',
  'tests/demo-browser/commercial056.spec.ts','tests/support/commercial056-integrity.mjs','tests/commercial-056/integrity.test.mjs',
 ].sort());
 for(const [p,r]of Object.entries(hf056.transitions)){
  const b=readFileSync(p);assertHF056File(p,b,r.before[0]);
  assert.throws(()=>hf056Expected(p,'0'.repeat(64)),/predecessor/);
  assert.throws(()=>assertHF056File(p,Buffer.concat([b,Buffer.from('UNAUTHORIZED')]),r.before[0]),/mismatch/);
  assertHF056File(p,Buffer.from(b.toString().replaceAll('\r\n','\n').replaceAll('\n','\r\n')),r.before[0]);
 }
});
test('HF01-I02 server, auth, finance, activation, demo, all migrations and historical manifests match official Git objects',()=>{
 const paths=['server','supabase','src/billing','src/access','src/demo','src/platform-commercial/Activation.tsx','src/platform-commercial/policy.ts','src/platform-commercial/api.ts','package.json','package-lock.json','docs/syzia-056/authorized-hashes.json','docs/syzia-055/authorized-hashes.json'];
 const files=execFileSync('git',['ls-tree','-r','--name-only',hf056.source_commit,'--',...paths],{encoding:'utf8'}).trim().split('\n');
 for(const p of files){
  const b=readFileSync(p),original=execFileSync('git',['show',hf056.source_commit+':'+p],{maxBuffer:32*1024*1024});
  // Git's configured conversion is permitted for proven UTF-8 text only; binary stays byte-exact.
  if(b.equals(original))continue;
  assert.ok(/\.(?:sql|mjs|ts|tsx|json|css|md|html)$/.test(p),'binary mismatch: '+p);
  const normalize=bytes=>{
   const text=bytes.toString('utf8');
   assert.ok(Buffer.from(text).equals(bytes)&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text),'invalid text: '+p);
   const normalized=text.replaceAll('\r\n','\n');assert.ok(!normalized.includes('\r'),'lone CR: '+p);return normalized;
  };
  assert.equal(normalize(b),normalize(original),p);
 }
});
