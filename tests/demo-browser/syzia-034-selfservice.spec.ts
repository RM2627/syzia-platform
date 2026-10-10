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
test("Site → plano → identidade → retomada → pagamento fictício → consentimento → onboarding existente", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page).toHaveTitle("SYZIA — Onde tudo se alinha.");
  await expect(
    page.getByRole("heading", { name: /Sua empresa pode crescer/ }),
  ).toBeVisible();
  await fit(page);
  await page.screenshot({
    path: "reports/syzia-034/site-desktop.png",
    fullPage: true,
  });
  await page.goto("/planos");
  await page.getByRole("link", { name: "Escolher plano" }).first().click();
  await page.getByLabel("Nome completo", { exact: true }).fill("João da Silva");
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(
    "joao.silva",
  );
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("cadastro034@example.invalid");
  await page
    .getByLabel("Sua senha", { exact: true })
    .fill("FictitiousPassword033!");
  await page
    .getByLabel("Confirmar senha", { exact: true })
    .fill("FictitiousPassword033!");
  await page
    .getByRole("button", { name: "Criar identidade", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Empresa e plano", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Nome da empresa", { exact: true })
    .fill("Casa Aurora Fictícia");
  await page.getByLabel("Telefone", { exact: true }).fill("11999999999");
  await page.getByLabel("Documento", { exact: true }).fill("52998224725");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Confirme as condições" }),
  ).toBeVisible();
  const first = await rpc(page, "selfservice_context");
  await page.reload();
  await expect(
    page.getByText("Casa Aurora Fictícia", { exact: true }),
  ).toBeVisible();
  expect((await rpc(page, "selfservice_context")).id).toBe(first.id);
  await expect(page.getByText(/Grátis até/)).toBeVisible();
  await page.getByRole("button", { name: "Continuar para pagamento" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Forma de pagamento fictícia" }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.screenshot({
    path: "reports/syzia-034/consentimento-local.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Confirmar e preparar minha empresa" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Empresa preparada." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Abrir configuração da empresa" })
    .click();
  await page
    .getByRole("checkbox", { name: "Li e aceito os Termos de Uso" })
    .check();
  await page
    .getByRole("checkbox", {
      name: "Li e estou ciente da Política de Privacidade",
    })
    .check();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Vamos preparar sua empresa" }),
  ).toBeVisible();
  await page.screenshot({
    path: "reports/syzia-034/onboarding-existente.png",
    fullPage: true,
  });
});
