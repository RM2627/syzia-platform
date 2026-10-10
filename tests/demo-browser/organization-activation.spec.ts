import { verifyRegistration } from "../support/verify-registration";
import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
test.setTimeout(60000);
for (const mobile of [false, true])
  test(
    "Criação sem ADM, definição posterior, primeiro login e auditoria " +
      (mobile ? "mobile" : "desktop"),
    async ({ page, browser }) => {
      if (mobile) await page.setViewportSize({ width: 390, height: 844 });
      await demoLogin(page, "root@example.invalid");
      await page.goto("/admin/empresas");
      const suffix = Date.now().toString(),
        name = "Estúdio Ágil " + suffix;
      await page.getByLabel("Nome da empresa", { exact: true }).fill(name);
      await expect(page.getByLabel("Identificador no endereço")).toHaveValue(
        "estudio-agil-" + suffix,
      );
      await page
        .getByLabel("Nome da empresa", { exact: true })
        .fill("Estúdio Novo " + suffix);
      await expect(page.getByLabel("Identificador no endereço")).toHaveValue(
        "estudio-novo-" + suffix,
      );
      await page
        .getByLabel("Identificador no endereço")
        .fill("manual-" + suffix);
      await page.getByLabel("Nome da empresa", { exact: true }).fill(name);
      await expect(page.getByLabel("Identificador no endereço")).toHaveValue(
        "manual-" + suffix,
      );
      await page.getByLabel("Preparar primeiro administrador agora").uncheck();
      await expect(page.getByLabel("E-mail do administrador")).toHaveCount(0);
      const response = page.waitForResponse((r) =>
        r.url().endsWith("/access/create-organization"),
      );
      await page
        .getByRole("button", { name: "Criar empresa", exact: true })
        .click();
      const org = await (await response).json();
      expect(org.company_code).toMatch(/^[A-Z0-9]{1,8}-[A-F0-9]{5}$/);
      await expect(page.getByLabel("Empresa preparada")).toContainText(
        "Aguardando administrador",
      );
      await page.screenshot({
        path:
          "reports/organization-activation/sem-administrador-" +
          (mobile ? "mobile" : "desktop") +
          ".png",
        fullPage: true,
      });
      await page
        .getByLabel("Empresa preparada")
        .getByRole("link", { name: "Definir administrador", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Definir administrador",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .locator("form")
        .filter({
          has: page.getByRole("button", { name: "Criar usuário", exact: true }),
        })
        .getByLabel("Nome", { exact: true })
        .fill("Ana");
      await page.getByLabel("Sobrenome", { exact: true }).fill("Silva");
      await page
        .getByLabel("E-mail do administrador")
        .fill("ana@example.invalid");
      const prepared = page.waitForResponse((r) =>
        r.url().endsWith("/access/provision"),
      );
      await page
        .getByRole("button", { name: "Criar usuário", exact: true })
        .click();
      const data = await (await prepared).json();
      expect(data.delivery).toBe("email_not_configured");
      await expect(page.getByLabel("Instruções de acesso")).toContainText(
        "Administrador criado. Não foi possível enviar as instruções por e-mail.",
      );
      await page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"]);
      await page
        .getByRole("button", { name: "Copiar instruções de acesso" })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Instruções copiadas." }),
      ).toBeVisible();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied).toContain("/entrar");
      expect(copied).toContain(data.company_code);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path:
          "reports/organization-activation/instrucoes-" +
          (mobile ? "mobile" : "desktop") +
          ".png",
        fullPage: true,
      });
      page.once("dialog", (d) => d.accept());
      await page.getByRole("button", { name: "Reenviar instruções" }).click();
      await expect(page.getByRole("alert")).toContainText("Aguarde um minuto");
      await expect(page.getByLabel("Instruções de acesso")).toHaveCount(0);
      const ctx = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1366, height: 900 },
      });
      const customer = await ctx.newPage();
      await customer.goto("/entrar");
      await customer
        .getByLabel("Código da empresa", { exact: true })
        .fill(data.company_code);
      await customer.getByLabel("Usuário", { exact: true }).fill(data.username);
      await customer
        .getByLabel("Senha ou código de primeiro acesso", { exact: true })
        .fill(data.temporary_code);
      await customer
        .getByRole("button", { name: "Entrar", exact: true })
        .click();
      await expect(
        customer.getByRole("heading", { name: "Crie sua senha" }),
      ).toBeVisible();
      await expect(
        customer.getByLabel("Nova senha", { exact: true }),
      ).toHaveValue("");
      await expect(
        customer.getByLabel("Confirmar nova senha", { exact: true }),
      ).toHaveValue("");
      await customer.screenshot({
        path:
          "reports/organization-activation/primeiro-login-" +
          (mobile ? "mobile" : "desktop") +
          ".png",
        fullPage: true,
      });
      await customer
        .getByLabel("Nova senha", { exact: true })
        .fill("FictitiousPassword123!");
      await customer
        .getByLabel("Confirmar nova senha", { exact: true })
        .fill("FictitiousPassword123!");
      await customer
        .getByRole("button", { name: "Confirmar e ativar" })
        .click();
      await expect(
        customer.getByRole("heading", { name: "Antes de começar" }),
      ).toBeVisible();
      await customer.getByLabel("Li e aceito os Termos de Uso").check();
      await customer
        .getByLabel("Li e estou ciente da Política de Privacidade")
        .check();
      await customer
        .getByRole("button", { name: "Continuar", exact: true })
        .click();
      await verifyRegistration(customer);
      await expect(
        customer.getByRole("heading", { name: "Minhas empresas" }),
      ).toBeVisible();
      await expect(
        customer.getByRole("link", { name: "Auditoria", exact: true }),
      ).toHaveCount(0);
      await customer.goto("/admin/auditoria");
      await expect(
        customer.getByRole("heading", { name: "Acesso restrito" }),
      ).toBeVisible();
      await ctx.close();
    },
  );
test("Exclusão exige nome exato; desativação e reativação permanecem disponíveis", async ({
  page,
}) => {
  await demoLogin(page, "root@example.invalid");
  await page.goto("/admin/empresas");
  const name = "Empresa Vazia " + Date.now();
  await page.getByLabel("Nome da empresa", { exact: true }).fill(name);
  await page.getByLabel("Preparar primeiro administrador agora").uncheck();
  await page
    .getByRole("button", { name: "Criar empresa", exact: true })
    .click();
  const row = page.locator("article.organization-record").filter({
    has: page.getByRole("heading", { name, exact: true, level: 3 }),
  });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Desativar", exact: true }).click();
  await expect(
    row.getByRole("button", { name: "Reativar", exact: true }),
  ).toBeVisible();
  await row.getByRole("link", { name: "Abrir empresa", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Empresa indisponível",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await page.goto("/admin/empresas");
  await row.getByRole("button", { name: "Reativar", exact: true }).click();
  await expect(
    row.getByRole("button", { name: "Desativar", exact: true }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Excluir empresa" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", {
      name: "Excluir permanentemente",
      exact: true,
    }),
  ).toBeDisabled();
  await dialog.getByRole("textbox").fill(name);
  await dialog
    .getByRole("button", { name: "Excluir permanentemente", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "registro de auditoria foi preservado",
  );
});
test("Erro de slug não reutiliza mensagem de sucesso nem cria outra empresa", async ({
  page,
}) => {
  await demoLogin(page, "root@example.invalid");
  await page.goto("/admin/empresas");
  await page
    .getByLabel("Nome da empresa", { exact: true })
    .fill("Empresa Duplicada");
  await page.getByLabel("Identificador no endereço").fill("ms-auto-ficticia");
  await page.getByLabel("Preparar primeiro administrador agora").uncheck();
  await page
    .getByRole("button", { name: "Criar empresa", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "endereço público já está em uso",
  );
  await expect(page.getByLabel("Empresa preparada")).toHaveCount(0);
});
