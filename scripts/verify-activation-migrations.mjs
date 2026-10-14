import {assertFileHash} from "../tests/support/portable-integrity.mjs";
import {readFile} from 'node:fs/promises';import {basename} from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const expected=JSON.parse(await readFile('docs/organization-activation/historical-migrations-sha256.json','utf8'));
assert.equal(Object.keys(expected).length,26);
for(const[path,hash] of Object.entries(expected)){const file='supabase/migrations/'+basename(path);assertFileHash(file,await readFile(file),hash);}
console.log('PASS: migrations 001–026 content preserved; only proven LF/CRLF differences permitted.');

