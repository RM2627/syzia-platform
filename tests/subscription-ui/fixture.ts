import type {Page} from '@playwright/test';
export const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
export const catalog=()=>['monthly','semiannual','annual'].map((code,i)=>({code,product_name:'SYZIA Completa',modality:['Mensal','Semestral','Anual'][i],description:'Todos os recursos de software em uma plataforma.',price_cents:[5990,29940,47880][i],interval_months:[1,6,12][i],checkout_available:true,saving_cents:[0,6000,24000][i],discount_percent:[0,16.69,33.39][i],member_limit:8,service_limit:100,request_limit:1000}));
export const context=()=>({checkout_mode:'stripe',environment:'test',provider:null,stripe_available:true,stripe_operations_available:true,confirmation_enabled:true,test_allowed:true,eligibility:'eligible',catalog:catalog(),subscription:null} as any);
export const subscription=(state='active',extra:any={})=>({id:'20000000-0000-4000-8000-000000000001',state,offer:'monthly',environment:'test',trial_end:null,access_until:'2026-12-09T12:00:00Z',next_charge:'2026-12-09T12:00:00Z',pending:false,cancel_requested:false,checkout_url:null,error_code:null,...extra});
export const url='/tests/subscription-ui/harness.html';
export async function mock(page:Page){
 const state={value:context(),calls:[] as {path:string;body:any}[],fail:false,commandFail:false,delay:null as null|((path:string,body:any)=>Promise<void>),commandResult:null as any};
 await page.route('**/*',async r=>{
  const u=new URL(r.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname))return r.abort();if(u.port!=='54321')return r.continue();
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
  if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers});
  const body=r.request().postDataJSON(),value=structuredClone(state.value);state.calls.push({path:u.pathname,body});
  if(state.delay)await state.delay(u.pathname,body);
  if(u.pathname.startsWith('/billing/'))return r.fulfill({status:state.fail||(state.commandFail&&u.pathname.endsWith('/command'))?503:200,headers,json:state.fail?{error:'access_denied'}:state.commandFail&&u.pathname.endsWith('/command')?{error:'billing_operation_pending'}:u.pathname.endsWith('/command')&&state.commandResult?state.commandResult:value});
  const method=u.pathname.split('/').at(-1);
  if(method==='billing_context')return r.fulfill({headers,json:{mock_enabled:false,subscription:value.prepared?{state:'pending'}:null,catalog:[],usage:{},events:[],invoices:[]}});
  if(method==='billing_capabilities')return r.fulfill({headers,json:{}});
  if(method==='commercial_catalog_admin')return r.fulfill({headers,json:value.catalog.map((o:any,i:number)=>({...o,id:'catalog-'+i,catalog_revision:1,active:true,site_visible:true,available:true}))});
  return r.fulfill({headers,json:{}});
 });return state;
}
