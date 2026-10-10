import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('048-I01 migrations 001–047, lockfile e regras de billing 047 permanecem byte a byte',async()=>{
 const manifest=JSON.parse(await readFile('docs/syzia-048/preserved-047-sha256.json','utf8'));assert.equal(Object.keys(manifest).filter(x=>x.startsWith('supabase/migrations/')).length,43);
 for(const [path,hash]of Object.entries(manifest))assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),hash,path);
});
