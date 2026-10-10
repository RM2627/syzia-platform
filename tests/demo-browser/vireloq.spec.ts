import {demoLogin as login} from "../support/demo-login";
import {test,expect} from '../support/demo-test';

for(const [device,width,height] of [['desktop',1440,1000],['mobile',390,844]] as const){
 test('VIRELOQ: identidade, empresa e assinatura '+device,async({page})=>{
 await page.setViewportSize({width,height});await page.goto('/entrar');await expect(page.getByRole('heading',{name:'Entre na VIRELOQ'})).toBeVisible();await page.screenshot({path:'reports/vireloq/login-'+device+'.png',fullPage:true});
 await login(page,'admin@example.invalid');await page.getByRole('link',{name:/MS Auto Details/}).first().click();
 await expect(page.getByLabel('Usuário conectado')).toContainText('Administrador');await expect(page.getByRole('heading',{name:'O que precisa ser feito hoje?'})).toBeVisible();await page.screenshot({path:'reports/vireloq/painel-'+device+'.png',fullPage:true});
 await page.getByRole('link',{name:'Plano e assinatura',exact:true}).click();await expect(page).toHaveURL(/\/assinatura$/);await expect(page.getByRole('region',{name:'Contratação'})).toBeVisible();await expect(page.getByText('Ativa',{exact:true}).first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'reports/vireloq/assinatura-'+device+'.png',fullPage:true});
 });

}
test('VIRELOQ: rascunhos em módulos após foco e refresh periódico',async({page})=>{
 test.setTimeout(180000);await login(page,'admin@example.invalid');await page.getByRole('link',{name:/MS Auto Details/}).first().click();const base=page.url();
 for(const [route,label] of [['configuracao','Descrição do negócio'],['servicos','Nome do serviço'],['pagina','Título'],['clientes','Nome'],['novo-orcamento','Observações'],['novo-agendamento','Observações']] as const){
  await page.goto(base+'/'+route);let field=page.getByLabel(label,{exact:true});
  if(route==='pagina'){await page.getByRole('link',{name:/Portfólio/}).first().click();}
  if(route==='clientes'){await page.getByRole('button',{name:'+ Novo cliente',exact:true}).click();}
  await expect(field).toBeVisible();await field.fill('Rascunho fictício preservado');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(field).toHaveValue('Rascunho fictício preservado');await page.waitForTimeout(16000);await expect(field).toHaveValue('Rascunho fictício preservado');
 }
});

test('VIRELOQ: trial real persistido exibe prazo e contratação',async({page})=>{await login(page,'adminb@example.invalid');await page.getByRole('link',{name:/Estúdio Horizonte/}).first().click();await page.getByRole('link',{name:'Plano e assinatura',exact:true}).click();await expect(page.getByText(/dias restantes/).first()).toBeVisible();await expect(page.getByRole('link',{name:'Assinar agora · ver planos'})).toBeVisible();});
