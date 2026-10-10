import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
for (const [label, width, height] of [
  ["desktop", 1440, 1000],
  ["tablet", 834, 1112],
  ["mobile", 390, 844],
] as const) {
  test("030 Financeiro e calculadoras " + label, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await demoLogin(page);
    const company = page.locator('a[href^="/painel/"]').first();
    await company.click();
    await page.getByRole("link", { name: "Financeiro", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Financeiro", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Contas a receber", exact: true })
      .click();
    await page.getByText("Nova conta a receber", { exact: true }).click();
    await page
      .getByLabel("Descrição", { exact: true })
      .fill("Cobrança fictícia 030 " + label);
    await page.getByLabel("Total (R$)", { exact: true }).fill("170");
    await page.getByRole("button", { name: "Criar conta a receber" }).click();
    await expect(
      page.getByRole("heading", { name: "Detalhes da cobrança" }),
    ).toBeVisible();
    await page.getByLabel("Valor recebido (R$)").fill("50");
    await page
      .getByRole("button", { name: "Confirmar registro de recebimento" })
      .click();
    await expect(page.locator(".finance-values")).toContainText("120,00");
    await expect(page.locator(".finance-values")).toContainText("50,00");
    await page.screenshot({
      path: "reports/implementation-030/finance-" + label + ".png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Calculadoras", exact: true })
      .click();
    await page.getByLabel("Materiais (R$)", { exact: true }).fill("80");
    await page.getByLabel("Margem desejada (%)").fill("20");
    await expect(page.locator(".finance-simulation")).toContainText("100,00");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    expect(errors).toEqual([]);
  });
}
test("030 Categorias reutilizáveis e permissões por módulos", async ({
  page,
}) => {
  await demoLogin(page);
  await page.locator('a[href^="/painel/"]').first().click();
  const base = page.url().replace(/\/$/, "");
  await page.goto(base + "/servicos");
  await page.getByText("Categorias de serviços", { exact: true }).click();
  await page
    .getByLabel("Nova categoria", { exact: true })
    .fill("Categoria fictícia 030");
  await page
    .getByRole("button", { name: "Criar categoria", exact: true })
    .click();
  await expect(
    page.getByLabel("Categoria", { exact: true }).last(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "+ Novo serviço", exact: true })
    .click();
  await page
    .getByLabel("Categoria", { exact: true })
    .last()
    .selectOption({ label: "Categoria fictícia 030" });
  await page
    .getByRole("link", { name: "Pessoas e acessos", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Permissões por pessoa" }),
  ).toBeVisible();
  await page.screenshot({
    path: "reports/implementation-030/permissions-desktop.png",
    fullPage: true,
  });
});
