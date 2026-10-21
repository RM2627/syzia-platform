import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync}from'node:fs';
import {commercial055Base,commercial055Manifest,assertCommercial055File,commercial055ExpectedHash,verifyCommercial055}from'../support/commercial055-integrity.mjs';
test('055-I01 all 1151 official base files and 50 historical migrations remain accounted for',()=>{
 assert.equal(Object.keys(commercial055Base).filter(p=>p.startsWith('supabase/migrations/')).length,50);
 assert.equal(readdirSync('supabase/migrations').filter(p=>p.endsWith('.sql')).length,52);assert.ok(readdirSync('supabase/migrations').includes('202610210056_commercial_preregistration.sql'));verifyCommercial055();
});
test('055-I02 only explicit transitions permit proven text EOL changes; wrong predecessors and content mutations fail',()=>{
 for(const [p,r]of Object.entries(commercial055Manifest.transitions)){
  const b=readFileSync(p);assertCommercial055File(p,b,r.before[0]);
  assert.throws(()=>commercial055ExpectedHash(p,'0'.repeat(64)),/predecessor/);
  assert.throws(()=>assertCommercial055File(p,Buffer.concat([b,Buffer.from('UNAUTHORIZED')]),r.before[0]),/mismatch/);
  if(r.text)assertCommercial055File(p,Buffer.from(b.toString().replaceAll('\r\n','\n').replaceAll('\n','\r\n')),r.before[0]);
 }
});
