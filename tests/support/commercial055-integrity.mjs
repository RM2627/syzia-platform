import {commercial056ExpectedHash,assertCommercial056File} from './commercial056-integrity.mjs';
// Explicit additive 055 transitions. Repository representation checks only:
// never normalize financial snapshots, HMAC, tokens, legal content or asset bytes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const root=new URL('../../',import.meta.url);
const sha=b=>createHash('sha256').update(b).digest('hex');
const lf=b=>{const t=b.toString('utf8');assert.ok(Buffer.from(t).equals(b)&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(t),'invalid integrity text');const n=t.replaceAll('\r\n','\n');assert.ok(!n.includes('\r'),'lone CR');return n;};
const text=lf(readFileSync(new URL('docs/syzia-055/authorized-hashes.json',root)));
assert.equal(sha(text),'25ad38e7ef5e6fc239d9e5e045643fd0535d60e4d497a80bbfbda67d0e3bde26','055 authorization manifest changed');
export const commercial055Manifest=JSON.parse(text);
// HF01 is additive: the 055 authorization and all historical hashes stay intact.
const hf01Text=lf(readFileSync(new URL('docs/syzia-055-hf01/authorized-hashes.json',root)));
assert.equal(sha(hf01Text),'6e21241756aa2990f53b044583af7dec152d57dc23108597138ee37473cef1af','HF01 authorization changed');
const hf01=JSON.parse(hf01Text);
assert.equal(hf01.source_commit,'ac0aa2ac0cb869beb412a994d20323712df9936d');
assert.deepEqual(Object.keys(hf01.transitions).sort(),['server/commercial/media.mjs','server/commercial/runtime.mjs']);
for(const [p,r]of Object.entries(hf01.transitions))assert.equal(r.before,commercial055Manifest.transitions[p].after,'HF01 predecessor mismatch');
const allowed=new Set([".env.demo.example", "package.json", "scripts/commercial/bootstrap-demo.mjs", "scripts/commercial/check-demo-build.mjs", "scripts/commercial/regression-local.mjs", "scripts/dev-consumer-demo.mjs", "scripts/syzia-044/current-gate.mjs", "server/commercial/controller.mjs", "server/commercial/demo-store.mjs", "server/commercial/media.mjs", "server/commercial/promote-assets.mjs", "server/commercial/runtime.mjs", "src/acquisition/SelfService.tsx", "src/consumer/CompanyMedia.tsx", "src/consumer/CompanyPage.tsx", "src/consumer/api.ts", "src/consumer/company-image-request.ts", "src/demo/DemoApp.tsx", "src/demo/demo.css", "src/demo/transport.ts", "src/platform-commercial/Activation.tsx", "src/platform-commercial/Management.tsx", "src/platform-commercial/PreparedCompany.tsx", "src/platform-commercial/api.ts", "src/platform-commercial/policy.ts", "tests/commercial-implementation/control.test.mjs", "tests/commercial-implementation/demos.test.mjs", "tests/commercial-implementation/integrity.test.mjs", "tests/commercial-implementation/rollback.test.mjs", "tests/commercial-implementation/transport.test.mjs", "tests/commercial-implementation/ui-contracts.test.mjs", "tests/demo-browser/flexible-support.spec.ts", "tests/hotfix-050/integrity.test.mjs", "tests/integrated-051/integrity-cases.mjs", "tests/support/commercial-integrity.mjs", "tests/syzia-051/integrity.test.mjs", "vite.config.ts"]);
assert.equal(commercial055Manifest.source_commit,'61fa6d2f745128f7763850e64060fd818c7bf74f');
assert.deepEqual(Object.keys(commercial055Manifest.transitions).sort(),[...allowed].sort());
for(const p of allowed)assert.ok(!/^supabase\/migrations\/|^server\/billing\/|^src\/billing\/|^src\/permissions\//.test(p),'055 forbidden transition');
const baselineText=lf(readFileSync(new URL('docs/syzia-055/base-61fa6d2.json',root)));
assert.equal(sha(baselineText),'d88d73d8ceb2fe1e6d187e062324201562af79e7cb33b4798aa6ac2ef0d3b288','055 provenance changed');
export const commercial055Base=JSON.parse(baselineText);
export function commercial055ExpectedHash(path,expected){
 const r=commercial055Manifest.transitions[path];if(!r)return commercial056ExpectedHash(path,expected);
 assert.ok(r.before.includes(expected),'055 unexpected predecessor: '+path);return commercial056ExpectedHash(path,hf01.transitions[path]?.after||r.after);
}
export function assertCommercial055File(path,bytes,expected){
 const r=commercial055Manifest.transitions[path];if(!r)return assertCommercial056File(path,bytes,expected);
 const h=commercial055ExpectedHash(path,expected);assert.equal(sha(r.text?lf(bytes):bytes),h,'integrity mismatch: '+path);return true;
}
export function verifyCommercial055(){
 assert.equal(Object.keys(commercial055Base).length,1151);
 for(const [p,r]of Object.entries(commercial055Base)){
  const b=readFileSync(new URL(p,root));if(assertCommercial055File(p,b,r.sha256))continue;
  if(sha(b)!==r.sha256){assert.ok(r.sha256_lf,'byte-exact mismatch: '+p);assert.equal(sha(lf(b)),r.sha256_lf,'integrity mismatch: '+p);}
 }
 for(const [p,r]of Object.entries(commercial055Manifest.added)){
  const b=readFileSync(new URL(p,root));if(assertCommercial056File(p,b,r.sha256))continue;assert.equal(sha(r.text?lf(b):b),r.sha256,'055 new source mismatch: '+p);
 }
 for(const [p,r]of Object.entries(hf01.added)){
  const b=readFileSync(new URL(p,root));assert.equal(sha(r.text?lf(b):b),r.sha256,'HF01 new source mismatch: '+p);
 }
}
