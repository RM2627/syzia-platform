import {test,expect} from '../support/demo-test';
import {demoLogin} from '../support/demo-login';
import {mkdir} from 'node:fs/promises';
test('048 desktop/mobile: Manual opcional, publicação, operação e rascunho sem bloqueio',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await demoLogin(page);
 const info:any=await page.evaluate(async()=>{const {rpc}=await import('/src/api.ts');const ctx:any=await rpc('foundation_context');const org=ctx.organizations.find((x:any)=>x.slug==='ms-auto-ficticia').id;return {org,company:await rpc('company_context',{p_org:org}),setup:await rpc('onboarding_context',{p_org:org})};});
 expect(info.company.settings.published_manual_id).toBeNull();expect(info.setup.ready).toBe(true);expect(info.setup.items.find((x:any)=>x.id==='manual').required).toBe(false);
 await mkdir('reports/syzia-048/screenshots',{recursive:true});
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});await page.goto(`/painel/${info.org}/ajuda`);
  await expect(page.getByRole('heading',{name:'Sua empresa está preparada'})).toBeVisible();
  await expect(page.getByText('Manual da empresa — Opcional',{exact:true}).first()).toBeVisible();
  expect(await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth))).toBe(0);
  await page.screenshot({path:`reports/syzia-048/screenshots/manual-opcional-${width}.png`,fullPage:true});
 }
 await page.goto(`/painel/${info.org}/pagina#publicacao`);
 await expect(page.getByRole('heading',{name:'Pronto para receber seus clientes?'})).toBeVisible();
 await page.locator('#publicacao').getByRole('button',{name:'Visualizar como cliente',exact:true}).click();
 await expect(page.getByLabel('Prévia do rascunho',{exact:true})).toBeVisible();await page.getByRole('button',{name:/Fechar prévia/}).click();
 await page.getByRole('button',{name:'Publicar alterações',exact:true}).click();
 await expect(page.getByText(/Alterações publicadas. Sua página já apresenta a versão revisada./).first()).toBeVisible();
 await page.goto(`/painel/${info.org}/manual`);await expect(page.getByRole('heading',{name:'Manual da empresa — Opcional',exact:true})).toBeVisible();
 await page.evaluate(async org=>{const {rpc}=await import('/src/api.ts');const c:any=await rpc('company_context',{p_org:org});await rpc('company_create_manual',{p_org:org,p_expected_revision:c.settings.revision,p_title:'Orientações parciais 048'});},info.org);
 await page.goto(`/painel/${info.org}/ajuda`);await expect(page.getByRole('heading',{name:'Sua empresa está preparada'})).toBeVisible();
 for(const section of ['agenda','orcamentos','atendimento','acessos']){
  await page.goto(`/painel/${info.org}/${section}`);await expect(page.locator('main')).toBeVisible();await expect(page.getByText(/Publique uma versão do manual antes de|Complete os tópicos do manual/)).toHaveCount(0);
 }
 await page.goto('/empresa/ms-auto-ficticia');await expect(page.getByRole('heading',{name:/MS Auto Details/}).first()).toBeVisible();
 expect(errors).toEqual([]);
});
