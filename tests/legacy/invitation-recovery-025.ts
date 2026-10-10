import { test, expect, type Page } from "@playwright/test";
const org = '20000000-0000-0000-0000-000000000001', id = '20000000-0000-0000-0000-000000000020';
const root = '10000000-0000-0000-0000-000000000001', recipient = '10000000-0000-0000-0000-000000000002';
const user = (uid: string) => ({ id: uid, aud: 'authenticated', role: 'authenticated', email: uid === root ? 'admin@example.invalid' : 'recipient@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', is_anonymous: false, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
const token = (uid: string) => Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: uid, exp: expiresAt })).toString('base64url') + '.' + Buffer.from('fictitious-signature').toString('base64url');
const session = (uid: string) => ({ access_token: token(uid), refresh_token: 'fictitious-refresh', expires_in: 3600, token_type: 'bearer', user: user(uid) });
async function fixture(page: Page) {
  const state = { otpError: false, sendError: '', deliveries: 0, updates: 0, accepts: 0, record: { id, name: 'Destinatária fictícia', email: 'recipient@example.invalid', role: 'colaborador_empresa', state: 'pending', delivery_state: 'sent', expires_at: '2099-01-01T00:00:00Z' } };
  await page.route('http://127.0.0.1:54321/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const auth = req.headers().authorization || '';
    const uid = auth.includes(token(recipient)) ? recipient : root;
    let data: any = {}, status = 200;
    if (path === '/auth/v1/token') data = session(new URL(req.url()).searchParams.get('grant_type') === 'pkce' ? recipient : root);
    else if (path === '/auth/v1/user') { if (req.method() === 'PUT') state.updates++; data = user(uid); }
    else if (path === '/auth/v1/verify') { if (state.otpError) { status = 403; data = { code: 'otp_expired', message: 'fictitious consumed proof' }; } else data = session(recipient); }
    else if (path === '/rest/v1/rpc/foundation_context') data = { profile: { id: uid, display_name: 'Conta fictícia', status: 'active' }, roles: uid === root ? ['super_admin'] : [], organizations: [{ id: org, name: 'Empresa fictícia', slug: 'empresa-ficticia', status: 'active' }], memberships: uid === recipient ? [{ organization_id: org, user_id: uid, role: 'colaborador_empresa', status: 'active' }] : [] };
    else if (path === '/rest/v1/rpc/foundation_accept_invitation') { expect(req.postDataJSON()).toEqual({ p_invite: id }); expect(uid).toBe(recipient); state.accepts++; data = org; }
    else if (path === '/rest/v1/organization_invitations') data = [state.record];
    else if (path === '/invitations/send') { expect(req.postDataJSON()).toEqual({ invitation_id: id }); state.deliveries++; if (state.sendError) { status = state.sendError.includes('limit') || state.sendError === 'invitation_cooldown' ? 429 : 502; data = { error: state.sendError, raw: 'SECRET_PROVIDER_PAYLOAD' }; if (state.sendError !== 'invitation_cooldown') state.record.delivery_state = 'failed'; } else { state.record.delivery_state = 'sent'; data = { sent: true }; } }
    else if (path.startsWith('/rest/v1/') && !path.includes('/rpc/')) data = [];
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return state;
}
async function login(page: Page) { await page.goto('/entrar'); await page.getByLabel('E-mail', { exact: true }).fill('admin@example.invalid'); await page.getByLabel('Senha', { exact: true }).fill('FictitiousPassword123!'); await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Minhas empresas' })).toBeVisible(); }
for (const where of ['query', 'fragment']) test('Erro otp_expired no '+where+' bloqueia senha mesmo com sessão antiga', async ({ page }) => {
  const state = await fixture(page); await login(page);
  await page.goto('/aceitar-convite?convite='+id+(where === 'query' ? '&' : '#')+'error=access_denied&error_code=otp_expired&error_description=PRIVATE_PROVIDER_TEXT');
  await expect(page.getByText('Este link expirou ou não é mais válido. Solicite novas instruções.')).toBeVisible();
  await expect(page.getByLabel('Nova senha (mínimo 12 caracteres)')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Salvar senha' })).toHaveCount(0);
  expect(state.updates).toBe(0); expect(state.accepts).toBe(0); expect(await page.locator('body').innerText()).not.toContain('PRIVATE_PROVIDER_TEXT');
});
test('Token consumido/inválido não reutiliza sessão anterior', async ({ page }) => { const state = await fixture(page); await login(page); state.otpError = true; await page.goto('/aceitar-convite?convite='+id+'#token_hash=consumed&type=invite'); await page.getByRole('button', { name: 'Continuar com este convite ou recuperação' }).click(); await expect(page.getByRole('heading', { name: 'Link indisponível' })).toBeVisible(); await expect(page.getByLabel('Nova senha (mínimo 12 caracteres)')).toHaveCount(0); expect(state.updates).toBe(0); expect(state.accepts).toBe(0); });
test('UUID e sessão existente sem prova de link não abrem formulário', async ({ page }) => { const state = await fixture(page); await login(page); await page.goto('/aceitar-convite?convite='+id); await expect(page.getByRole('heading', { name: 'Link indisponível' })).toBeVisible(); expect(state.updates).toBe(0); });
for (const kind of ['invite', 'recovery', 'implicit']) test('Primeiro acesso com '+kind+' verifica conta antes de senha e aceite', async ({ page }) => {
  const state = await fixture(page);
  const hash = kind === 'implicit' ? 'access_token='+token(recipient)+'&refresh_token=fictitious-refresh&type=recovery&expires_in=3600&token_type=bearer' : 'token_hash=fictitious-proof&type='+kind;
  await page.goto('/aceitar-convite?convite='+id+'#'+hash);
  await page.getByRole('button', { name: 'Continuar com este convite ou recuperação' }).click();
  await page.getByLabel('Nova senha (mínimo 12 caracteres)').fill('NewFictitiousPassword123!'); await page.getByLabel('Confirmar senha').fill('NewFictitiousPassword123!'); await page.getByRole('button', { name: 'Salvar senha' }).click();
  await expect(page).toHaveURL(new RegExp('/painel/'+org)); expect(state.updates).toBe(1); expect(state.accepts).toBe(1); expect(page.url()).not.toContain('token');
});
for (const [code, message] of [
  ['invitation_rate_limited', 'O serviço de autenticação limitou os envios.'],
  ['email_delivery_failed', 'O serviço não conseguiu enviar o convite.'],
  ['recovery_delivery_failed', 'Não foi possível enviar as novas instruções de acesso.'],
  ['invitation_cooldown', 'Aguarde pelo menos um minuto'],
  ['SECRET_PROVIDER_PAYLOAD', 'Não foi possível confirmar o envio por uma falha temporária.'],
]) test('Reenvio limpa sucesso anterior e atualiza situação: '+code, async ({ page }) => {
  const state = await fixture(page); await login(page); await page.goto('/painel/'+org+'/acessos');
  await page.getByRole('button', { name: 'Reenviar instruções' }).click();
  await expect(page.getByText('Instruções solicitadas ao serviço de e-mail. Peça à pessoa que use a mensagem mais recente.')).toBeVisible();
  state.sendError = code; await page.getByRole('button', { name: 'Reenviar instruções' }).click();
  await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
  await expect(page.getByText('Instruções solicitadas ao serviço de e-mail. Peça à pessoa que use a mensagem mais recente.')).toHaveCount(0);
  await expect(page.getByText(/Pendente · Tentativa atual não concluída/)).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('SECRET_PROVIDER_PAYLOAD'); expect(state.deliveries).toBe(2);
  if (code !== 'invitation_cooldown') { await page.reload(); await expect(page.getByText(/Última tentativa de envio falhou/)).toBeVisible(); }
  else await expect(page.getByText(/Houve um envio anterior; o reenvio atual não foi confirmado/)).toBeVisible();
});
for (const expired of [true, false]) test('Convite '+(expired?'expirado':'revogado')+' não oferece reenvio', async ({ page }) => { const state = await fixture(page); if (expired) state.record.expires_at='2020-01-01T00:00:00Z'; else state.record.state='revoked'; await login(page); await page.goto('/painel/'+org+'/acessos'); await expect(page.getByText('Destinatária fictícia')).toBeVisible(); await expect(page.getByRole('button',{name:'Reenviar instruções'})).toHaveCount(0); expect(state.deliveries).toBe(0); });


test('Recuperação PKCE verifica o código antes de mostrar senha', async ({page}) => {
 const state=await fixture(page);await login(page);
 await page.evaluate(async()=>{const m=await (new Function('return import("/src/api.ts")'))();localStorage.setItem(m.supabase.auth.storageKey+'-code-verifier',JSON.stringify('fictitious-verifier/PASSWORD_RECOVERY'));});
 await page.goto('/atualizar-senha?code=fictitious-code');await page.getByRole('button',{name:'Continuar com este convite ou recuperação'}).click();
 await expect(page.getByLabel('Nova senha (mínimo 12 caracteres)')).toBeVisible();expect(state.updates).toBe(0);expect(state.accepts).toBe(0);
});
test('Código PKCE sem verificador não aproveita sessão antiga', async ({page}) => {
 const state=await fixture(page);await login(page);await page.goto('/atualizar-senha?code=unusable-code');await page.getByRole('button',{name:'Continuar com este convite ou recuperação'}).click();
 await expect(page.getByRole('heading',{name:'Link indisponível'})).toBeVisible();await expect(page.getByLabel('Nova senha (mínimo 12 caracteres)')).toHaveCount(0);expect(state.updates).toBe(0);
});
