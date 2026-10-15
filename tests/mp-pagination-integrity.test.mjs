import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {assertHotfix051File} from './support/hotfix051-integrity.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('pagination hotfix successor is exact and unauthorized mutation is rejected',()=>{
 const historical=JSON.parse(readFileSync('docs/syzia-051/base-050-sha256.json','utf8'));
 const path='server/billing/mercado-pago.mjs';
 const bytes=readFileSync(path),lf=Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n'));
 const m=JSON.parse(readFileSync('docs/mp-pagination-052/authorized-hashes.json','utf8'));
 assert.deepEqual(Object.keys(m),[path]);
 assert.equal(m[path].before,'28fea5a154cdf29146bac7a003a4892cd3852220fc5a9a70855bb2db8f0ac1f4');
 assert.equal(sha(lf),m[path].after);
 assertHotfix051File(path,bytes,historical[path]);
 assert.throws(()=>assertHotfix051File(path,Buffer.concat([bytes,Buffer.from('\nUNAUTHORIZED_CHANGE\n')]),historical[path]),/integrity mismatch/);
});
