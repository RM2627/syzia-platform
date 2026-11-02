import {test,expect} from '@playwright/test';
const catalog=[['monthly',5990,1],['semiannual',29940,6],['annual',47880,12]].map(([code,price_cents,interval_months])=>({code,price_cents,interval_months,member_limit:8,service_limit:100,request_limit:1000}));
test('planos, confirmação, bloqueio inicial e mobile: backend simulado',async({page},info)=>{
 let mode='disabled';const commands:any[]=[];
 await page.route('**/billing/**',async route=>{
  if(route.request().url().endsWith('/stripe/command'))commands.push(route.request().postDataJSON());
  await route.fulfill({json:{checkout_mode:mode,environment:'test',provider:null,stripe_available:true,confirmation_enabled:true,test_allowed:true,eligibility:'eligible',catalog,subscription:null}});
 });
 await page.setViewportSize({width:1440,height:1000});await page.goto('/tests/stripe-online/harness.html');
 await expect(page.getByRole('heading',{name:'SYZIA Completa'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Escolher mensal'})).toBeDisabled();
 mode='stripe';await page.getByRole('button',{name:'Atualizar status'}).click();
 await page.getByRole('checkbox').check();await expect(page.getByRole('button',{name:'Escolher mensal'})).toBeEnabled();
 await expect(page.getByText('R$ 299,40',{exact:true})).toBeVisible();await expect(page.getByText('R$ 478,80',{exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('planos-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'Escolher semestral'}).click();
 expect(commands).toHaveLength(1);expect(commands[0]).toMatchObject({offer:'semiannual',trial_expected:true,accepted:true});expect(commands[0]).not.toHaveProperty('price_cents');
 for(const width of [390,360]){
  await page.setViewportSize({width,height:844});await expect(page.getByRole('button',{name:'Escolher anual'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`planos-${width}.png`),fullPage:true});
 }
 await page.getByRole('checkbox').focus();await page.keyboard.press('Space');await expect(page.getByRole('button',{name:'Escolher mensal'})).toBeDisabled();
});
test('retorno mostra pendência, atualização consulta servidor; não concede acesso',async({page})=>{
 const calls:string[]=[];
 await page.route('**/billing/**',async route=>{calls.push(route.request().url());await route.fulfill({json:{checkout_mode:'disabled',environment:'test',provider:'stripe',stripe_available:true,confirmation_enabled:true,test_allowed:true,eligibility:'eligible',catalog,
  subscription:{id:'contract',offer:'monthly',state:'reconciliation',pending:true,cancel_requested:false,trial_end:null,access_until:null,next_charge:null,checkout_url:null}}});});
 await page.goto('/tests/stripe-online/harness.html?retorno=stripe');
 await expect(page.getByRole('heading',{name:'Confirmação em andamento'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Cancelar renovação'})).toHaveCount(0);expect(calls.some(x=>x.endsWith('/stripe/status'))).toBe(true);
 expect(calls.some(x=>x.endsWith('/command'))).toBe(false);
});
