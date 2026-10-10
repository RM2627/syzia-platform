import { demoLogin } from "../support/demo-login";
import { test, expect } from "../support/demo-test";
import type { Page } from "@playwright/test";
const photo = "assets/demo/auto-photo.png";
const otherPhoto = "assets/demo/horizonte-photo.png";
async function openCompany(page: Page) {
  await demoLogin(page);
  await page
    .getByRole("link", { name: /MS Auto/ })
    .first()
    .click();
  return new URL(page.url()).pathname.split("/")[2];
}
async function pageEditor(page: Page, org: string) {
  await page.goto(`/painel/${org}/pagina`);
  await expect(
    page.getByRole("heading", { name: "A sua empresa, do seu jeito" }),
  ).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
}
test("Jornada desktop: categoria, imagens, identidade, catálogo, prévia e publicação", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const org = await openCompany(page);
  await page.goto(`/painel/${org}/servicos`);
  await page
    .getByLabel("Nome do serviço", { exact: true })
    .fill("Projeto de interiores fictício");
  await page
    .getByLabel("Descrição do serviço", { exact: true })
    .fill("Descrição preservada ao criar categoria.");
  await page
    .getByRole("combobox", { name: "Categoria", exact: true })
    .selectOption("__create");
  await page
    .getByLabel("Nome da categoria", { exact: true })
    .fill("Projetos fictícios");
  await page
    .getByRole("button", { name: "Criar categoria", exact: true })
    .click();
  await expect(
    page
      .getByRole("combobox", { name: "Categoria", exact: true })
      .locator("option:checked"),
  ).toHaveText("Projetos fictícios");
  await expect(
    page.getByLabel("Descrição do serviço", { exact: true }),
  ).toHaveValue("Descrição preservada ao criar categoria.");
  await page
    .getByLabel("Enviar imagem do serviço", { exact: true })
    .setInputFiles(photo);
  await expect(
    page.getByRole("img", { name: "Prévia — Imagem do serviço" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: /Projeto de interiores fictício.*Sob consulta/,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByRole("combobox", { name: "Categoria", exact: true })
      .locator("option")
      .filter({ hasText: /^Projetos fictícios$/ }),
  ).toHaveCount(1);
  await page
    .getByRole("button", {
      name: /Projeto de interiores fictício.*Sob consulta/,
    })
    .click();
  await expect(
    page.getByRole("img", { name: "Prévia — Imagem do serviço" }),
  ).toBeVisible();
  await page.screenshot({
    path: "reports/presence-correction/service-desktop.png",
    fullPage: true,
  });
  await pageEditor(page, org);
  await page
    .getByLabel("Enviar logo da empresa", { exact: true })
    .setInputFiles(photo);
  await expect(
    page.getByRole("img", { name: "Prévia — Logo da empresa" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Enviar capa da página", { exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Enviar capa da página", { exact: true })
    .setInputFiles(otherPhoto);
  await expect(
    page.getByRole("img", { name: "Prévia — Capa da página" }),
  ).toBeVisible();
  await page.getByLabel("HEX (opcional)").fill("#F2C94C");
  const sample = page.getByLabel("Prévia da identidade").getByRole("button");
  await expect(sample).toHaveCSS("background-color", "rgb(242, 201, 76)");
  await expect(sample).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(
    page.getByRole("button", { name: "Salvar identidade visual" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Salvar identidade visual" }).click();
  await expect(
    page.getByText(
      "Rascunho salvo. Revise a prévia e publique quando estiver pronto.",
    ),
  ).toBeVisible();
  const categories = page.getByRole("list", { name: "Ordem das categorias" });
  const firstCategory = await categories
    .locator("li .sort-name")
    .first()
    .innerText();
  await categories
    .locator("li")
    .first()
    .getByRole("button", { name: /^Descer / })
    .click();
  const services = page.getByRole("list", { name: "Ordem dos serviços" });
  const firstService = await services
    .locator("li .sort-name")
    .first()
    .innerText();
  await services
    .locator("li .sort-handle")
    .first()
    .dragTo(services.locator("li").nth(1));
  await expect(services.locator("li .sort-name").nth(1)).toHaveText(
    firstService,
  );
  await page.getByRole("button", { name: "Salvar ordem do catálogo" }).click();
  await expect(
    page.getByText(
      "Rascunho salvo. Revise a prévia e publique quando estiver pronto.",
    ),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("HEX (opcional)")).toHaveValue("#F2C94C");
  await expect(categories.locator("li .sort-name").nth(1)).toHaveText(
    firstCategory,
  );
  await expect(services.locator("li .sort-name").nth(1)).toHaveText(
    firstService,
  );
  const visitor = await context.newPage();
  await visitor.goto("/empresa/ms-auto-ficticia");
  await expect(
    visitor.getByRole("heading", { name: "Projeto de interiores fictício" }),
  ).toHaveCount(0);
  await page
    .locator("#previa")
    .getByRole("button", { name: "Visualizar como cliente", exact: true })
    .click();
  const preview = page.getByLabel("Prévia do rascunho");
  await expect(
    preview.getByRole("heading", { name: "Projeto de interiores fictício" }),
  ).toBeVisible();
  await expect(preview.locator("img[src^='blob:']").first()).toBeVisible();
  await page.screenshot({
    path: "reports/presence-correction/preview-desktop.png",
  });
  await page
    .getByRole("button", { name: "Publicar alterações", exact: true })
    .click();
  await expect(
    page.getByText(
      "Alterações publicadas. Sua página já apresenta a versão revisada.",
    ),
  ).toBeVisible();
  await visitor.reload();
  await expect(
    visitor.getByRole("heading", { name: "Projeto de interiores fictício" }),
  ).toBeVisible();
  await page.getByLabel("HEX (opcional)").fill("#FFFFFF");
  await expect(
    page.getByRole("button", { name: "Salvar identidade visual" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Salvar identidade visual" }).click();
  await expect(
    page.getByText(
      "Rascunho salvo. Revise a prévia e publique quando estiver pronto.",
    ),
  ).toBeVisible();
  await visitor.reload();
  expect(
    await visitor
      .locator(".c-custom-brand")
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--brand")),
  ).toBe("#F2C94C");
  await page.locator("#identidade").scrollIntoViewIfNeeded();
  await noOverflow(page);
  const saveIdentity = page.getByRole("button", {
    name: "Salvar identidade visual",
    exact: true,
  });
  await saveIdentity.hover();
  await expect(saveIdentity).toHaveCSS("background-color", "rgb(89, 61, 225)");
  await expect(saveIdentity).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.screenshot({
    path: "reports/presence-correction/identity-desktop.png",
  });
  await visitor.close();
});
test("Portfólio: três formatos, fotos, ordem, edição, ocultação e exclusão; pagamentos", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const org = await openCompany(page);
  await pageEditor(page, org);
  for (const format of ["single", "before_after", "gallery"]) {
    await page
      .getByRole("button", { name: "+ Adicionar trabalho", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Adicionar trabalho",
      exact: true,
    });
    await dialog
      .getByLabel("Título", { exact: true })
      .fill("Trabalho fictício " + format);
    await dialog
      .getByLabel("Descrição curta")
      .fill("Projeto demonstrativo com imagens fictícias.");
    await dialog
      .getByRole("combobox", { name: "Formato", exact: true })
      .selectOption(format);
    if (format === "single") {
      await dialog.getByLabel("Enviar foto do trabalho").setInputFiles(photo);
      await expect(
        dialog.getByRole("img", { name: "Prévia — Foto do trabalho" }),
      ).toBeVisible();
    } else if (format === "before_after") {
      await dialog
        .getByLabel("Enviar antes", { exact: true })
        .setInputFiles(photo);
      await expect(
        dialog.getByRole("img", { name: "Prévia — Antes" }),
      ).toBeVisible();
      await dialog
        .getByLabel("Enviar depois", { exact: true })
        .setInputFiles(otherPhoto);
      await expect(
        dialog.getByRole("img", { name: "Prévia — Depois" }),
      ).toBeVisible();
    } else {
      await dialog
        .getByLabel("Adicionar fotos", { exact: true })
        .setInputFiles([photo, otherPhoto]);
      await expect(dialog.locator(".gallery-thumb img")).toHaveCount(2);
      await dialog
        .getByRole("button", { name: "Remover foto 2", exact: true })
        .click();
      await expect(dialog.locator(".gallery-thumb img")).toHaveCount(1);
      await dialog
        .getByLabel("Adicionar fotos", { exact: true })
        .setInputFiles(otherPhoto);
      await expect(dialog.locator(".gallery-thumb img")).toHaveCount(2);
      await dialog
        .getByRole("button", { name: "Adiar foto 1", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Visualizar foto 1", exact: true })
        .click();
      await expect(
        page
          .getByRole("dialog", { name: "Foto 1 do trabalho", exact: true })
          .getByRole("img"),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        dialog.getByRole("button", { name: "Visualizar foto 1", exact: true }),
      ).toBeFocused();
      await page.screenshot({
        path: "reports/presence-correction/portfolio-editor-desktop.png",
      });
    }
    await dialog
      .getByRole("button", { name: "Salvar trabalho", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Trabalho fictício " + format,
        exact: true,
      }),
    ).toBeVisible();
  }
  const cards = page.locator(".portfolio-draft-grid article");
  const single = cards.filter({
    has: page.getByRole("heading", {
      name: "Trabalho fictício single",
      exact: true,
    }),
  });
  await single.getByRole("button", { name: "Editar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Título", { exact: true })
    .fill("Foto única revisada");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar trabalho", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await cards
    .filter({ hasText: "Foto única revisada" })
    .getByRole("button", { name: "Ocultar", exact: true })
    .click();
  await expect(cards.filter({ hasText: "Foto única revisada" })).toContainText(
    "Oculto no rascunho",
  );
  await page.getByText("Reordenar trabalhos", { exact: true }).click();
  const ordered = page.getByRole("list", { name: "Ordem dos trabalhos" });
  const firstWork = await ordered.locator("li .sort-name").first().innerText();
  await ordered
    .locator("li")
    .first()
    .getByRole("button", { name: /^Descer / })
    .click();
  await page
    .getByRole("button", { name: "Salvar ordem dos trabalhos" })
    .click();
  await expect(
    page.getByRole("button", { name: "Salvar ordem dos trabalhos" }),
  ).toHaveCount(0);
  await expect(ordered.locator("li .sort-name").nth(1)).toHaveText(firstWork);
  page.once("dialog", (d) => d.accept());
  await cards
    .filter({ hasText: "Foto única revisada" })
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect(cards.filter({ hasText: "Foto única revisada" })).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Trabalho fictício before_after",
      exact: true,
    }),
  ).toBeVisible();
  await page.locator("#portfolio").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "reports/presence-correction/portfolio-desktop.png",
  });
  await page.goto(`/painel/${org}/configuracao#pagamentos`);
  await expect(
    page.getByRole("heading", { name: "Formas de pagamento aceitas" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Pix", exact: true }).check();
  await page
    .getByRole("checkbox", { name: "Transferência", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Salvar configuração", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Transferência", exact: true }),
  ).toBeChecked();
});
for (const [device, width, height] of [
  ["tablet", 820, 1180],
  ["mobile", 390, 844],
] as const) {
  test("Edição responsiva e teclado — " + device, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const org = await openCompany(page);
    await pageEditor(page, org);
    await page.locator("#identidade").scrollIntoViewIfNeeded();
    await noOverflow(page);
    await page.screenshot({
      path: `reports/presence-correction/identity-${device}.png`,
    });
    await page
      .getByRole("button", { name: "+ Adicionar trabalho", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Título", { exact: true })
      .fill("Rascunho responsivo");
    await dialog
      .getByRole("combobox", { name: "Formato", exact: true })
      .selectOption("before_after");
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBeTruthy();
    await page.screenshot({
      path: `reports/presence-correction/portfolio-editor-${device}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "+ Adicionar trabalho", exact: true }),
    ).toBeFocused();
    await page
      .locator("#previa")
      .getByRole("button", { name: "Visualizar como cliente", exact: true })
      .click();
    await expect(page.getByLabel("Prévia do rascunho")).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: `reports/presence-correction/preview-${device}.png`,
    });
  });
}
