import { test, expect } from "@playwright/test";
import { setupCompany } from "../support/company-browser-db";
test.setTimeout(60000);
let fixture: Awaited<ReturnType<typeof setupCompany>>;
test.afterEach(async () => {
  await fixture?.close();
});
async function open(
  page: any,
  section: string,
  role: "admin" | "attendant" = "admin",
) {
  fixture = await setupCompany(page, role);
  await fixture.login();
  await page.goto("/painel/" + fixture.A + "/" + section);
}
test("Empresa: salva configuração por RPC com escopo e revisão", async ({
  page,
}) => {
  await open(page, "configuracao");
  await page
    .getByLabel("Descrição do negócio", { exact: true })
    .fill("Nova descrição fictícia salva pela interface.");
  await page.getByRole("button", { name: "Salvar configuração" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Alteração salva." }),
  ).toBeVisible();
  const call = fixture.calls.find((c) => c.name === "company_save");
  expect(call?.body.p_org).toBe(fixture.A);
  expect(call?.body.p_data.description).toBe(
    "Nova descrição fictícia salva pela interface.",
  );
  expect(call?.body.p_expected_revision).toBeGreaterThan(0);
});
test("Empresa: serviço com preço a partir de usa centavos inteiros", async ({
  page,
}) => {
  await open(page, "servicos");
  await page.getByLabel("Nome do serviço").fill("Polimento fictício");
  await page
    .getByLabel("Modalidade de preço", { exact: true })
    .selectOption("from");
  await page.getByLabel("Valor em reais", { exact: true }).fill("145,90");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Polimento fictício/ }),
  ).toBeVisible();
  expect(
    fixture.calls.find((c) => c.name === "company_save")?.body.p_data
      .price_cents,
  ).toBe(14590);
});
test("Empresa: adicional e pergunta ficam vinculados ao serviço selecionado", async ({
  page,
}) => {
  await open(page, "servicos");
  await page.getByRole("button", { name: /Limpeza técnica fictícia/ }).click();
  const addon = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Adicionais deste serviço" }),
  });
  await addon.getByLabel("Nome do adicional").fill("Proteção fictícia");
  await addon.getByLabel("Modalidade de preço").selectOption("fixed");
  await addon.getByLabel("Valor em reais").fill("25");
  await addon.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(
    addon.getByRole("button", { name: /Proteção fictícia/ }),
  ).toBeVisible();
  const field = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Perguntas necessárias" }),
  });
  await field.getByLabel("Pergunta", { exact: true }).fill("Qual o tamanho?");
  await field.getByLabel("Tipo de resposta").selectOption("choice");
  await field.getByLabel("Opções — uma por linha").fill("Pequeno\nGrande");
  await field.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(
    field.getByRole("button", { name: /Qual o tamanho/ }),
  ).toBeVisible();
  const writes = fixture.calls.filter((c) => c.name === "company_save");
  expect(
    writes.every((c) => c.body.p_data.service_id === fixture.service),
  ).toBe(true);
});
test("Empresa: contradição de autonomia é rejeitada sem enviar alteração", async ({
  page,
}) => {
  await open(page, "autonomia");
  await page.getByLabel("Negociar condições", { exact: true }).check();
  await page.getByRole("button", { name: "Salvar autonomia" }).click();
  await expect(page.getByRole("alert")).toContainText("Nunca alterar preço");
  expect(fixture.calls.filter((c) => c.name === "company_save")).toHaveLength(
    0,
  );
});
test("Empresa: grava limite de desconto consistente", async ({ page }) => {
  await open(page, "autonomia");
  await page.getByLabel("Nunca alterar preço").uncheck();
  await page.getByLabel("Aplicar desconto em preço ou orçamento").check();
  await page.getByLabel("Desconto máximo (%)").fill("10");
  await page.getByRole("button", { name: "Salvar autonomia" }).click();
  await expect(
    page.getByText("Alteração salva.", { exact: true }),
  ).toBeVisible();
  expect(
    fixture.calls.find((c) => c.name === "company_save")?.body.p_data
      .max_discount_percent,
  ).toBe(10);
});
test("Empresa: backend rejeita publicação com seção incompleta", async ({
  page,
}) => {
  await open(page, "manual");
  await page
    .locator("summary")
    .filter({ hasText: "Descrição do negócio" })
    .click();
  await page.getByLabel("Descrição do negócio", { exact: true }).fill("");
  await page
    .locator("details")
    .filter({ has: page.getByLabel("Descrição do negócio", { exact: true }) })
    .getByRole("button", { name: "Salvar alterações" })
    .click();
  await page
    .getByLabel("Revisei o manual e o conteúdo da FAQ pública desta versão")
    .check();
  await page.getByRole("button", { name: "Publicar versão do manual" }).click();
  await expect(page.getByRole("alert")).toContainText("Complete os tópicos");
  await expect(
    page.getByRole("button", { name: "Publicar versão do manual" }),
  ).toBeVisible();
});
test("Empresa: publica manual, ativa atendimento e cria nova versão", async ({
  page,
}) => {
  await open(page, "manual");
  await page
    .getByLabel("Revisei o manual e o conteúdo da FAQ pública desta versão")
    .check();
  await page.getByRole("button", { name: "Publicar versão do manual" }).click();
  await expect(
    page.getByText("Versão publicada no manual da empresa.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publicar versão do manual" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Prontidão", exact: true }).click();
  await page
    .getByRole("button", { name: "Habilitar atendimento humano" })
    .click();
  await expect(
    page.getByRole("button", { name: "Desabilitar atendimento humano" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Manual", exact: true }).click();
  await page.getByLabel("Título da nova versão").fill("Revisão dois");
  await page.getByRole("button", { name: "Criar rascunho" }).click();
  await expect(
    page.getByRole("button", { name: /Versão 2 · Rascunho/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Versão 1 · Publicada/ }),
  ).toBeVisible();
});
test("Empresa: prontidão impede ativação antes da publicação", async ({
  page,
}) => {
  await open(page, "prontidao");
  await expect(
    page.getByRole("button", { name: "Habilitar atendimento humano" }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Esta empresa ainda não está pronta para atendimento terceirizado.",
    ),
  ).toBeVisible();
  await page.screenshot({
    path: "reports/company-readiness-desktop.png",
    fullPage: true,
  });
});
test("Empresa: troca de URL não carrega empresa B", async ({ page }) => {
  await open(page, "configuracao");
  await page.goto("/painel/" + fixture.B + "/autonomia");
  await expect(
    page.getByRole("heading", { name: "Empresa indisponível" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Salvar autonomia" }),
  ).toHaveCount(0);
  expect(
    fixture.calls.some(
      (c) => c.name === "company_context" && c.body.p_org === fixture.B,
    ),
  ).toBe(false);
});
test("Empresa: atendente não recebe controles de edição nem rascunhos", async ({
  page,
}) => {
  await open(page, "manual", "attendant");
  await expect(
    page.getByRole("heading", { name: "Acesso não disponível" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Criar rascunho" }),
  ).toHaveCount(0);
  await page.goto("/painel/" + fixture.A + "/autonomia");
  await expect(
    page.getByRole("heading", { name: "Acesso não disponível" }),
  ).toBeVisible();
  expect(fixture.calls.some((c) => c.name === "company_context")).toBe(false);
  await expect(page.getByLabel("Nunca alterar preço")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Salvar autonomia" }),
  ).toHaveCount(0);
});
test("Empresa: FAQ pública mostra apenas snapshot aprovado e escapa HTML", async ({
  page,
}) => {
  fixture = await setupCompany(page);
  await fixture.adminAction(async ({ save, rev, scalar }) => {
    await save("faq", {
      question: "Segurança de texto",
      answer: "<img src=x onerror=alert(1)> Conteúdo de teste.",
    });
    await scalar("select company_publish_manual($1,$2,$3)", [
      fixture.A,
      fixture.manual,
      await rev(),
    ]);
    await scalar("select company_set_activation($1,$2,false,true)", [
      fixture.A,
      await rev(),
    ]);
  });
  await page.goto("/empresa/aurora-ficticia/faq");
  await expect(
    page.getByRole("heading", { name: "Oficina Aurora Fictícia" }),
  ).toBeVisible();
  await page.getByText("Segurança de texto", { exact: true }).click();
  await expect(
    page.getByText("<img src=x onerror=alert(1)> Conteúdo de teste.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("img")).toHaveCount(0);
  await expect(page.getByText("interno@example.invalid")).toHaveCount(0);
});
test("Empresa: nova revisão concorrente causa conflito sem falso sucesso", async ({
  page,
}) => {
  await open(page, "configuracao");
  await expect(
    page.getByLabel("Descrição do negócio", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Descrição do negócio", { exact: true })
    .fill("Edição feita sobre uma revisão anterior.");
  await fixture.adminAction(async ({ save }) => {
    await save("settings", { legal_name: "Edição em outra sessão fictícia" });
  });
  await page.getByRole("button", { name: "Salvar configuração" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Outra alteração foi salva",
  );
  await expect(page.getByText("Alteração salva.", { exact: true })).toHaveCount(
    0,
  );
});
test("Empresa: layout móvel não transborda e permite navegar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "configuracao");
  await expect(
    page.getByRole("button", { name: "Salvar configuração" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "reports/company-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "Serviços", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Catálogo de serviços" }),
  ).toBeVisible();
});
test("Empresa: revisão externa preserva rascunho e rejeita sobrescrita silenciosa", async ({
  page,
}) => {
  await open(page, "configuracao");
  const field = page.getByLabel("Descrição do negócio", { exact: true });
  await field.fill("Rascunho local fictício");
  await fixture.adminAction(async ({ save }) => {
    await save("settings", { description: "Alteração externa fictícia" });
  });
  await page.waitForTimeout(16000);
  await expect(
    page.getByText("Há uma atualização mais recente."),
  ).toBeVisible();
  await expect(field).toHaveValue("Rascunho local fictício");
  await page
    .getByRole("button", { name: "Salvar configuração", exact: true })
    .click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(field).toHaveValue("Rascunho local fictício");
});
