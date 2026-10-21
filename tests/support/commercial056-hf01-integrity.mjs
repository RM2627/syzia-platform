// Additive HF01; historical authorization documents remain byte-identical.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
function lf(b){const t=b.toString('utf8');assert.ok(Buffer.from(t).equals(b)&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(t),'invalid integrity text');const n=t.replaceAll('\r\n','\n');assert.ok(!n.includes('\r'),'lone CR');return n;}
const text=lf(readFileSync(new URL('../../docs/syzia-056-hf01/authorized-hashes.json',import.meta.url)));
assert.equal(sha(text),'a9930e4f3cbfd283b85e741acb0ffd24c889f33e17dc1c50fe55ad26b9498c15','056-HF01 authorization changed');
export const hf056=JSON.parse(text);
assert.equal(hf056.source_commit,'8f061f0002e4a7d7db54927628382686a1cb90f3');
export function hf056Expected(path,expected){
 const r=hf056.transitions[path];if(!r)return expected;
 assert.ok(r.before.includes(expected),'056-HF01 unexpected predecessor: '+path);return r.after;
}
export function assertHF056File(path,bytes,expected){
 const r=hf056.transitions[path];if(!r)return false;
 assert.equal(sha(r.text?lf(bytes):bytes),hf056Expected(path,expected),'056-HF01 integrity mismatch: '+path);return true;
}
