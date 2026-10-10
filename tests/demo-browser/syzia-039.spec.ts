import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
const draftName = "Plano comercial de verificação 039";
async function plans(page: any) {
  await demoLogin(page, "root@example.invalid");
  await page.goto("/admin/assinaturas");
  await expect(
    page.getByRole("heading", { name: "Planos e assinaturas", exact: true }),
  ).toBeVisible();
}
test("Captura atual do Estúdio Horizonte, sem rótulo antigo na landing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 900 });
  await page.goto("/empresa/horizonte-ficticio");
  await expect(page.locator(".c-service").first()).toBeVisible();
  await expect(page.locator("h1")).toContainText("Estúdio Horizonte");
  await page
    .locator(".c-cover")
    .evaluate((img: HTMLImageElement) => img.decode());
  await page
    .locator(".c-logo")
    .evaluate((img: HTMLImageElement) => img.decode());
  expect(await page.locator("body").innerText()).not.toMatch(
    /Estúdio Horizonte.*Fictício|Demonstração local · dados fictícios/,
  );
  await sharp(await page.screenshot())
    .webp({ quality: 85 })
    .toFile("public/marketing/pagina-demonstracao.webp");
  await page.goto("/");
  await expect(page.locator(".sy-public-page img")).toBeVisible();
  await page.screenshot({
    path: "reports/syzia-039/landing.png",
    fullPage: true,
  });
});
test("Configurador: recursos, ilimitado, 3 membros, teste do servidor, resumo e plano interno", async ({
  page,
}) => {
  await plans(page);
  await page.getByRole("button", { name: "Criar plano", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome", { exact: true }).fill(draftName);
  await dialog.getByLabel("Preço (R$)", { exact: true }).fill("149.90");
  await dialog
    .getByLabel("Descrição curta")
    .fill("Operação, equipe e retornos organizados.");
  await dialog.getByRole("checkbox", { name: /Financeiro/ }).uncheck();
  await dialog
    .getByLabel("Membros da equipe · tipo de limite")
    .selectOption("limited");
  await dialog
    .getByLabel("Limite · Membros da equipe", { exact: true })
    .fill("3");
  await expect(
    dialog.getByLabel("Solicitações por mês · tipo de limite"),
  ).toHaveValue("unlimited");
  await expect(
    dialog.getByText("Plano consistente", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Testar atribuições do plano", exact: true })
    .click();
  await expect(dialog.getByLabel("Resultado do teste")).toContainText(
    "Verificação concluída — plano consistente",
  );
  await expect(dialog.getByLabel("Resultado do teste")).toContainText(
    "Bloqueado — Financeiro",
  );
  await expect(dialog.getByLabel("Resultado do teste")).toContainText(
    "Bloqueado — 4º membro",
  );
  await dialog
    .getByRole("button", { name: "Revisar resumo comercial" })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Resumo comercial" }),
  ).toBeVisible();
  await expect(dialog).toContainText("R$ 149,90");
  await expect(
    dialog.getByRole("heading", { name: "Resumo comercial" }),
  ).toBeInViewport();
  await page.screenshot({ path: "reports/syzia-039/plano-resumo.png" });
  await dialog
    .getByRole("button", { name: "Salvar versão", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", { name: draftName, exact: true }),
      }),
  ).toContainText("Não ofertado");
});
test("Publicação/self-service/trial: inconsistência bloqueia; edição cria nova versão", async ({
  page,
}) => {
  await plans(page);
  const card = page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: draftName, exact: true }),
    });
  await card.getByRole("button", { name: "Editar oferta" }).click();
  const d = page.getByRole("dialog");
  await d
    .getByRole("checkbox", {
      name: "Permitir cadastro pelo site (self-service)",
      exact: true,
    })
    .check();
  await expect(d.getByText("Inconsistência encontrada")).toBeVisible();
  await expect(
    d.getByRole("button", { name: "Revisar resumo comercial" }),
  ).toBeDisabled();
  await d
    .getByRole("checkbox", { name: "Mostrar no site", exact: true })
    .check();
  await d
    .getByRole("checkbox", {
      name: "Disponível para novas empresas",
      exact: true,
    })
    .check();
  await d
    .getByRole("checkbox", {
      name: "Oferecer teste gratuito no cadastro",
      exact: true,
    })
    .check();
  await d.getByLabel("Teste gratuito (dias)").fill("12");
  await expect(d.getByText("Plano consistente", { exact: true })).toBeVisible();
  await d.getByRole("button", { name: "Revisar resumo comercial" }).click();
  await expect(d).toContainText("12 dias de teste gratuito");
  await d.getByRole("button", { name: "Salvar versão", exact: true }).click();
  await expect(d).toHaveCount(0);
  await expect(card).toContainText("versão 2");
  await page.goto("/planos");
  const pub = page
    .locator(".sy-plan-grid article")
    .filter({
      has: page.getByRole("heading", { name: draftName, exact: true }),
    });
  await expect(pub).toContainText("12 dias");
  await expect(pub).not.toContainText("Financeiro conforme permissões");
  await expect(pub.getByRole("link", { name: "Escolher plano" })).toBeVisible();
});
test("Cobrança mostra ausência do provedor e volta à configuração de planos", async ({
  page,
}) => {
  await plans(page);
  await page.getByRole("link", { name: "Cobrança", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Cobrança", exact: true }),
  ).toBeVisible();
  for (const x of [
    "Não configurado",
    "Aguardando integração",
    "Não disponível",
    "Não configurados",
  ])
    await expect(page.getByText(x, { exact: true })).toBeVisible();
  await page.screenshot({
    path: "reports/syzia-039/cobranca.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Configurar planos e assinaturas" })
    .click();
  await expect(page).toHaveURL(/admin\/assinaturas/);
});
test("Mobile: editor, opções e resumo sem corte lateral", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await plans(page);
  await page.getByRole("button", { name: "Criar plano", exact: true }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Nome", { exact: true }).fill("Oferta interna mobile");
  await d.getByLabel("Preço (R$)", { exact: true }).fill("89");
  await expect(d.getByText("Plano consistente", { exact: true })).toBeVisible();
  expect(
    await d.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  ).toBeTruthy();
  await d.getByRole("button", { name: "Revisar resumo comercial" }).click();
  await expect(
    d.getByRole("heading", { name: "Resumo comercial" }),
  ).toBeInViewport();
  await page.screenshot({ path: "reports/syzia-039/plano-mobile.png" });
  await expect(
    d.getByRole("heading", { name: "Resumo comercial" }),
  ).toBeVisible();
  expect(
    await d.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  ).toBeTruthy();
});
test("Limpeza de interface em rotas públicas e administrativas", async ({
  page,
}) => {
  const checks: any[] = [];
  for (const route of ["/", "/planos", "/entrar", "/ativar-acesso"]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(
      /Preço fictício|Demonstração local · dados fictícios|localhost|127\.0\.0\.1|fixture/,
    );
    checks.push({ route, passed: true });
  }
  await plans(page);
  await page.getByRole("button", { name: "Criar plano", exact: true }).click();
  const text = await page.getByRole("dialog").innerText();
  expect(text).not.toMatch(
    /fictício|fictícia|mock|fixture|localhost|127\.0\.0\.1|Avaliação \(dias\)/i,
  );
  checks.push({ route: "/admin/assinaturas (configurador)", passed: true });
  await writeFile(
    "reports/syzia-039/ui-cleanup.json",
    JSON.stringify(checks, null, 2),
  );
});
