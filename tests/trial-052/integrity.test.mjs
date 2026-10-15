import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {assertHotfix051File} from '../support/hotfix051-integrity.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('052-I01 every historical migration through 052 is byte-preserved; current files reject unauthorized changes',async()=>{
 const migrationsText=(await readFile('docs/trial-052/migrations-001-052-sha256.json','utf8')).replaceAll('\r\n','\n');
 assert.equal(createHash('sha256').update(migrationsText).digest('hex'),'7f3482753fa31493091ac941a08415973a7a8de57a97a6fd9e2e2a59b5ef4e1a');
 const migrations=JSON.parse(migrationsText);assert.equal(Object.keys(migrations).length,48);
 for(const [path,row] of Object.entries(migrations)){
  const b=await readFile(path),lf=Buffer.from(b.toString('utf8').replaceAll('\r\n','\n')),crlf=Buffer.from(lf.toString().replaceAll('\n','\r\n'));
  assert.ok([sha(b),sha(lf),sha(crlf)].includes(row.sha256),path);
  assert.ok(![sha(Buffer.concat([b,Buffer.from('\n-- unauthorized\n')]))].includes(row.sha256));
 }
 const historical=JSON.parse(await readFile('docs/syzia-051/base-050-sha256.json','utf8'));
 const changes=JSON.parse(await readFile('docs/trial-052/authorized-hashes.json','utf8'));
 for(const path of Object.keys(changes)){
  const b=await readFile(path),lf=b.toString('utf8').replaceAll('\r\n','\n');
  assertHotfix051File(path,Buffer.from(lf),historical[path]);
  assertHotfix051File(path,Buffer.from(lf.replaceAll('\n','\r\n')),historical[path]);
  assert.throws(()=>assertHotfix051File(path,Buffer.from(lf+'\nUNAUTHORIZED_CHANGE\n'),historical[path]),/integrity mismatch/);
 }
});
