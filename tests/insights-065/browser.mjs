// Focused native-import UI only; real React/RPC SQL, simulated authenticated transport.
import {createServer} from 'vite';import {chromium} from 'playwright';
import {readFile,mkdir,writeFile,chmod} from 'node:fs/promises';import assert from 'node:assert/strict';
import {fixture,drafts} from './fixture.mjs';import {prepareGateBrowser} from '../../scripts/billing-047/browser-runtime.mjs';
const out=process.env.SYZIA065_EVIDENCE_DIR||'reports/insights-065-browser';await mkdir(out,{recursive:true});
const c=await fixture();let vite,browser;let who='root';const calls=[];const result=[];
const call=(action,data={})=>c.asUser(who,'insights_editor',{p_action:action,p_data:data});
const origin='http://127.0.0.1:5191';
try{
 vite=await createServer({configFile:false,define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(origin),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('sb_publishable_local_import_test')},server:{host:'127.0.0.1',port:5191,strictPort:true},plugins:[{name:'local-import-fixture',configureServer(v){v.middlewares.use(async(req,res,next)=>{
  if(req.url!=='/rest/v1/rpc/insights_editor')return next();
  try{let raw='';for await(const chunk of req)raw+=chunk;const {p_action,p_data}=JSON.parse(raw);calls.push(p_action);const answer=await call(p_action,p_data);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(answer));}
  catch(e){res.statusCode=400;res.end(JSON.stringify({message:e.message,code:e.code}));}
 });}}]});await vite.listen();
 await prepareGateBrowser();if(process.platform==='linux'&&process.env.FOUNDATION_CHROMIUM_PATH)await chmod(process.env.FOUNDATION_CHROMIUM_PATH,0o755);
 browser=await chromium.launch({executablePath:process.env.FOUNDATION_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 const context=await browser.newContext({locale:'pt-BR',viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/tests/syzia-061/harness.html');await page.getByRole('button',{name:'Importar artigos',exact:true}).click();
 const panel=page.locator('.ia-import');
 await panel.getByLabel('Arquivo JSON de artigos').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{')});
 await panel.getByRole('alert').filter({hasText:'JSON inválido'}).waitFor();assert.equal(calls.filter(a=>a==='import_draft').length,0);
 await panel.getByLabel('Arquivo JSON de artigos').setInputFiles('content/insights/drafts-061.json');
 await panel.getByText('5 artigos encontrados · 5 selecionados').waitFor();
 await panel.getByRole('checkbox').last().uncheck();
 await panel.getByRole('button',{name:'Continuar com 4 artigos'}).click();
 await panel.getByRole('heading',{name:'Confirmar 4 rascunhos?'}).waitFor();assert.equal((await call('list')).posts.length,0);
 await panel.getByRole('button',{name:'Confirmar importação',exact:true}).dblclick();
 await panel.getByText('4 criados · 1 ignorados · 0 reprovados',{exact:true}).waitFor();
 const originals=(await call('list')).posts;assert.equal(originals.length,4);assert.ok(originals.every(p=>p.state==='draft'));
 assert.equal(calls.filter(a=>a==='import_draft').length,4);assert.ok(!calls.some(a=>['publish','schedule','save','restore'].includes(a)));
 result.push({case:'JSON error, preview, selection, explicit confirmation, double click and four private drafts',status:'PASS'});
 await panel.getByRole('button',{name:'Voltar aos artigos'}).click();
 await page.getByRole('button',{name:'Importar artigos',exact:true}).click();
 await panel.getByLabel('Arquivo JSON de artigos').setInputFiles('content/insights/drafts-061.json');
 await panel.getByText('5 artigos encontrados · 1 selecionados').waitFor();assert.equal(await panel.locator('input[type=checkbox]:disabled').count(),4);
 await panel.getByRole('button',{name:'Continuar com 1 artigos'}).click();await panel.getByRole('button',{name:'Confirmar importação',exact:true}).click();
 await panel.getByText('1 criados · 4 ignorados · 0 reprovados',{exact:true}).waitFor();
 assert.equal((await call('list')).posts.length,5);
 for(const p of originals){const current=await call('get',{id:p.id});assert.equal(current.revision,p.revision);assert.deepEqual(current.draft,p.draft);}
 assert.equal((await c.service('insights_service',{p_action:'catalog',p_data:{}})).posts.length,0);
 result.push({case:'Reimport detects existing slugs and completes remaining article without overwrites/publication',status:'PASS'});
 await panel.getByRole('button',{name:'Voltar aos artigos'}).click();await page.getByRole('button',{name:'Importar artigos',exact:true}).click();
 await panel.getByLabel('Arquivo JSON de artigos').setInputFiles('content/insights/drafts-061.json');await panel.getByText('5 artigos encontrados · 0 selecionados').waitFor();
 for(const width of [1440,390,360]){
  await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await panel.getByRole('button',{name:'Fechar importador'}).focus();await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
  await page.screenshot({path:out+'/import-'+width+'.png',fullPage:true});result.push({case:`Actual import interface ${width}px, keyboard and no horizontal overflow`,status:'PASS'});
 }
 who='adminA';await page.reload();await page.getByRole('heading',{name:'Acesso editorial restrito'}).waitFor();assert.equal(await page.getByRole('button',{name:'Importar artigos',exact:true}).count(),0);
 result.push({case:'Unauthorized company administrator cannot access the importer',status:'PASS'});
 assert.deepEqual(errors,[]);await writeFile(out+'/results.json',JSON.stringify({status:'PASS',engine:'Local Chromium + actual React + PGlite; Auth transport simulated; no remote services',results:result},null,2)+'\n');console.log(JSON.stringify({status:'PASS',cases:result.length,output:out}));
}finally{await browser?.close();await vite?.close();await c.db.close();}
