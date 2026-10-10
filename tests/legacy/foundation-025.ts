import { test, expect, type Page } from "@playwright/test";
const uid = "00000000-0000-0000-0000-000000000001",
  org = "10000000-0000-0000-0000-000000000001";
const profile = { id: uid, display_name: "Marcelo — teste", status: "active" };
const organization = {
  id: org,
  name: "Empresa de teste",
  slug: "empresa-teste",
  status: "active",
};
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "teste@example.invalid",
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: new Date().toISOString(),
};
function token() {
  return [
    "header",
    btoa(
      JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 }),
    ),
    "signature",
  ].join(".");
}
async function mock(page: Page, admin = false) {
  const calls: { path: string; body: any }[] = [];
  const state = {
    suspended: false,
    denyWrite: false,
    organizations: [organization],
  };
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    const body = request.postDataJSON();
    calls.push({ path, body });
    let data: any = {};
    let status = 200;
    if (path === "/auth/v1/token")
      data = {
        access_token: token(),
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "fake-local-test",
        user,
      };
    else if (path === "/auth/v1/user") data = user;
    else if (path === "/auth/v1/signup") data = { user, session: null };
    else if (path === "/rest/v1/rpc/foundation_context") {
      if (state.suspended) {
        data = { code: "42501", message: "access_denied" };
        status = 403;
      } else
        data = {
          profile,
          roles: admin ? ["super_admin"] : [],
          organizations: state.organizations,
          memberships: admin
            ? []
            : [
                {
                  organization_id: org,
                  user_id: uid,
                  role: "admin_empresa",
                  status: "active",
                },
              ],
        };
    } else if (path === "/rest/v1/profiles")
      data = [
        profile,
        {
          id: "00000000-0000-0000-0000-000000000002",
          display_name: "Ranna — teste",
          status: "active",
        },
      ];
    else if (path === "/rest/v1/platform_roles")
      data = admin ? [{ user_id: uid, role: "super_admin", active: true }] : [];
    else if (path === "/rest/v1/organization_members")
      data = [
        {
          organization_id: org,
          user_id: uid,
          role: "admin_empresa",
          status: "active",
        },
      ];
    else if (
      path === "/rest/v1/organization_invitations" ||
      path === "/rest/v1/attendant_organizations" ||
      path === "/rest/v1/audit_logs"
    )
      data = [];
    else if (path.startsWith("/rest/v1/rpc/")) {
      if (state.denyWrite) {
        data = { code: "42501", message: "access_denied" };
        status = 403;
      } else data = null;
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  return { calls, state };
}
async function login(page: Page) {
  await page.goto("/entrar");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("teste@example.invalid");
  await page.getByLabel("Senha", { exact: true }).fill("TestPassword123!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Minhas empresas" }),
  ).toBeVisible();
}
test("Visitante é enviado ao login antes da administração", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/admin/equipe");
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(
    page.getByRole("heading", { name: "Entre na VIRELOQ" }),
  ).toBeVisible();
});
test("Login, empresa autorizada e logout", async ({ page }) => {
  await mock(page);
  await login(page);
  await page.getByRole("link", { name: /Empresa de teste/ }).click();
  await expect(
    page.getByRole("heading", { name: "Empresa de teste", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByText("Membros da empresa")).toHaveCount(0);
});
test("Administrador empresarial não abre área global por URL", async ({
  page,
}) => {
  const { calls } = await mock(page);
  await login(page);
  await page.goto("/admin/equipe");
  await expect(
    page.getByRole("heading", { name: "Acesso restrito" }),
  ).toBeVisible();
  expect(calls.some((x) => x.path === "/rest/v1/platform_roles")).toBe(false);
});
test("Troca de organização por URL não mostra seus dados", async ({ page }) => {
  await mock(page);
  await login(page);
  await page.goto("/painel/10000000-0000-0000-0000-000000000002");
  await expect(
    page.getByRole("heading", { name: "Empresa indisponível" }),
  ).toBeVisible();
  await expect(page.getByText("Membros da empresa")).toHaveCount(0);
});
test("Superadmin cria empresa através do RPC autorizado", async ({ page }) => {
  const { calls } = await mock(page, true);
  await login(page);
  await page.getByRole("link", { name: "Empresas", exact: true }).click();
  await page.getByLabel("Nome da empresa").fill("Nova empresa");
  await page.getByLabel("Identificador no endereço").fill("nova-empresa");
  await page.getByLabel("Convidar o primeiro administrador por e-mail").uncheck();
  await page.getByLabel("Administrador inicial").selectOption(uid);
  await page.getByRole("button", { name: "Criar empresa" }).click();
  await expect(page.getByText("Alteração salva.")).toBeVisible();
  expect(
    calls.find((x) => x.path.endsWith("foundation_create_organization"))?.body,
  ).toEqual({ p_name: "Nova empresa", p_slug: "nova-empresa", p_admin: uid });
});
test("Resposta de permissão negada nunca vira confirmação de sucesso", async ({
  page,
}) => {
  const { state } = await mock(page, true);
  await login(page);
  await page.getByRole("link", { name: "Meu perfil" }).click();
  await page.getByLabel("Seu nome").fill("Nome alterado");
  state.denyWrite = true;
  await page.getByRole("button", { name: "Salvar nome" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Alteração salva.")).toHaveCount(0);
});
test("Suspensão remove painel após revalidação de acesso", async ({ page }) => {
  const { state } = await mock(page, true);
  await login(page);
  await page.getByRole("link", { name: "Pessoas e papéis" }).click();
  await expect(page.getByText("Contas cadastradas")).toBeVisible();
  state.suspended = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "Acesso indisponível" }),
  ).toBeVisible();
  await expect(page.getByText("Contas cadastradas")).toHaveCount(0);
});
test("Recuperação mantém resposta sem enumerar contas", async ({ page }) => {
  const { calls } = await mock(page);
  await page.goto("/recuperar-acesso");
  await page.getByLabel("E-mail").fill("teste@example.invalid");
  await page.getByRole("button", { name: "Enviar instruções" }).click();
  await expect(
    page.getByText(
      "Se houver uma conta elegível, você receberá as instruções por e-mail.",
    ),
  ).toBeVisible();
  expect(calls.some((x) => x.path === "/auth/v1/recover")).toBe(true);
});
test("Entrada administrativa não oferece autocadastro", async ({page}) => {
 const {calls}=await mock(page);await page.goto("/entrar");
 await expect(page.getByRole("heading",{name:"Entre na VIRELOQ"})).toBeVisible();
 await expect(page.getByRole("button",{name:/Criar|Ainda não tenho/})).toHaveCount(0);
 expect(calls.some(x=>x.path.includes("signup"))).toBe(false);
});
test("Senha nova exige link válido", async ({ page }) => {
  await mock(page);
  await page.goto("/atualizar-senha");
  await expect(page.getByText(/Este link expirou/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar senha" })).toHaveCount(
    0,
  );
});
test("Painel funciona em tela de celular sem transbordamento", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, true);
  await login(page);
  await page.getByRole("button", { name: "Menu ☰", exact: true }).click();
  await page.getByRole("link", { name: "Pessoas e papéis" }).click();
  await expect(
    page.getByRole("heading", { name: "Pessoas e papéis" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "reports/foundation-mobile.png",
    fullPage: true,
  });
});
test("Administração desktop sem erros de renderização", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mock(page, true);
  await page.setViewportSize({ width: 1360, height: 900 });
  await login(page);
  await page.getByRole("link", { name: "Empresas", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nova empresa" }),
  ).toBeVisible();
  await page.screenshot({
    path: "reports/foundation-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("Rascunho sobrevive a foco, 15s e renovação da mesma sessão; revogação continua efetiva",async({page})=>{
 const {state}=await mock(page,true);await login(page);await page.getByRole("link",{name:"Meu perfil"}).click();
 const field=page.getByLabel("Seu nome");await field.fill("Rascunho não salvo");
 await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(field).toHaveValue("Rascunho não salvo");
 await page.clock.install();await page.clock.fastForward(16000);await expect(field).toHaveValue("Rascunho não salvo");
 await page.evaluate(async()=>{const m=await (new Function('return import("/src/api.ts")'))();await m.supabase.auth.refreshSession();});
 await expect(field).toHaveValue("Rascunho não salvo");
 state.suspended=true;await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(page.getByRole("heading",{name:"Acesso indisponível"})).toBeVisible();await expect(field).toHaveCount(0);
});


test("Cadastro básico preserva rascunho e sinaliza alteração externa da empresa", async ({ page }) => {
  const { state, calls } = await mock(page, true);
  await login(page);
  await page.goto("/painel/" + org + "/acessos");
  const form = page.locator("section").filter({ has: page.getByRole("heading", { name: "Cadastro básico", exact: true }) });
  await form.getByLabel("Nome", { exact: true }).fill("Nome ainda não salvo");
  state.organizations = [{ ...organization, name: "Nome atualizado externamente" }];
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(form.getByText("Há uma atualização mais recente.")).toBeVisible();
  await expect(form.getByLabel("Nome", { exact: true })).toHaveValue("Nome ainda não salvo");
  await expect(form.getByRole("button", { name: "Salvar empresa", exact: true })).toBeDisabled();
  expect(calls.some(x => x.path.endsWith("foundation_update_organization"))).toBe(false);
  page.once("dialog", dialog => dialog.accept());
  await form.getByRole("button", { name: "Descartar rascunho e carregar atualização" }).click();
  await expect(form.getByLabel("Nome", { exact: true })).toHaveValue("Nome atualizado externamente");
  await expect(form.getByRole("button", { name: "Salvar empresa", exact: true })).toBeEnabled();
});
