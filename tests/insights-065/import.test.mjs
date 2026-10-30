import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseArticles,previewArticles,importArticles,IMPORT_BYTES} from '../../src/insights/article-import.ts';
import {drafts,fixture} from './fixture.mjs';
const text=JSON.stringify(drafts);
test('065 JSON: accepts the unmodified five-article package; rejects syntax, size, count and root shape',()=>{
 assert.equal(parseArticles(text).length,5);assert.ok(parseArticles(text).every(r=>!r.errors.length));
 for(const s of ['{','{}','[]',JSON.stringify(Array(51).fill(drafts[0])),' '.repeat(IMPORT_BYTES+1)])assert.throws(()=>parseArticles(s));
 assert.equal(parseArticles('\ufeff'+text).length,5);
});
test('065 JSON: required fields, types, slugs and per-document limits remain individual',()=>{
 const bad=[null,{...drafts[0],title:'curto'},{...drafts[0],slug:'UPPER/slash'},{...drafts[0],summary:12},{...drafts[0],blocks:[]},{...drafts[0],tags:Array(13).fill('Serviços')},{...drafts[0],published:true},{...drafts[0],featured:'true'},{...drafts[0],blocks:[{type:'paragraph',text:'x'.repeat(180001)}]}];
 const rows=parseArticles(JSON.stringify([drafts[1],...bad]));assert.equal(rows[0].errors.length,0);assert.ok(rows.slice(1).every(r=>r.errors.length));
});
test('065 preview: duplicates inside file, server duplicates and individual errors are not selectable',async()=>{
 const rows=parseArticles(JSON.stringify([drafts[0],drafts[0],drafts[1],drafts[2]]));
 const result=await previewArticles(rows,async(action,data)=>{assert.equal(action,'import_preview');assert.equal(data.documents.length,4);return {items:[0,1,2,3].map(index=>({index,valid:index!==3,duplicate:index===2,error:index===3?'insights_taxonomy_required':null}))};});
 assert.deepEqual(result.map(r=>r.duplicate),[false,true,true,false]);assert.match(result[3].errors[0],/categoria/);
 await assert.rejects(previewArticles(rows,async()=>({items:[]})),/Prévia indisponível/);
});
test('065 partial results: no false success, no automatic retry, no update/publish calls',async()=>{
 const rows=parseArticles(text),calls=[];
 const result=await importArticles(rows,new Set([0,1,2,3,4]),async(a,d)=>{
  calls.push(a);assert.deepEqual(Object.keys(d),['document']);
  if(calls.length===1)return {status:'created',slug:d.document.slug,state:'draft',post_id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'};
  if(calls.length===2)throw Error('insights_tags_invalid');
  throw Error('network error after possible commit');
 });
 assert.deepEqual(result.map(r=>r.status),['created','rejected','uncertain','ignored','ignored']);assert.deepEqual(calls,['import_draft','import_draft','import_draft']);
 const invalid=await importArticles(rows,new Set([0]),async()=>({status:'created'}));assert.equal(invalid[0].status,'uncertain');
 const denied=await importArticles(rows,new Set([0,1]),async()=>{throw Object.assign(Error('access_denied'),{code:'42501'});});assert.equal(denied[0].status,'rejected');assert.equal(denied[1].status,'ignored');
});
test('065 SQL: authenticated importer reuses the editorial contract and preserves existing content',async t=>{
 const c=await fixture();const call=(action,data={},who='root')=>c.asUser(who,'insights_editor',{p_action:action,p_data:data});
 try{
  await t.test('ordinary company users, anon and service role are denied; explicit editor is allowed',async()=>{
   for(const action of ['import_preview','import_draft']){
    const data=action==='import_preview'?{documents:drafts}:{document:drafts[0]};
    for(const who of ['adminA','anon'])await assert.rejects(call(action,data,who),/denied/);
    await assert.rejects(c.service('insights_editor',{p_action:action,p_data:data}),/permission denied/);
   }
   for(const fn of ['private.insights_import(text,jsonb)','private.insights_import_validate(jsonb)'])for(const role of ['anon','authenticated','service_role'])assert.equal((await c.rawSQL('select has_function_privilege($1,$2,\'EXECUTE\') ok',[role,fn])).rows[0].ok,false);
   await call('grant',{user_id:c.users.adminB,enabled:true});assert.equal((await call('import_preview',{documents:drafts},'adminB')).items.length,5);
  });
  await t.test('preview is read only and flags server-side links, media, taxonomy, types and size',async()=>{
   const bad=[{...drafts[0],category:'Não cadastrada'},{...drafts[0],blocks:[{type:'link',text:'Link',url:'javascript:alert(1)'}]},{...drafts[0],cover:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},{...drafts[0],blocks:[{type:'paragraph',text:{bad:true}}]},{...drafts[0],blocks:[{type:'paragraph',text:'x'.repeat(12001)}]},{...drafts[0],featured:'true'},{...drafts[0],blocks:null}];
   const preview=await call('import_preview',{documents:[...drafts,...bad]});assert.ok(preview.items.slice(0,5).every(x=>x.valid));assert.ok(preview.items.slice(5).every(x=>!x.valid));
   assert.equal((await call('list')).posts.length,0);
   await assert.rejects(call('import_preview',{documents:Array(51).fill(drafts[0])}),/insights_import_invalid/);
  });
  await t.test('five unmodified articles imported by an editor as drafts with history and audit, never publicly visible',async()=>{
   const rows=await previewArticles(parseArticles(text),(a,d)=>call(a,d,'adminB'));
   const results=await importArticles(rows,new Set(rows.map(r=>r.index)),(a,d)=>call(a,d,'adminB'));
   assert.equal(results.filter(r=>r.status==='created').length,5);
   const list=(await call('list')).posts;assert.equal(list.length,5);assert.ok(list.every(p=>p.state==='draft'&&!p.scheduled_at));
   for(const d of drafts)assert.deepEqual(list.find(p=>p.draft.slug===d.slug).draft,d);
   assert.equal((await c.service('insights_service',{p_action:'catalog',p_data:{}})).posts.length,0);
   assert.equal((await c.rawSQL("select count(*)::int n from private.insights_audit where event='imported'and actor_id=$1",[c.users.adminB])).rows[0].n,5);
   assert.equal((await c.rawSQL('select count(*)::int n from private.insights_versions')).rows[0].n,5);
  });
  await t.test('existing draft and published slugs are ignored without changes; redirects also remain reserved',async()=>{
   const existing=(await call('list')).posts[0];await call('publish',{id:existing.id,revision:existing.revision});
   const before=await call('get',{id:existing.id});
   assert.equal((await call('import_draft',{document:{...existing.draft,title:'Outro título que não pode substituir o existente'}})).status,'duplicate');
   assert.deepEqual(await call('get',{id:existing.id}),before);
   const changed=await call('save',{id:existing.id,revision:before.revision,document:{...before.draft,slug:'novo-slug-de-rascunho'}});
   assert.equal((await call('import_preview',{documents:[before.draft]})).items[0].duplicate,true);
   assert.equal((await call('import_draft',{document:before.draft})).status,'duplicate');
   await call('publish',{id:changed.id,revision:changed.revision});
   assert.equal((await call('import_draft',{document:before.draft})).status,'duplicate');
  });
  await t.test('simultaneous and repeated attempts create exactly one article; revoked editor cannot import',async()=>{
   const document={...drafts[0],slug:'concorrencia-importador'};
   const responses=await Promise.all([call('import_draft',{document}),call('import_draft',{document})]);
   assert.deepEqual(responses.map(r=>r.status).sort(),['created','duplicate']);
   assert.equal((await call('import_draft',{document})).status,'duplicate');
   await call('grant',{user_id:c.users.adminB,enabled:false});await assert.rejects(call('import_draft',{document:{...document,slug:'revogado'}},'adminB'),/denied/);
  });
  await t.test('invalid row fails independently and a subsequent valid import can succeed',async()=>{
   const n=(await call('list')).posts.length;
   await assert.rejects(call('import_draft',{document:{...drafts[0],slug:'recusado',title:'x'}}),/invalid/);
   assert.equal((await call('list')).posts.length,n);
   assert.equal((await call('import_draft',{document:{...drafts[0],slug:'depois-da-falha'}})).status,'created');
  });
 }finally{await c.db.close();}
});
