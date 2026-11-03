import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {A,B,mock,url,subscription} from './fixture';
const commands=(s:any)=>s.calls.filter((x:any)=>x.path==='/billing/stripe/command');
test('real workspace: desktop/mobile cards, aligned actions, contrast, focus and visual evidence',async({page})=>{
 const s=await mock(page);await mkdir('reports/subscription-ui',{recursive:true});const measures:any[]=[];
 await page.setViewportSize({width:1440,height:1050});await page.goto(url);
 await expect(page.getByRole('heading',{name:'Plano e assinatura'})).toBeVisible();await expect(page.locator('.sc-offer')).toHaveCount(3);
 for(const total of['59,90','299,40','478,80'])await expect(page.locator('.sc-price').filter({hasText:total})).toBeVisible();
 for(const equivalent of['49,90','39,90'])await expect(page.locator('.sc-equivalent').filter({hasText:equivalent})).toBeVisible();
 await expect(page.locator('.sc-period').filter({hasText:'Não é parcelamento'})).toHaveCount(2);
 await expect(page.getByText('Primeira cobrança prevista:',{exact:false})).toHaveCount(0);
 for(const width of[1440,1024,390,360]){
  await page.setViewportSize({width,height:1050});await expect(page.locator('.sc-offer').last()).toBeVisible();
  const boxes=await page.locator('.sc-offer').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return{x:r.x,y:r.y,w:r.width,h:r.height,background:c.backgroundColor,color:c.color,opacity:c.opacity};}));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  for(const box of boxes){expect(box.w).toBeGreaterThan(170);expect(box.h).toBeGreaterThan(250);expect(box.h).toBeLessThan(520);expect(box.opacity).toBe('1');expect(box.background).toBe('rgb(255, 255, 255)');}
  if(width>=1024){expect(new Set(boxes.map(x=>Math.round(x.y))).size).toBe(1);const ys=await page.locator('.sc-offer button').evaluateAll(es=>es.map(e=>Math.round(e.getBoundingClientRect().bottom)));expect(new Set(ys).size).toBe(1);}
  else expect(boxes[1].y).toBeGreaterThan(boxes[0].y+boxes[0].h);
  measures.push({width,boxes});
  if(width===1440||width===390)await page.screenshot({path:`reports/subscription-ui/depois-${width}.png`,fullPage:true});
 }
 await page.getByRole('button',{name:'Escolher semestral'}).focus();await expect(page.getByRole('button',{name:'Escolher semestral'})).toBeFocused();
 expect(await page.getByRole('button',{name:'Escolher semestral'}).evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('solid');await page.keyboard.press('Enter');
 await expect(page.getByRole('button',{name:'Escolher semestral'})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Continuar no checkout seguro'})).toBeDisabled();
 const contrasts=await page.evaluate(()=>{
  const lum=(rgb:string)=>{const c=rgb.match(/\d+/g)!.slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
  return ['.sc-offer h3','.sc-period','.sc-limits','.sc-badge','.sc-price','.sc-primary','.sc-button:disabled'].map(selector=>{const e=document.querySelector(selector)!,c=getComputedStyle(e);let parent:Element|null=e,bg='';while(parent){bg=getComputedStyle(parent).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')break;parent=parent.parentElement;}const a=lum(c.color),b=lum(bg);return{selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
 });for(const c of contrasts)expect(c.ratio,c.selector).toBeGreaterThanOrEqual(4.5);
 await writeFile('reports/subscription-ui/layout-and-contrast.json',JSON.stringify({measures,contrasts},null,2));
 await page.setViewportSize({width:1440,height:1050});await page.getByRole('heading',{name:'Plano e assinatura'}).click();await page.evaluate(()=>window.scrollTo(0,0));await page.evaluate(()=>new Promise(requestAnimationFrame));await page.screenshot({path:'reports/subscription-ui/semestral-selecionado.png',fullPage:true});
 expect(commands(s)).toHaveLength(0);
});
test('selection and explicit consent preserve command payload, one in-flight request and idempotent retry',async({page})=>{
 const s=await mock(page);await page.goto(url);await page.getByRole('button',{name:'Escolher semestral'}).click();
 await expect(page.getByRole('heading',{name:/Semestral ·/})).toContainText('299,40');expect(commands(s)).toHaveLength(0);
 await page.getByRole('checkbox').check();s.commandFail=true;
 await page.getByRole('button',{name:'Continuar no checkout seguro'}).evaluate((e:HTMLButtonElement)=>{e.click();e.click();});
 await expect(page.getByRole('alert')).toBeVisible();expect(commands(s)).toHaveLength(1);
 const first=commands(s)[0].body;expect(first).toMatchObject({organization_id:A,action:'checkout',offer:'semiannual',trial_expected:true,accepted:true});
 expect(Object.keys(first).sort()).toEqual(['accepted','action','offer','organization_id','request_key','trial_expected']);
 await expect(page.getByRole('button',{name:'Escolher anual'})).toBeDisabled();
 s.commandFail=false;s.commandResult={...s.value,provider:'stripe',subscription:subscription('reconciliation',{pending:true,access_until:null,next_charge:null})};
 await page.getByRole('button',{name:'Atualizar status'}).click();await page.getByRole('button',{name:'Continuar no checkout seguro'}).click();
 await expect(page.getByRole('heading',{name:'Confirmação em andamento'})).toBeVisible();expect(commands(s)).toHaveLength(2);expect(commands(s)[1].body.request_key).toBe(first.request_key);
 await expect(page.getByRole('button',{name:'Cancelar renovação'})).toHaveCount(0);
});
test('disabled checkout, unauthorized organization, communication failure and browser return never grant access',async({page})=>{
 const s=await mock(page);s.value.checkout_mode='disabled';s.value.catalog.forEach((o:any)=>o.checkout_available=false);
 await page.goto(url+'?retorno=stripe');await expect(page.getByText('Contratação temporariamente indisponível.',{exact:false})).toBeVisible();
 for(const name of['mensal','semestral','anual'])await expect(page.getByRole('button',{name:'Escolher '+name})).toBeDisabled();
 await expect(page.getByRole('heading',{name:'Sem assinatura',exact:true})).toBeVisible();expect(commands(s)).toHaveLength(0);await page.screenshot({path:'reports/subscription-ui/contratacao-bloqueada.png',fullPage:true});
 s.fail=true;await page.getByRole('button',{name:'Atualizar status'}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('.sc-offer')).toHaveCount(0);
 await expect(page.getByText('Consultando sua assinatura…')).toHaveCount(0);expect(commands(s)).toHaveLength(0);
});
test('prepared status comes from the existing Billing pending record, not the URL',async({page})=>{
 const s=await mock(page);s.value.prepared=true;s.value.checkout_mode='disabled';await page.goto(url+'?billing');
 await expect(page.getByRole('heading',{name:'Cadastro preparado',exact:true})).toBeVisible();
 expect(s.calls.some(x=>x.path.endsWith('/billing_context'))).toBe(true);await expect(page.locator('.sc-offer')).toHaveCount(3);
});
test('subscription states and dates remain backend-derived; unsupported actions are absent',async({page})=>{
 const s=await mock(page);await page.setViewportSize({width:1440,height:1050});s.value.provider='stripe';s.value.subscription=subscription('trialing',{trial_end:'2026-11-09T12:00:00Z',access_until:'2026-11-09T12:00:00Z',next_charge:'2026-11-09T12:00:00Z'});await page.goto(url);
 await expect(page.getByRole('heading',{name:'Trial confirmado'})).toBeVisible();await expect(page.locator('.sc-dates')).toContainText('09 de nov. de 2026');
 await page.screenshot({path:'reports/subscription-ui/trial-confirmado.png',fullPage:true});
 for(const [raw,label,extra]of[
  ['active','Assinatura ativa',{}],['payment_pending','Pagamento pendente',{access_until:null,next_charge:null}],
  ['reconciliation','Checkout em andamento',{pending:true,checkout_url:'https://checkout.stripe.com/c/pay/fixture',access_until:null,next_charge:null}],
  ['reconciliation','Confirmação em andamento',{pending:true,access_until:null,next_charge:null}],
  ['active','Cancelamento programado',{cancel_requested:true}],['canceled','Assinatura cancelada',{}],
  ['unknown','Aguardando validação',{}]
 ]as const){s.value.subscription=subscription(raw,extra);await page.getByRole('button',{name:'Atualizar status'}).click();await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();if(['payment_pending','reconciliation','canceled','unknown'].includes(raw))await expect(page.getByRole('button',{name:'Cancelar renovação'})).toHaveCount(0);}
 await expect(page.getByRole('button',{name:/alterar|mudar modalidade/i})).toHaveCount(0);expect(commands(s)).toHaveLength(0);
});
test('cancel/resume retain existing commands, explicit confirmation and organization binding',async({page})=>{
 const s=await mock(page);s.value.provider='stripe';s.value.subscription=subscription('active');await page.goto(url);page.on('dialog',d=>d.accept());
 s.commandResult={...s.value,subscription:subscription('cancel_scheduled',{cancel_requested:true,access_until:'2030-12-09T12:00:00Z'})};
 await page.getByRole('button',{name:'Cancelar renovação'}).click();await expect(page.getByRole('button',{name:'Reativar renovação'})).toBeVisible();
 s.commandResult={...s.value,subscription:subscription('active')};await page.getByRole('button',{name:'Reativar renovação'}).click();await expect(page.getByRole('heading',{name:'Assinatura ativa',exact:true})).toBeVisible();
 expect(commands(s).map((x:any)=>x.body.action)).toEqual(['cancel','resume']);for(const c of commands(s)){expect(c.body.organization_id).toBe(A);expect(Object.keys(c.body).sort()).toEqual(['action','organization_id','request_key']);}
});
test('late response from another organization cannot replace current subscription or authorize commands',async({page})=>{
 const s=await mock(page);s.value.provider='stripe';s.value.subscription=subscription('active');let release!:()=>void;
 s.delay=async(path,body)=>{if(path==='/billing/checkout'&&body.organization_id===A)await new Promise<void>(r=>release=r);};
 await page.goto(url+'?switch');await expect.poll(()=>!!release).toBe(true);s.value.provider=null;s.value.subscription=null;s.value.checkout_mode='disabled';
 await page.getByRole('button',{name:'Alternar organização'}).click();await expect(page.getByRole('heading',{name:'Sem assinatura',exact:true})).toBeVisible();const late=page.waitForResponse(r=>r.url().endsWith('/billing/checkout')&&r.request().postDataJSON().organization_id===A);release();await late;await page.evaluate(()=>new Promise(requestAnimationFrame));
 await expect(page.getByRole('heading',{name:'Sem assinatura',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Cancelar renovação'})).toHaveCount(0);
 expect(s.calls.some(x=>x.path==='/billing/stripe/status'&&x.body.organization_id===A)).toBe(false);expect(s.calls.some(x=>x.path==='/billing/checkout'&&x.body.organization_id===B)).toBe(true);expect(commands(s)).toHaveLength(0);
});
test('late checkout completion cannot redirect after organization switch',async({page})=>{
 const s=await mock(page);let release!:()=>void;s.delay=async(path)=>{if(path==='/billing/stripe/command')await new Promise<void>(r=>release=r);};
 s.commandResult={...s.value,provider:'stripe',subscription:subscription('payment_pending',{checkout_url:'https://checkout.stripe.com/c/pay/fixture'})};
 await page.goto(url+'?switch');await page.getByRole('button',{name:'Escolher anual'}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Continuar no checkout seguro'}).click();await expect.poll(()=>!!release).toBe(true);
 s.value.checkout_mode='disabled';await page.getByRole('button',{name:'Alternar organização'}).click();await expect(page.getByRole('heading',{name:'Sem assinatura',exact:true})).toBeVisible();const late=page.waitForResponse(r=>r.url().endsWith('/stripe/command'));release();await late;await page.evaluate(()=>new Promise(requestAnimationFrame));
 await expect(page).toHaveURL(/tests\/subscription-ui\/harness/);expect(commands(s)).toHaveLength(1);expect(commands(s)[0].body.organization_id).toBe(A);
});
test('catalog admin remains legible and uses its existing save contract',async({page})=>{
 const s=await mock(page);await page.setViewportSize({width:1440,height:1000});await page.goto(url+'?admin');await expect(page.locator('.cc-card')).toHaveCount(3);
 await page.getByLabel('Exibir publicamente · Semestral').uncheck();await page.getByRole('button',{name:'Salvar semestral'}).click();
 const call=s.calls.find(x=>x.path.endsWith('/commercial_catalog_save'))!;expect(call.body.p_data.site_visible).toBe(false);expect(call.body.p_data).not.toHaveProperty('price_cents');
 for(const width of[1440,390]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:`reports/subscription-ui/catalogo-admin-${width}.png`,fullPage:true});}
});
