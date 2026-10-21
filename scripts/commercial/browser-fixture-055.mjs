// Disposable local Auth/SQL fixture, never a runtime or an external integration.
import {randomBytes,randomUUID} from 'node:crypto';
import {secretBox} from '../../server/commercial/crypto.mjs';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {demoFixture} from '../../tests/commercial-implementation/demo-fixture.mjs';
import {commercialController} from '../../server/commercial/controller.mjs';
import {createCommercialHandler} from '../../server/commercial/http.mjs';
import {createDemoMediaHandler} from '../../server/commercial/media.mjs';
export async function commercialBrowserFixture({c,invoke,getName,user,serialize}) {
 if(process.env.DEMO_TEST_MODE!=='true'||process.env.DEMO_COMMERCIAL_055!=='true')throw Error('local_commercial_fixture_only');
 for(const n of ['202610180054_commercial_preparation.sql','202610200055_commercial_versions.sql'])await c.db.exec(await readFile('supabase/migrations/'+n,'utf8'));
 const is056=process.env.DEMO_COMMERCIAL_056==='true';
 if(is056)await c.db.exec(await readFile('supabase/migrations/202610210056_commercial_preregistration.sql','utf8'));
 const demo=await demoFixture();
 const service=(name,args)=>serialize(()=>invoke(name,args));
 const origins={appOrigin:'http://127.0.0.1:5173',publicOrigin:'http://127.0.0.1:5174'};
 const controller=commercialController({service,asUser:(token,name,args)=>serialize(()=>invoke(name,args,getName(token),token)),auth:async token=>user(getName(token)),store:demo.store,origins,box:is056?secretBox(randomBytes(32).toString('base64')):undefined,sendMail:async()=>{if(!is056)throw Error('email_not_configured');return {messageId:'local-simulated-delivery'};}});
 if(is056) {
  const admin=(name,args)=>invoke(name,args,'root');
  const prepared=await admin('commercial_demo_save',{p_id:null,p_revision:0,p_key:randomUUID(),p_lead:null,p_name:'Ateliê Aurora',p_slug:'atelie-aurora',p_plan:null,p_expires:new Date(Date.now()+86400000*14).toISOString()});
  await c.db.exec('reset role');
  const cfg=(await c.db.query("select private.commercial_config_export(id) cfg from public.organizations order by created_at limit 1")).rows[0].cfg;
  const reviewed=await admin('commercial_demo_draft',{p_id:prepared.id,p_revision:prepared.revision||1,p_config:cfg,p_review:true});
  await admin('commercial_demo_publish',{p_id:prepared.id,p_revision:reviewed.revision,p_config:cfg});
 }
 const http=createCommercialHandler({controller,origins});
 const media=createDemoMediaHandler({store:demo.store,controller,origins,resolvePublic:id=>service('commercial_service',{p_action:'demo',p_data:{id}})});
 const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--mode','demo','--host','127.0.0.1','--port','5174','--strictPort'],{stdio:'inherit',env:{...process.env,VITE_APP_REALM:'demo',VITE_SUPABASE_URL:'',VITE_SUPABASE_PUBLISHABLE_KEY:'',VITE_COMMERCIAL_APP_ORIGIN:origins.appOrigin,VITE_COMMERCIAL_DEMO_ORIGIN:origins.publicOrigin,VITE_COMMERCIAL_API_URL:'http://127.0.0.1:54321'}});
 return {handle:(req,res)=>req.url.startsWith('/demonstration-media/')?media(req,res):http(req,res),close:async()=>{child.kill();await controller.close();await demo.store.close();}};
}
