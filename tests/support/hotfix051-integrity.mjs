import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
 const change=changes[path];if(!change)return reference;
 assert.equal(reference,change.before,'051 unexpected historical input: '+path);return change.after;
}
