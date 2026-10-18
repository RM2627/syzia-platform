import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {authCommunicationExpectedHash} from '../support/auth-communication-integrity.mjs';
import {assertHotfix051File,hotfix051ExpectedHash} from '../support/hotfix051-integrity.mjs';
const historical=JSON.parse(readFileSync('docs/syzia-051/base-050-sha256.json','utf8'));
const transitions=JSON.parse(readFileSync('docs/auth-communication/authorized-hashes.json','utf8'));
test('auth integrity authorizes only seven exact audited transitions',()=>{
  assert.equal(Object.keys(transitions).length,7);
  for(const [path,row] of Object.entries(transitions)){
    assert.equal(hotfix051ExpectedHash(path,historical[path]),row.before);
    assert.equal(authCommunicationExpectedHash(path,row.before),row.after);
    assert.ok(['byte_exact','lf_crlf_only'].includes(assertHotfix051File(path,readFileSync(path),historical[path])));
    assert.throws(()=>assertHotfix051File(path,Buffer.concat([readFileSync(path),Buffer.from('\nUNAUTHORIZED_CHANGE')]),historical[path]),/integrity mismatch/);
    assert.throws(()=>authCommunicationExpectedHash(path,'0'.repeat(64)),/unexpected predecessor/);
  }
  assert.equal(authCommunicationExpectedHash('server/billing/mercado-pago.mjs','1'.repeat(64)),'1'.repeat(64));
});
