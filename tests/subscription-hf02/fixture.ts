import type {BrowserContext} from '@playwright/test';
import {A,B,catalog,context as checkoutContext,subscription} from '../subscription-ui/fixture';
export {A,B,subscription};
export const path=(org=B)=>`/painel/${org}/assinatura`;
const uid='11111111-1111-4111-8111-111111111111';
export async function setup(browser:BrowserContext){
 const user={id:uid,email:'lia@example.invalid',email_confirmed_at:'2026-11-02T12:00:00Z',is_anonymous:false,aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{}};
 const jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
 await browser.addInitScript(({jwt,user})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:jwt,refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{jwt,user});
 const state={
  values:{[A]:checkoutContext(),[B]:{...checkoutContext(),test_allowed:false}},
  prepared:{[A]:{pending:true,activated:false},[B]:{pending:true,activated:false}} as Record<string,any>,
  calls:[] as {path:string;body:any}[],unexpected:[] as string[],external:[] as string[],
  delay:null as null|((path:string,body:any)=>Promise<void>),statusFail:false,checkoutFail:false,denied:false,
  commandResult:null as any,
 };
 const organizations=[{id:A,name:'Ateliê Aurora',slug:'atelie-aurora',status:'active'},{id:B,name:'Estética Animal JW',slug:'estetica-animal-jw',status:'active'}];
 await browser.route('**/*',async r=>{
  const u=new URL(r.request().url());
  if(!['localhost','127.0.0.1'].includes(u.hostname)){state.external.push(u.origin);return r.abort();}
  if(u.port!=='54321')return r.continue();
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS','x-supabase-api-version':'2024-01-01'};
  if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers});
  const body=r.request().postDataJSON()||{},method=u.pathname.split('/').at(-1),org=body.organization_id||body.p_org;
  state.calls.push({path:u.pathname,body});
  let data:any,status=200;
  if(u.pathname.endsWith('/auth/v1/user'))data=user;
  else if(method==='access_session')data={idle_seconds:1800,warning_seconds:60,last_activity:new Date().toISOString(),legal_required:false,verification_required:false};
  else if(method==='foundation_context')data={profile:{id:uid,display_name:'Lia Costa',status:'active'},roles:[],organizations,memberships:organizations.map(o=>({organization_id:o.id,user_id:uid,role:'admin_empresa',status:'active'}))};
  else if(method==='permissions_context')data={role:'company_admin',actions:Object.fromEntries(['home.read','billing.manage','settings.read','settings.manage','page.read','portfolio.read','services.read','agenda.read','quotes.read','clients.read','people.manage','people.read','analytics.operational'].map(x=>[x,{allowed:!state.denied,scope:'organization'}]))};
  else if(method==='onboarding_context')data={items:[],ready:true,shared_support:false,guide:{status:'completed',step:4,revision:1}};
  else if(method==='support_context')data={allowed:true,requests:[]};
  else if(method==='assisted_company_usage')data={included:false,history:[],used:0,remaining:0,limit:0};
  else if(method==='access_team')data={acceptances:[]};
  else if(method==='legal_documents')data=[];
  else if(method==='commercial_import_finalize'||u.pathname==='/commercial/materialize')data=structuredClone(state.prepared[org]||{pending:false,activated:false});
  else if(method==='billing_context')data={subscription:{state:'pending'},catalog:[],usage:{},invoices:[],events:[],mock_enabled:false};
  else if(method==='billing_capabilities')data={exemption:false};
  else if(u.pathname==='/billing/checkout'||u.pathname==='/billing/stripe/status'){
   if(state.checkoutFail||u.pathname.endsWith('/status')&&state.statusFail){status=503;data={error:'billing_unavailable'};}
   else if(!state.values[org]){status=403;data={error:'access_denied'};}
   else data=structuredClone(state.values[org]);
  }
  else if(u.pathname==='/billing/stripe/command'){
   if(!state.values[org]?.test_allowed||state.values[org]?.checkout_mode!=='stripe'){status=403;data={error:'checkout_disabled'};}
   else data=structuredClone(state.commandResult||{...state.values[org],provider:'stripe',subscription:subscription('reconciliation',{pending:true,access_until:null,next_charge:null})});
  }
  else {state.unexpected.push(u.pathname);status=404;data={error:'unmocked_request'};}
  if(state.delay)await state.delay(u.pathname,body);
  return r.fulfill({status,headers,json:data});
 });
 return state;
}
