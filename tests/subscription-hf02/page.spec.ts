import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {setup,path,A,B,subscription} from './fixture';
const out='reports/subscription-hf02';mkdirSync(out,{recursive:true});
test('complete built route: prepared company without checkout permission has compact notice and visible modalities',async({context,page})=>{
 const s=await setup(context),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1440,height:1000});await page.goto(path());
 await expect(page.locator('.sc-offer')).toHaveCount(3);
 await expect(page.getByText('Configuração comercial preservada',{exact:true})).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 const prefix=process.env.SYZIA_CAPTURE_PREFIX||'depois';
 await page.screenshot({path:`${out}/${prefix}-desktop.png`,fullPage:true});
 const metrics=await page.evaluate(()=>{
  const note=Array.from(document.querySelectorAll('strong')).find(n=>n.textContent==='Configuração comercial preservada')!.parentElement!;
  const head=document.querySelector('.sc-heading')!,first=document.querySelector('.sc-offer')!;
  return {noticeTag:note.tagName,noticeHeight:note.getBoundingClientRect().height,noticePosition:getComputedStyle(note).position,headingTop:head.getBoundingClientRect().top,firstCardTop:first.getBoundingClientRect().top,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,noticeColor:getComputedStyle(note).color,noticeBackground:getComputedStyle(note).backgroundColor};
 });
 writeFileSync(`${out}/${prefix}-layout.json`,JSON.stringify(metrics,null,2));
 expect(metrics.noticeHeight).toBeLessThan(180);
 expect(metrics.noticePosition).toBe('static');
 expect(metrics.headingTop).toBeLessThan(180);
 expect(metrics.firstCardTop).toBeLessThan(650);
 await expect(page.getByRole('button',{name:'Verificar confirmação',exact:true})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Continuar contratação',exact:true})).toHaveCount(0);
 await expect(page.getByText('Contratação temporariamente indisponível.',{exact:false})).toBeVisible();
 for(const width of [1440,1024,768,390,360]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo(0,0));
  const boxes=await page.locator('.sc-offer').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right};}));
  for(const b of boxes){expect(b.width).toBeGreaterThan(165);expect(b.height).toBeLessThan(510);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(width);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  if(width>=1024)expect(new Set(boxes.map(b=>Math.round(b.y))).size).toBe(1);
  if(width<=760)expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
  for(const b of await page.getByRole('button',{name:/^Escolher /}).all())await expect(b).toBeDisabled();
  if([1440,768,390].includes(width))await page.screenshot({path:`${out}/${prefix}-${width}.png`,fullPage:true});
 }
 await expect(page.locator('.sc-offers')).toContainText('R$ 59,90');
 await expect(page.locator('.sc-offers')).toContainText('R$ 299,40');
 await expect(page.locator('.sc-offers')).toContainText('R$ 478,80');
 await expect(page.locator('.sc-offers')).toContainText('R$ 60,00 de economia');
 await expect(page.locator('.sc-offers')).toContainText('R$ 240,00 de economia');
 expect(s.calls.filter(c=>c.path.endsWith('/stripe/command'))).toHaveLength(0);
 expect(s.unexpected).toEqual([]);expect(s.external).toEqual([]);expect(errors).toEqual([]);
});
test('full route authorizes selection only for the selected organization; pending verification follows a real command',async({context,page})=>{
 const s=await setup(context);await page.goto(path(A));
 await expect(page.getByRole('button',{name:'Verificar confirmação'})).toHaveCount(0);
 await page.getByRole('button',{name:'Escolher semestral',exact:true}).click();
 await expect(page.locator('.sc-order')).toContainText('R$ 299,40');
 await expect(page.getByRole('button',{name:'Continuar no checkout seguro',exact:true})).toBeDisabled();
 expect(s.calls.filter(c=>c.path.endsWith('/stripe/command'))).toHaveLength(0);
 await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Continuar no checkout seguro',exact:true}).dblclick();
 await expect(page.getByRole('button',{name:'Verificar confirmação',exact:true})).toBeVisible();
 const commands=s.calls.filter(c=>c.path.endsWith('/stripe/command'));expect(commands).toHaveLength(1);
 expect(commands[0].body).toEqual({organization_id:A,action:'checkout',request_key:expect.any(String),offer:'semiannual',accepted:true,trial_expected:true});
 s.values[A]={...s.values[A],provider:'stripe',subscription:subscription('trialing',{offer:'semiannual',trial_end:'2026-11-09T12:00:00Z',access_until:'2026-11-09T12:00:00Z',next_charge:'2026-11-09T12:00:00Z'})};
 s.prepared[A]={pending:false,activated:true};
 await page.getByRole('button',{name:'Verificar confirmação',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Trial confirmado',exact:true})).toBeVisible();
 await expect(page.getByText('Catálogo preparado habilitado',{exact:true})).toBeVisible();
 await expect(page.locator('.sc-dates')).toContainText('09 de nov. de 2026');
 await expect(page.getByRole('button',{name:'Verificar confirmação'})).toHaveCount(0);
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${out}/trial-confirmado.png`,fullPage:true});
 expect(s.unexpected).toEqual([]);expect(s.external).toEqual([]);
});
test('real route keeps pending, active and canceled states distinct, without inventing financial commands',async({context,page})=>{
 const s=await setup(context);s.values[A].provider='stripe';s.values[A].subscription=subscription('payment_pending',{checkout_url:'https://checkout.stripe.com/c/pay/fixture',access_until:null,next_charge:null});
 await page.goto(path(A)+'?retorno=1');await expect(page.getByRole('heading',{name:'Checkout em andamento'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Continuar no checkout seguro',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Verificar confirmação'})).toBeVisible();
 for(const [state,label,extra]of [
  ['payment_pending','Pagamento pendente',{access_until:null,next_charge:null}],
  ['active','Assinatura ativa',{}],['active','Cancelamento programado',{cancel_requested:true}],
  ['canceled','Assinatura cancelada',{}],
 ]as const){
  s.values[A].subscription=subscription(state,extra);await page.getByRole('button',{name:/^(Atualizar status|Verificar confirmação)$/}).click();
  await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Verificar confirmação'})).toHaveCount(state==='payment_pending'?1:0);
 }
 expect(s.calls.filter(c=>c.path.endsWith('/stripe/command'))).toHaveLength(0);expect(s.unexpected).toEqual([]);
});
test('organization navigation rejects late snapshots and never reuses another organization checkout',async({context,page})=>{
 const s=await setup(context);s.values[A].provider='stripe';s.values[A].subscription=subscription('active');
 s.prepared[B]={pending:false,activated:false};let release!:()=>void;
 s.delay=async(p,b)=>{if(p==='/billing/checkout'&&b.organization_id===A)await new Promise<void>(r=>release=r);};
 await page.goto(path(A));await expect.poll(()=>!!release).toBe(true);
 await page.evaluate(p=>{history.pushState({},'',p);window.dispatchEvent(new PopStateEvent('popstate'));},path(B));
 await expect(page.locator('.v-account')).toContainText('Estética Animal JW');
 await expect(page.getByRole('heading',{name:'Cadastro preparado',exact:true})).toBeVisible();
 const late=page.waitForResponse(r=>r.url().endsWith('/billing/checkout')&&r.request().postDataJSON().organization_id===A);release();await late;await page.evaluate(()=>new Promise(requestAnimationFrame));
 await expect(page.getByRole('button',{name:'Cancelar renovação'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Escolher mensal',exact:true})).toBeDisabled();
 await expect(page.getByRole('region',{name:'Configuração preparada',exact:true})).toHaveCount(0);
 expect(s.calls.some(c=>c.path.endsWith('/stripe/status')&&c.body.organization_id===A)).toBe(false);
 expect(s.calls.filter(c=>c.path.endsWith('/stripe/command'))).toHaveLength(0);expect(s.unexpected).toEqual([]);
});
test('reconciliation failure preserves authorized catalog but freezes financial actions; authorization failure clears it',async({context,page})=>{
 const s=await setup(context);s.values[A].provider='stripe';s.values[A].subscription=subscription('active');s.statusFail=true;
 await page.goto(path(A));await expect(page.getByRole('alert')).toContainText('Não foi possível atualizar a assinatura');
 await expect(page.locator('.sc-offer')).toHaveCount(3);await expect(page.getByRole('button',{name:'Cancelar renovação'})).toHaveCount(0);
 await expect(page.getByText('Situação ainda não atualizada.',{exact:false})).toBeVisible();
 s.statusFail=false;await page.getByRole('button',{name:'Atualizar status',exact:true}).click();await expect(page.getByRole('button',{name:'Cancelar renovação'})).toBeVisible();
 s.checkoutFail=true;await page.getByRole('button',{name:'Atualizar status',exact:true}).click();await expect(page.locator('.sc-offer')).toHaveCount(0);
 expect(s.calls.filter(c=>c.path.endsWith('/stripe/command'))).toHaveLength(0);
});
test('protected route preserves billing permission boundary and rejects an organization outside membership',async({context,page})=>{
 const s=await setup(context);s.denied=true;await page.goto(path());
 await expect(page.getByRole('heading',{name:'Acesso não disponível'})).toBeVisible();
 expect(s.calls.some(c=>c.path.startsWith('/billing/'))).toBe(false);
 await page.goto(path('10000000-0000-4000-8000-000000000009'));
 await expect(page.getByRole('heading',{name:'Empresa indisponível'})).toBeVisible();
 expect(s.calls.some(c=>c.path.startsWith('/billing/'))).toBe(false);expect(s.unexpected).toEqual([]);
});
test('prepared notice outside subscription remains compact and links to modalities without financial confirmation action',async({context,page})=>{
 const s=await setup(context);await page.goto(`/painel/${B}/legal`);
 await expect(page.getByRole('link',{name:'Ver modalidades e assinatura'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Verificar confirmação'})).toHaveCount(0);
 const size=await page.locator('.prepared-company').boundingBox();expect(size!.height).toBeLessThan(180);
 await page.getByRole('link',{name:'Ver modalidades e assinatura'}).click();
 await expect(page).toHaveURL(new RegExp(path()));await expect(page.locator('.sc-offer')).toHaveCount(3);
 await expect(page.getByRole('link',{name:'Ver modalidades e assinatura'})).toHaveCount(0);expect(s.unexpected).toEqual([]);
});
