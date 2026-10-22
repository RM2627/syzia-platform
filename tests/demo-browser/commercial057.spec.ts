import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
test('057 browser: existing/new recipient, login return, no manual review, plan and official checkout entry',async({page,browser})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/entrar');await page.getByLabel('E-mail ou usuário',{exact:true}).fill('root@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('FictitiousPassword123!');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL(/\/admin/);
 const urls=await page.evaluate(async()=>{
  const {rpc}=await import('/src/api.ts');const {commercialApi}=await import('/src/platform-commercial/api.ts');
  const ctx:any=await rpc('commercial_management'),demo=ctx.demos[0],result:string[]=[];
  for(const email of ['admin@example.invalid','lia.057@example.invalid']){
   const lead:any=await rpc('commercial_contact_save',{p_id:null,p_revision:0,p_key:crypto.randomUUID(),p_data:{name:'Aurora Interiores',email,stage:'wants_trial'}});
   // Explicit consent fixture; never used by runtime or an external sender.
   await rpc('commercial_contact_authorize',{p_id:lead.id,p_purpose:'activation',p_authorized:true,p_notice:'local-test',p_evidence:'Autorização fictícia somente para este teste local.',p_expires:new Date(Date.now()+86400000).toISOString()});
   await rpc('commercial_demo_link',{p_demo:demo.id,p_lead:lead.id});
   result.push((await commercialApi('invite',{id:demo.id,lead_id:lead.id,purpose:'activation'})).url);
  }return result;
 });
 const context=await browser.newContext(),visitor=await context.newPage();visitor.on('pageerror',e=>errors.push(e.message));
 await visitor.goto(urls[0]);await expect(visitor.getByRole('heading',{name:'Identifique-se para continuar'})).toBeVisible();
 await visitor.getByRole('link',{name:'Já tenho conta · Entrar'}).click();
 await visitor.getByLabel('E-mail ou usuário',{exact:true}).fill('admin@example.invalid');await visitor.getByLabel('Senha',{exact:true}).fill('FictitiousPassword123!');await visitor.getByRole('button',{name:'Entrar',exact:true}).click();
 await visitor.waitForURL(/\/ativar-empresa$/);await expect(visitor.getByRole('heading',{name:'Convite verificado'})).toBeVisible();
 await expect(visitor.locator('textarea')).toHaveCount(0);await visitor.reload();await expect(visitor.getByRole('heading',{name:'Convite verificado'})).toBeVisible();
 await mkdir('reports/syzia-057/ui',{recursive:true});
 for(const width of [1440,390,360]){await visitor.setViewportSize({width,height:900});expect(await visitor.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await visitor.screenshot({path:`reports/syzia-057/ui/activation-${width}.png`,fullPage:true});}
 const review=visitor.getByRole('checkbox',{name:'Revisei e aprovo a configuração preparada para minha empresa.'});await review.focus();await visitor.keyboard.press('Space');
 await visitor.getByRole('button',{name:'Escolher plano e continuar pelo cadastro oficial'}).click();
 await expect(visitor.getByRole('heading',{name:'Empresa e plano'})).toBeVisible();await expect(visitor.getByLabel('Nome da empresa',{exact:true})).toHaveValue('Ateliê Aurora');
 await visitor.getByLabel(/^Endereço da página/).fill('aurora-convite-057');await visitor.getByLabel('Documento',{exact:true}).fill('52998224725');
 const plan=visitor.getByRole('combobox',{name:/^Plano/});const option=await plan.locator('option').filter({hasText:'Profissional'}).getAttribute('value');await plan.selectOption(option!);await visitor.getByRole('button',{name:'Salvar e continuar',exact:true}).click();
 await expect(visitor.getByRole('heading',{name:'Confirme as condições'})).toBeVisible();
 await visitor.getByRole('checkbox',{name:/Confirmo os dados da empresa/}).check();await visitor.getByRole('button',{name:'Preparar empresa e vincular meio de pagamento'}).click();
 await expect(visitor.getByRole('heading',{name:'Empresa preparada.'})).toBeVisible();await visitor.getByRole('button',{name:'Abrir configuração da empresa'}).click();
 await visitor.waitForURL(/\/painel\/[^/]+\/assinatura/);
 await expect(visitor.getByRole('heading',{name:'Antes de começar'})).toBeVisible();
 await visitor.getByRole('checkbox',{name:'Li e aceito os Termos de Uso'}).check();await visitor.getByRole('checkbox',{name:'Li e estou ciente da Política de Privacidade'}).check();await visitor.getByRole('button',{name:'Continuar',exact:true}).click();
 await expect(visitor.getByText(/7 dias grátis/).first()).toBeVisible();
 // Browser return alone grants no software access; billing is tested with the real engine in SQL suite.
 const state=await visitor.evaluate(async()=>{const {rpc}=await import('/src/api.ts');return rpc<any>('billing_capabilities',{p_org:location.pathname.split('/')[2]});});expect(state.software).toBe(false);
 await context.close();
 const fresh=await browser.newContext(),newUser=await fresh.newPage();newUser.on('pageerror',e=>errors.push(e.message));
 await newUser.goto(urls[1]);await newUser.getByRole('button',{name:'Criar identidade pela SYZIA'}).click();
 await newUser.getByLabel('Nome completo',{exact:true}).fill('Lia Costa');await newUser.getByLabel('E-mail',{exact:true}).fill('lia.057@example.invalid');
 await newUser.getByLabel('Sua senha',{exact:true}).fill('FictitiousPassword123!');await newUser.getByLabel(/Confirmar senha|Confirme a senha/).fill('FictitiousPassword123!');
 await newUser.getByRole('button',{name:/Criar identidade|Criar minha identidade|Criar conta/}).click();
 await expect(newUser.getByRole('heading',{name:'Identidade preparada'})).toBeVisible();
 await newUser.getByRole('button',{name:'Voltar ao convite de ativação'}).click();await expect(newUser.getByRole('heading',{name:'Convite verificado'})).toBeVisible();
 await fresh.close();expect(errors).toEqual([]);
});
