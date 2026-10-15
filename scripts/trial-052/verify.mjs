// Offline read-only check of explicitly inventoried project files. No SQL,
// credentials, arbitrary directories, Git mutation or network access.
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
const [phase,directory,...extra]=process.argv.slice(2);
if(!['before','after'].includes(phase)||!directory||extra.length){console.error('Usage: node verify.mjs before|after PROJECT');process.exit(2);}
const sha=b=>createHash('sha256').update(b).digest('hex');
const lf=b=>{const s=b.toString('utf8'),v=s.replaceAll('\r\n','\n');return Buffer.from(s).equals(b)&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\r]/.test(v)?Buffer.from(v):null;};
const bytes=await readFile(new URL('../../docs/trial-052/integrity.json',import.meta.url));
const normalized=lf(bytes);
if(!normalized||sha(normalized)!=='5735d6b5595be3283b3041fb12fe25be65886201187786fbed474961623df74d')throw Error('Integrity manifest changed; never replace hashes to bypass a difference');
const manifest=JSON.parse(bytes),root=await realpath(resolve(directory)),differences=[];
let exact=0,lineEndings=0,absent=0;
for(const [name,versions] of Object.entries(manifest.files)){
 if(name.startsWith('/')||name.includes('..')||name.includes('\\'))throw Error('Invalid manifest path');
 const expected=versions[phase],path=resolve(root,name);
 try{
  const stat=await lstat(path);
  if(!expected){differences.push({path:name,reason:'expected_absent'});continue;}
  const canonical=await realpath(path),rel=relative(root,canonical);
  if(!stat.isFile()||stat.isSymbolicLink()||rel==='..'||rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(rel)){differences.push({path:name,reason:'unsafe_path'});continue;}
  const value=await readFile(path);
  if(sha(value)===expected.sha256){exact++;continue;}
  const normalized=expected.sha256_lf&&lf(value);
  if(normalized&&sha(normalized)===expected.sha256_lf){lineEndings++;continue;}
  differences.push({path:name,reason:'content_mismatch'});
 }catch(e){if(e.code==='ENOENT'&&!expected)absent++;else differences.push({path:name,reason:'missing_or_unreadable'});}
}
console.log(JSON.stringify({phase,status:differences.length?'FAIL':'PASS',exact,lineEndings,absent,git_546a906_proven:false,reference:'last delivered integrated 051 base, explicitly authorized by owner',differences},null,2));
process.exitCode=differences.length?1:0;
