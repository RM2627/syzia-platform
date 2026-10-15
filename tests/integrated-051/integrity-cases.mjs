import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {assertHotfix051File} from '../support/hotfix051-integrity.mjs';
test('INT-I01 authorized new transitions preserve LF/CRLF and reject real changes to financial code',async()=>{
 const historical=JSON.parse(await readFile('docs/syzia-051/base-050-sha256.json','utf8'));
 const changes=JSON.parse(await readFile('docs/integrated-051/authorized-hashes.json','utf8'));
 for(const path of Object.keys(changes)){
  const bytes=await readFile(path),lf=bytes.toString('utf8').replaceAll('\r\n','\n');
  assertHotfix051File(path,Buffer.from(lf),historical[path]);
  assertHotfix051File(path,Buffer.from(lf.replaceAll('\n','\r\n')),historical[path]);
  assert.throws(()=>assertHotfix051File(path,Buffer.from(lf+'\nUNAUTHORIZED_CONTENT_EDIT\n'),historical[path]),/integrity mismatch/);
 }
});
test('INT-I02 adding a historical migration to the new authorization manifest fails its independent pin',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'syzia-integrated-integrity-'));
 try{
  for(const path of ['tests/support/hotfix051-integrity.mjs','tests/support/portable-integrity.mjs','tests/support/auth-communication-integrity.mjs','docs/auth-communication/authorized-hashes.json','docs/syzia-051/integrity-text-paths.json','docs/syzia-051/authorized-hashes.json','docs/syzia-051/reconciliation-b30c991.json','docs/integrated-051/authorized-hashes.json']){
   await mkdir(dirname(join(dir,path)),{recursive:true});await writeFile(join(dir,path),await readFile(path));
  }
  const p=join(dir,'docs/integrated-051/authorized-hashes.json');const content=JSON.parse(await readFile(p,'utf8'));
  content['supabase/migrations/202610130051_checkout_diagnostics.sql']={before:'0'.repeat(64),after:'1'.repeat(64)};await writeFile(p,JSON.stringify(content));
  const result=spawnSync(process.execPath,[join(dir,'tests/support/hotfix051-integrity.mjs')],{encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/integrated authorization manifest changed/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('INT-I03 approved checkout CSS and summary are byte-identical to the delivered base',async()=>{
 const manifest=JSON.parse(await readFile('docs/integrated-051/integrity.json','utf8'));
 for(const path of ['src/billing/mercado-pago.css','src/billing/CheckoutSummary.tsx']){
  const row=manifest.files[path];assert.equal(row.before.sha256,row.after.sha256);
  const b=await readFile(path);const exact=createHash('sha256').update(b).digest('hex');
  const lf=createHash('sha256').update(b.toString('utf8').replaceAll('\r\n','\n')).digest('hex');
  assert.ok(exact===row.after.sha256||lf===row.after.sha256_lf);
 }
});
