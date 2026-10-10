import {readFile,writeFile,unlink} from 'node:fs/promises';import {spawn} from 'node:child_process';
for(const round of ['038','039']){
 const source=await readFile(`tests/syzia-${round}-sql.test.mjs`,'utf8');
 const anchor=round==='038'?"await db.exec(await readFile('supabase/migrations/202609250038_multiservice_requests.sql','utf8'));":'const base = {';
 if(!source.includes(anchor))throw Error('Upgrade anchor missing');
 const inject=(round==='038'?"await db.exec(await readFile('supabase/migrations/202609250039_commercial_plans.sql','utf8'));\n":'')+"await db.exec(await readFile('supabase/migrations/202609260040_post_homologation.sql','utf8'));\n";
 let text=source.replace(anchor,round==='038'?anchor+'\n'+inject:inject+anchor).replaceAll(`reports/syzia-${round}/sql.json`,`reports/syzia-040/regression-${round}.json`);
 // New projection-only plan fields are excluded from the existing 039 upgrade snapshot.
 if(round==='039')text=text.replace("jsonb_agg(to_jsonb(t)order by id)from billing_plans", "jsonb_agg(to_jsonb(t)-'featured'-'featured_label'order by id)from billing_plans");
 const path=`tests/syzia-040-regression-${round}-temporary.test.mjs`;
 try {await writeFile(path,text);const code=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[path],{stdio:'inherit'});p.on('error',reject);p.on('exit',c=>resolve(c??1));});if(code)process.exitCode=1;}finally{await unlink(path).catch(()=>{});}
}
