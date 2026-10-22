import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
function lf(b){const t=b.toString('utf8');assert.ok(Buffer.from(t).equals(b)&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(t),'invalid text');const n=t.replaceAll('\r\n','\n');assert.ok(!n.includes('\r'),'lone CR');return n;}
const source=lf(readFileSync('docs/syzia-057/base-33e04ca.json'));
const authorized=lf(readFileSync('docs/syzia-057/authorized-hashes.json'));
assert.equal(sha(source),'4dc8a0db748a016444b639f6e779fedb4992f3dacf5331b67d41c57da88640bc');
assert.equal(sha(authorized),'9ad5c572e704e593c2e5624797467410befe6133c8277872557f64d27ee8cb51');
const base=JSON.parse(source),changes=JSON.parse(authorized);
assert.equal(base.commit,'33e04ca8ba14be73e7050ae84c5299410d5c7011');
function check(path,bytes,expected){
 const row=changes.modified[path];
 if(row){assert.equal(expected,row.before,'unexpected predecessor');assert.equal(sha(lf(bytes)),row.after,'content mismatch');return;}
 const r=base.files[path];if(sha(bytes)===r.sha256)return;
 assert.ok(r.sha256_lf,'binary mismatch');assert.equal(sha(lf(bytes)),r.sha256_lf,'content mismatch');
}
test('057-I01 full official base preserved except five explicit activation/UI/fixture transitions; all historical migrations and HF02 untouched',()=>{
 assert.deepEqual(Object.keys(changes.modified).sort(),['scripts/commercial/browser-fixture-055.mjs','src/acquisition/SelfService.tsx','src/platform-commercial/Activation.tsx','src/platform-commercial/Management.tsx','src/platform-commercial/api.ts']);
 for(const [p,r]of Object.entries(base.files))check(p,readFileSync(p),r.sha256_lf||r.sha256);
 for(const [p,h]of Object.entries(changes.added))assert.equal(sha(lf(readFileSync(p))),h,p);
});
test('057-I02 real changes, binary mutations, lone CR and wrong predecessors remain rejected; paired text EOL accepted',()=>{
 for(const [p,r]of Object.entries(changes.modified)){
  const b=readFileSync(p);assert.throws(()=>check(p,b,'0'.repeat(64)),/predecessor/);
  assert.throws(()=>check(p,Buffer.concat([b,Buffer.from('UNAUTHORIZED')]),r.before),/mismatch/);
  assert.throws(()=>check(p,Buffer.from(lf(b)+'\r'),r.before),/lone CR/);
  check(p,Buffer.from(lf(b).replaceAll('\n','\r\n')),r.before);
 }
 const binary=Object.keys(base.files).find(p=>p.endsWith('.png'));
 assert.throws(()=>check(binary,Buffer.concat([readFileSync(binary),Buffer.from([0])]),base.files[binary].sha256),/binary/);
});
test('057-I03 compact Invitations unchanged; materialization change is only a disambiguated query alias',()=>{
 const sql=readFileSync('supabase/migrations/202610220058_invitation_activation.sql','utf8');
 const old=readFileSync('supabase/migrations/202610200055_commercial_versions.sql','utf8');
 const body=s=>s.match(/create (?:or replace )?function public\.commercial_materialization_service\([\s\S]*?\nend;\$\$;/)[0];
 assert.equal(body(sql).replace('create or replace function','create function').replaceAll('confirmed_contract','b'),body(old));
 for(const p of ['src/platform-commercial/InvitationPreparation.tsx','src/platform-commercial/commercial-management.css','src/platform-commercial/policy.ts'])assert.equal(sha(readFileSync(p)),base.files[p].sha256);
});
