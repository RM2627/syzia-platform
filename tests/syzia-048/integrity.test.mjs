import { assertHotfix051File } from "../support/hotfix051-integrity.mjs";
import { mp01ExpectedHash } from "../support/mp01-integrity.mjs";
import { hotfix050ExpectedHash } from "../support/hotfix050-integrity.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('048-I01 migrations 001–047, billing preservado com exceção explícita do adaptador MP-01',async()=>{
 const manifest=JSON.parse(await readFile('docs/syzia-048/preserved-047-sha256.json','utf8'));assert.equal(Object.keys(manifest).filter(x=>x.startsWith('supabase/migrations/')).length,43);
 // 049 intentionally adds PDF dependencies. Its lockfile hash has a separate gate.
 for(const [path,hash]of Object.entries(manifest).filter(([path])=>path!=='package-lock.json'))assertHotfix051File(path,await readFile(path),hotfix050ExpectedHash(path,mp01ExpectedHash(path,hash)));
});
