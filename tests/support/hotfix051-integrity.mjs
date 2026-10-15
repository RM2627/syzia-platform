import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {assertFileHash} from './portable-integrity.mjs';
import {authCommunicationExpectedHash} from './auth-communication-integrity.mjs';
const integratedText=readFileSync(new URL('../../docs/integrated-051/authorized-hashes.json',import.meta.url),'utf8').replaceAll('\r\n','\n');
assert.equal(createHash('sha256').update(integratedText).digest('hex'),'402e079c5fad4e2aa967e2d7bac2f951dd422f2a785e7d99f352c3494cd28dcf','integrated authorization manifest changed');
const integrated=JSON.parse(integratedText);
const trialText=readFileSync(new URL('../../docs/trial-052/authorized-hashes.json',import.meta.url),'utf8').replaceAll('\r\n','\n');
assert.equal(createHash('sha256').update(trialText).digest('hex'),'ea0462a478d1744cb6cee4c3106e73bb093ae405dccb1cd124d1aaa4f797205b','052 authorization manifest changed');
const trial=JSON.parse(trialText);
const pageText=readFileSync(new URL('../../docs/mp-pagination-052/authorized-hashes.json',import.meta.url),'utf8').replaceAll('\r\n','\n');
assert.equal(createHash('sha256').update(pageText).digest('hex'),'a452f051301bb502dd0ee275ba71bb1c5020b71923294ee400f99722c9d50ae6','pagination authorization manifest changed');
const page=JSON.parse(pageText);
const pageHash=(path,expected)=>{const row=page[path];if(!row)return expected;assert.equal(path,'server/billing/mercado-pago.mjs','unauthorized pagination path');assert.equal(expected,row.before,'pagination unexpected predecessor: '+path);return row.after;};

const trialHash=(path,expected)=>{const row=trial[path];if(!row)return expected;assert.ok(!path.startsWith('supabase/migrations/'),'historical migrations cannot change');assert.equal(expected,row.before,'052 unexpected predecessor: '+path);return row.after;};
const nextHash=(path,expected)=>{const row=integrated[path];if(!row)return trialHash(path,expected);assert.equal(expected,row.before,'integrated unexpected predecessor: '+path);return trialHash(path,row.after);};
const changes=JSON.parse(readFileSync(new URL('../../docs/syzia-051/authorized-hashes.json',import.meta.url),'utf8'));
const publication=JSON.parse(readFileSync(new URL('../../docs/syzia-051/reconciliation-b30c991.json',import.meta.url),'utf8'));
assert.equal(publication.commit, 'b30c9910ca939289a14af8ae8729768f8766f03c');
assert.equal(publication.rows.length, 890);
const published=new Map(publication.rows.map(row=>[row.path,row]));
assert.equal(published.size, 890);
export function hotfix051ExpectedHash(path,historical){
 const row=published.get(path);
 // Only this path's audited predecessor can transition to its exact published bytes.
 const reference=row && historical===row.old_sha256 ? row.official_sha256 : historical;
 const change=changes[path];if(!change)return pageHash(path,nextHash(path,reference));
 assert.equal(reference,change.before,'051 unexpected historical input: '+path);return pageHash(path,nextHash(path,change.after));
}
export function assertHotfix051File(path,bytes,historical){
 return assertFileHash(path,bytes,authCommunicationExpectedHash(path,hotfix051ExpectedHash(path,historical)));
}
