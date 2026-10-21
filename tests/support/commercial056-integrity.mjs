import {hf056Expected,assertHF056File} from './commercial056-hf01-integrity.mjs';
// 056 is an additive, path-specific transition from the official Git source.
// This never accepts an arbitrary predecessor or normalizes runtime data.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const root=new URL('../../',import.meta.url);
export const sha056=b=>createHash('sha256').update(b).digest('hex');
export function lf056(b){const t=b.toString('utf8');assert.ok(Buffer.from(t).equals(b)&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(t),'invalid integrity text');const n=t.replaceAll('\r\n','\n');assert.ok(!n.includes('\r'),'lone CR');return n;}
const text=lf056(readFileSync(new URL('docs/syzia-056/authorized-hashes.json',root)));
assert.equal(sha056(text),'8b1aa78b422c178ccd7d29000ea9b76aa159faa84fb2745789f9e8de45f122f7','056 authorization changed');
export const commercial056=JSON.parse(text);
assert.equal(commercial056.source_commit,'ba6546816a0dc1cf1fb6e9333851974b6fea1674');
export function commercial056ExpectedHash(path,expected){
 const r=commercial056.transitions[path];if(!r)return hf056Expected(path,expected);
 assert.ok(r.before.includes(expected),'056 unexpected predecessor: '+path);return hf056Expected(path,r.after);
}
export function assertCommercial056File(path,bytes,expected){
 const r=commercial056.transitions[path];if(!r)return assertHF056File(path,bytes,expected);
 const h=commercial056ExpectedHash(path,expected);
 assert.equal(sha056(r.text?lf056(bytes):bytes),h,'056 integrity mismatch: '+path);return true;
}
