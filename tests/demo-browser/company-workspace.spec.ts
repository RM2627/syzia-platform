import { verifyRegistration } from "../support/verify-registration";
import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
test.setTimeout(120000);
for (const [device, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
] as const) {
  test(
    "A–F/H: abrir empresa sem ADM, pendente e ativo; ações separadas " + device,
    async ({ page, browser }) => {
      await page.setViewportSize({ width, height });
      await demoLogin(page, "root@example.invalid");
      await page.goto("/admin/empresas");
      const name = "Navegação " + device + " " + Date.now();
      await page.getByLabel("Nome da empresa", { exact: true }).fill(name);
      await page.getByLabel("Preparar primeiro administrador agora").uncheck();
      const response = page.waitForResponse((r) =>
        r.url().endsWith("/access/create-organization"),
      );
      await page
        .getByRole("button", { name: "Criar empresa", exact: true })
        .click();
      const org = await (await response).json();
      const base = "/painel/" + org.organization_id;
      const record = page
        .locator("article.organization-record")
        .filter({ has: page.getByRole("heading", { name, exact: true }) });
      await expect(
        record.getByRole("link", { name: "Abrir empresa", exact: true }),
      ).toHaveAttribute("href", base);
      await expect(
        record.getByRole("link", {
          name: "Definir administrador",
          exact: true,
        }),
      ).toHaveAttribute("href", base + "/acessos");
      await page
        .getByLabel("Empresa preparada")
        .getByRole("link", { name: "Abrir empresa", exact: true })
        .click();
      async function workspace() {
        await expect(page).toHaveURL(new RegExp(base + "$"));
        await expect(
          page.getByRole("heading", {
            name: "Vamos preparar sua empresa",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", {
            name: "O que precisa ser feito hoje?",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", {
            name: "Definir administrador",
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: "Pessoas e acessos", exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByLabel("Contexto da administração"),
        ).toContainText(name);
        await expect(
          page.getByLabel("Contexto da administração"),
        ).toContainText("Super Admin");
        await expect(page.getByRole("alert")).toHaveCount(0);
      }
      await workspace();
      await page.screenshot({
        path: "reports/company-workspace/sem-adm-" + device + ".png",
        fullPage: true,
      });
      await page.getByRole("link", { name: /Dados da empresa/ }).click();
      await page
        .getByRole("button", { name: "Iniciar configuração", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Informações e funcionamento",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .locator("textarea[name=description]")
        .fill("Configuração preservada pelo Super Admin.");
      await page
        .getByRole("button", { name: "Salvar configuração", exact: true })
        .click();
      await expect(
        page.getByText("Alteração salva.", { exact: true }),
      ).toBeVisible();
      await page
        .getByLabel("Contexto da administração")
        .getByRole("link", { name: "Minhas empresas", exact: true })
        .click();
      await page
        .getByRole("link")
        .filter({ has: page.getByRole("heading", { name, exact: true }) })
        .click();
      await workspace();
      await page.getByRole("link", { name: /Dados da empresa/ }).click();
      await expect(page.locator("textarea[name=description]")).toHaveValue(
        "Configuração preservada pelo Super Admin.",
      );
      await page
        .getByRole("link", {
          name: "Voltar à Administração VIRELOQ",
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(/\/admin\/empresas$/);
      await record
        .getByRole("link", { name: "Definir administrador", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Definir administrador",
          exact: true,
        }),
      ).toBeVisible();
      const form = page.locator("form").filter({
        has: page.getByRole("button", { name: "Criar usuário", exact: true }),
      });
      await form.getByLabel("Nome", { exact: true }).fill("Ana");
      await form.getByLabel("Sobrenome", { exact: true }).fill("Teste");
      await form
        .getByLabel("E-mail do administrador")
        .fill("ana@example.invalid");
      const prepared = page.waitForResponse((r) =>
        r.url().endsWith("/access/provision"),
      );
      await form
        .getByRole("button", { name: "Criar usuário", exact: true })
        .click();
      const data = await (await prepared).json();
      expect(data.temporary_code).toBeTruthy();
      await page
        .getByLabel("Instruções de acesso")
        .getByRole("link", { name: "Abrir empresa", exact: true })
        .click();
      await workspace(); // Pending activation never redirects to user management.
      await page
        .getByRole("navigation", { name: "Navegação da empresa" })
        .getByRole("link", { name: "Pessoas e acessos", exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(base + "/acessos$"));
      await expect(
        page.getByRole("heading", { name: "Pessoas e acessos", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Novo usuário", exact: true }),
      ).toBeVisible();
      const ctx = await browser.newContext();
      const admin = await ctx.newPage();
      await admin.goto("/entrar");
      await admin
        .getByLabel("Código da empresa", { exact: true })
        .fill(data.company_code);
      await admin.getByLabel("Usuário", { exact: true }).fill(data.username);
      await admin
        .getByLabel("Senha ou código de primeiro acesso", { exact: true })
        .fill(data.temporary_code);
      await admin.getByRole("button", { name: "Entrar", exact: true }).click();
      await admin
        .getByLabel("Nova senha", { exact: true })
        .fill("FictitiousPassword123!");
      await admin
        .getByLabel("Confirmar nova senha", { exact: true })
        .fill("FictitiousPassword123!");
      await admin
        .getByRole("button", { name: "Confirmar e ativar", exact: true })
        .click();
      await admin.getByLabel("Li e aceito os Termos de Uso").check();
      await admin
        .getByLabel("Li e estou ciente da Política de Privacidade")
        .check();
      await admin
        .getByRole("button", { name: "Continuar", exact: true })
        .click();
      await verifyRegistration(admin);
      await expect(
        admin.getByRole("heading", { name: "Minhas empresas", exact: true }),
      ).toBeVisible();
      await page.goto("/");
      await page
        .getByRole("link")
        .filter({ has: page.getByRole("heading", { name, exact: true }) })
        .click();
      await expect(
        page.getByRole("heading", { name: "Suporte VIRELOQ", exact: true }),
      ).toBeVisible();
      await page
        .getByLabel("Motivo do acesso")
        .fill("Conferir configuração com autorização da empresa");
      await page
        .getByRole("button", { name: "Solicitar autorização ao ADM" })
        .click();
      await admin.goto(base + "/suporte");
      await admin.getByRole("button", { name: "Autorizar por 1h" }).click();
      await workspace();
      await admin.getByRole("button", { name: "Revogar acesso" }).click();
      await expect(
        page.getByRole("heading", { name: "Suporte VIRELOQ", exact: true }),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        page.getByRole("heading", {
          name: "O que precisa ser feito hoje?",
          exact: true,
        }),
      ).toHaveCount(0);
      await ctx.close();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: "reports/company-workspace/adm-ativo-" + device + ".png",
        fullPage: true,
      });
    },
  );
  test(
    "G/H: empresa configurada abre painel normal e mantém módulos " + device,
    async ({ page, browser }) => {
      await page.setViewportSize({ width, height });
      await demoLogin(page, "root@example.invalid");
      await page
        .getByRole("link", { name: /MS Auto Details/ })
        .first()
        .click();
      const base = new URL(page.url()).pathname;
      await page
        .getByLabel("Motivo do acesso")
        .fill("Validar painel configurado com autorização do ADM");
      await page
        .getByRole("button", { name: "Solicitar autorização ao ADM" })
        .click();
      const admContext = await browser.newContext();
      const adm = await admContext.newPage();
      await demoLogin(adm);
      await adm.goto(base + "/suporte");
      await adm.getByRole("button", { name: "Autorizar por 1h" }).click();
      await expect(
        page.getByRole("heading", {
          name: "O que precisa ser feito hoje?",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: "Vamos preparar sua empresa",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", {
          name: "Revisar checklist de configuração",
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({
        path: "reports/company-workspace/painel-" + device + ".png",
        fullPage: true,
      });
      for (const [route, heading] of [
        ["agenda", "Agenda"],
        ["pagina", "Página da empresa"],
        ["configuracao", "Informações e funcionamento"],
      ]) {
        await page.goto(base + "/" + route);
        await expect(
          page.getByRole("heading", { name: heading, exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("alert")).toHaveCount(0);
      }
      await page
        .getByRole("link", {
          name: "Voltar à Administração VIRELOQ",
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(/\/admin\/empresas$/);
      await adm.getByRole("button", { name: "Revogar acesso" }).click();
      await expect(
        adm.getByRole("button", { name: "Revogar acesso" }),
      ).toHaveCount(0);
      await admContext.close();
    },
  );
}
test("I: usuário empresarial não acessa empresa alheia ou administração global", async ({
  page,
}) => {
  await demoLogin(page, "root@example.invalid");
  const foreign = await page
    .getByRole("link", { name: /Estúdio Horizonte/ })
    .first()
    .getAttribute("href");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await demoLogin(page, "admin@example.invalid");
  await page.goto(foreign!);
  await expect(
    page.getByRole("heading", { name: "Empresa indisponível", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Contexto da administração")).toHaveCount(0);
  await page.goto("/admin/empresas");
  await expect(
    page.getByRole("heading", { name: "Acesso restrito", exact: true }),
  ).toBeVisible();
});
