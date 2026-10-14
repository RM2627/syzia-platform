import {assertFileHash} from "../tests/support/portable-integrity.mjs";
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const expected=JSON.parse(await readFile('docs/master-audit/base028-sha256.json','utf8'));
assert.equal(Object.keys(expected).length,28);
for(const[name,hash]of Object.entries(expected)){const file='supabase/migrations/'+name;assertFileHash(file,await readFile(file),hash);}
console.log('PASS: migrations 001–028 content preserved; only proven LF/CRLF differences permitted.');
