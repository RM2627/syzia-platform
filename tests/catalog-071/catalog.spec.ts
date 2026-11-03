import {test,expect,type BrowserContext} from '@playwright/test';
const uid='11111111-1111-4111-8111-111111111111';
const jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
const user={id:uid,email:'lia@example.invalid',email_confirmed_at:'2026-11-02T12:00:00Z',is_anonymous:false,aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{}};
const make=()=>['monthly','semiannual','annual'].map((code,i)=>({id:`00000000-0000-4000-8000-00000000000${i+1}`,code,product_name:'SYZIA Completa',modality:['Mensal','Semestral','Anual'][i],name:'SYZIA Completa — '+['Mensal','Semestral','Anual'][i],description:'Todos os recursos de software',active:true,site_visible:true,available:false,self_service:true,trial_eligible:true,checkout_available:false,provider:'stripe',catalog_revision:1,price_cents:[5990,29940,47880][i],interval_months:[1,6,12][i],member_limit:8,service_limit:100,request_limit:1000,saving_cents:[0,6000,24000][i],discount_percent:[0,16.69,33.39][i],version:{id:`10000000-0000-4000-8000-00000000000${i+1}`,price_cents:[5990,29940,47880][i],interval_months:[1,6,12][i],trial_days:7,member_limit:8,service_limit:100,request_limit:1000,capabilities:{finance:true,analytics:true},commercial_followups:true,human_support:false}}));
async function setup(context:BrowserContext){
 const rows=make(),calls:string[]=[];
 await context.addInitScript(({jwt,user})=>{localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:jwt,refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));},{jwt,user});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(!['localhost','127.0.0.1'].includes(u.hostname))return route.abort();if(u.port!=='54321')return route.continue();
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS','x-supabase-api-version':'2024-01-01'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  calls.push(u.pathname);const body=route.request().postDataJSON();let data:any={},status=200;
  const visible=()=>rows.filter(x=>x.active&&x.site_visible);
  if(u.pathname==='/billing/catalog')data=visible();
  else if(u.pathname.endsWith('/commercial_catalog_admin'))data=rows;
  else if(u.pathname.endsWith('/commercial_catalog_save')){const r=rows.find(x=>x.id===body.p_id)!;Object.assign(r,body.p_data);r.catalog_revision++;data=null;}
  else if(u.pathname==='/access/signup-status')data={registered:true,confirmed:true,name:'Lia Costa',username:'lia.costa',missing_name:false,missing_username:false};
  else if(u.pathname.endsWith('/commercial_activation_pending'))data=[];
  else if(u.pathname.endsWith('/selfservice_context'))data=null;
  else if(u.pathname==='/billing/checkout')data={checkout_mode:'disabled',environment:'test',provider:null,stripe_available:false,confirmation_enabled:false,test_allowed:false,eligibility:'eligible',catalog:visible(),subscription:null};
  else if(u.pathname.endsWith('/user'))data=user;
  else if(u.pathname.endsWith('/selfservice_save')){const p=rows.find(x=>x.id===body.p_plan)!;data={id:'draft',revision:1,name:body.p_name,document_masked:'***.***.***-25',state:'ready',eligibility:'eligible',plan:{...p.version,name:p.name,version_id:p.version.id,id:p.id},organization_id:null};}
  else if(u.pathname.includes('/rest/'))data={items:[],plans:[]};
  else status=404;
  return route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(data)});
 });return {rows,calls};
}
const url=(path:string)=>'/tests/catalog-071/harness.html?route='+encodeURIComponent(path);
test('Super Admin visibility updates public page, signup and subscription catalog from the same source',async({context,page})=>{
 const s=await setup(context),publicPage=await context.newPage();
 await page.goto(url('/admin/catalogo'));await publicPage.goto(url('/planos'));
 await expect(publicPage.getByRole('heading',{name:'SYZIA Completa',exact:true})).toHaveCount(3);
 await page.getByLabel('Exibir publicamente · Semestral').uncheck();await page.getByRole('button',{name:'Salvar semestral'}).click();
 await expect(page.getByRole('status')).toContainText('Visibilidade atualizada');
 await publicPage.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(publicPage.getByRole('heading',{name:'SYZIA Completa',exact:true})).toHaveCount(2);
 await publicPage.goto(url('/cadastrar'));await expect(publicPage.getByLabel('Modalidade')).toBeVisible();
 await expect(publicPage.getByLabel('Modalidade').locator('option')).toHaveCount(3); // placeholder + two visible modalities
 await expect(publicPage.getByLabel('Modalidade')).not.toContainText('Semestral');
 await publicPage.goto(url('/assinatura'));await expect(publicPage.getByRole('button',{name:/Escolher/})).toHaveCount(2);
 expect(s.calls.filter(x=>x.includes('stripe/command'))).toHaveLength(0);await publicPage.close();
});
for(const width of [1440,390,360])test('Three full-period amounts, blocked checkout, responsive public/signup/subscription '+width,async({context,page})=>{
 const s=await setup(context);await page.setViewportSize({width,height:900});await page.goto(url('/planos'));
 for(const amount of ['59,90','299,40','478,80'])await expect(page.locator('.sy-price').filter({hasText:amount})).toBeVisible();
 await expect(page.getByText('Contratação temporariamente indisponível.',{exact:false})).toHaveCount(3);
 await expect(page.locator('body')).not.toContainText('Essencial');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.goto(url('/cadastrar'));await expect(page.getByLabel('Modalidade')).toBeVisible();
 await page.getByLabel('Modalidade').selectOption(s.rows[2].id);
 await expect(page.getByLabel('Modalidade')).toContainText('478,80');
 await page.goto(url('/assinatura'));await expect(page.getByRole('button',{name:'Escolher anual'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Escolher semestral'})).toBeDisabled();await expect(page.getByRole('button',{name:'Escolher mensal'})).toBeDisabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 expect(s.calls.some(x=>/stripe\/command|selfservice_complete/.test(x))).toBe(false);
});
