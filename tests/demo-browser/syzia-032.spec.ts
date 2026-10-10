import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
async function rpc(page: any, name: string, args: any = {}) {
  return page.evaluate(
    async ({ name, args }: any) => {
      const api = await import("/src/api.ts");
      return api.rpc(name, args);
    },
    { name, args },
  );
}
async function fit(page: any) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
}
test("Desktop: personal identity, company without ADM, existing onboarding, agenda and repeated validation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await demoLogin(page, "root@example.invalid");
  await page.goto("/admin/equipe");
  await page.getByRole("button", { name: "Nova pessoa", exact: true }).click();
  await page
    .getByLabel("Nome completo", { exact: true })
    .fill("Pessoa Fictícia SYZIA");
  await page.getByLabel("Username", { exact: true }).fill("pessoa.syzia");
  await page
    .getByLabel("E-mail de contato", { exact: true })
    .fill("pessoa@example.invalid");
  await page.getByLabel("Tipo inicial").selectOption("admin_empresa");
  await page.getByRole("button", { name: "Criar pessoa", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Acesso preparado" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar instruções" }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "Pessoa Fictícia SYZIA" })
    .getByRole("button", { name: "Abrir ficha" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pessoa Fictícia SYZIA", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Buscar pessoa").fill("Pessoa Fictícia SYZIA");
  await fit(page);
  await page.screenshot({
    path: "reports/syzia-032/people-desktop.png",
    fullPage: true,
  });
  const org: any = await rpc(page, "access_create_organization", {
    p_name: "Organização Fictícia SYZIA",
    p_slug: "organizacao-ficticia-syzia",
    p_key: crypto.randomUUID(),
  });
  await rpc(page, "company_initialize", { p_org: org.organization_id });
  await page.goto("/painel/" + org.organization_id);
  await expect(
    page
      .getByRole("heading", {
        name: /Vamos preparar|Configuração inicial|Comece|organização/i,
      })
      .first(),
  )
    .toBeVisible()
    .catch(async () => {
      await expect(
        page.getByText("AMBIENTE DA EMPRESA", { exact: true }),
      ).toBeVisible();
    });
  await page.goto("/painel/" + org.organization_id + "/consumidor");
  await expect(
    page.getByRole("heading", { name: "Configurar agenda online" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Salvar regras da agenda" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Operação concluída" }),
  ).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(11000);
    await expect(
      page.getByRole("heading", { name: "Configurar agenda online" }),
    ).toBeVisible();
    await expect(
      page.getByText("Esta operação não foi autorizada.", { exact: false }),
    ).toHaveCount(0);
  }
  await page.screenshot({
    path: "reports/syzia-032/schedule-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: /Voltar à Administração|Administração SYZIA/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: /Empresas|Minhas empresas/ }).first(),
  ).toBeVisible();
});
test("Mobile: SYZIA login, company identity light/dark preview and agenda", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/entrar");
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "SYZIA", exact: true }),
  ).toBeVisible();
  await fit(page);
  await page.screenshot({
    path: "reports/syzia-032/login-mobile.png",
    fullPage: true,
  });
  await demoLogin(page);
  await page
    .getByRole("link", { name: /MS Auto/ })
    .first()
    .click();
  const org = new URL(page.url()).pathname.split("/")[2];
  await page.goto("/painel/" + org + "/pagina");
  await page.getByLabel("HEX (opcional)").fill("#E10909");
  await page.getByLabel("Aparência da página pública").selectOption("dark");
  const sample = page.getByLabel("Prévia da identidade");
  await expect(sample).toHaveCSS("color-scheme", "dark");
  await expect(
    sample.getByRole("button", { name: "Solicitar orçamento" }),
  ).toHaveCSS("background-color", "rgb(225, 9, 9)");
  await page.getByRole("button", { name: "Salvar identidade visual" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /Rascunho salvo/ }),
  ).toBeVisible();
  await fit(page);
  await page.screenshot({
    path: "reports/syzia-032/identity-mobile-dark.png",
    fullPage: true,
  });
  await page
    .locator("#previa")
    .getByRole("button", { name: "Visualizar como cliente", exact: true })
    .click();
  const preview = page
    .getByLabel("Prévia do rascunho")
    .locator(".c-custom-brand");
  await expect(preview).toHaveCSS("color-scheme", "dark");
  await expect(preview).toHaveCSS("background-color", "rgb(17, 18, 23)");
  await page
    .getByRole("button", { name: "Publicar alterações", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /publicad/i })
      .first(),
  ).toBeVisible();
  const publicPage = await page.context().newPage();
  await publicPage.goto("/empresa/ms-auto-ficticia");
  await expect(publicPage.locator(".c-custom-brand")).toHaveCSS(
    "color-scheme",
    "dark",
  );
  await publicPage.screenshot({
    path: "reports/syzia-032/public-preview-dark.png",
    fullPage: false,
  });
  await publicPage.close();
  await page.reload();
  await expect(page.getByLabel("Aparência da página pública")).toHaveValue(
    "dark",
  );
  await page.getByLabel("Aparência da página pública").selectOption("light");
  await expect(page.getByLabel("Prévia da identidade")).toHaveCSS(
    "color-scheme",
    "light",
  );
  await page.goto("/painel/" + org + "/consumidor");
  await expect(
    page.getByRole("heading", { name: "Configurar agenda online" }),
  ).toBeVisible();
  await fit(page);
  await page.screenshot({
    path: "reports/syzia-032/schedule-mobile.png",
    fullPage: true,
  });
});
test("Mobile: global people directory and role controls remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demoLogin(page, "root@example.invalid");
  await page.goto("/admin/equipe");
  await expect(
    page.getByRole("heading", { name: "Pessoas e acessos" }),
  ).toBeVisible();
  await page.getByLabel("Buscar pessoa").fill("Pessoa Fictícia SYZIA");
  await page.getByRole("button", { name: "Abrir ficha" }).first().click();
  await fit(page);
  await page.screenshot({
    path: "reports/syzia-032/people-mobile.png",
    fullPage: true,
  });
});
