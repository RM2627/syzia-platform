import {readFile} from 'node:fs/promises';import {basename} from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const expected=JSON.parse(await readFile('docs/organization-activation/historical-migrations-sha256.json','utf8'));
assert.equal(Object.keys(expected).length,26);
for(const[path,hash] of Object.entries(expected))assert.equal(createHash('sha256').update(await readFile('supabase/migrations/'+basename(path))).digest('hex'),hash,'Historical migration changed: '+path);
console.log('PASS: migrations 001–026 byte-identical to the previous complete delivery.');
