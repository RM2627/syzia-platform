import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const expected=JSON.parse(await readFile('docs/master-audit/base028-sha256.json','utf8'));
assert.equal(Object.keys(expected).length,28);
for(const[name,hash]of Object.entries(expected))assert.equal(createHash('sha256').update(await readFile('supabase/migrations/'+name)).digest('hex'),hash,'Historical migration changed: '+name);
console.log('PASS: migrations 001–028 byte-identical to the complete consolidated delivery.');
