import {demoLogin} from "../support/demo-login";
import { test, expect } from "../support/demo-test";
const scenarios = [
  ["auto", "ms-auto-ficticia", "MS Auto", "Lavagem de cuidado"],
  [
    "design",
    "horizonte-ficticio",
    "Estúdio Horizonte",
    "Consultoria de ambientes",
  ],
  [
    "nutri",
    "clara-nutricao-ficticia",
    "Clara Nutrição",
    "Consulta de nutrição",
  ],
] as const;
for (const [device, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
] as const)
  for (const [key, slug, name, service] of scenarios)
    test(`Versatilidade ${key} ${device}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/empresa/" + slug);
      await expect(
        page.getByRole("heading", { name: new RegExp(name) }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: service, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Encontre o serviço que precisa." }),
      ).toBeVisible();
      if (key === "auto") {
        await expect(page.locator(".c-before-after")).toHaveCount(1);
        await expect(
          page.locator(".c-before-after").getByText("Antes", { exact: true }),
        ).toBeVisible();
      }
      if (key === "design") {
        await expect(page.locator(".c-gallery-grid img")).toHaveCount(1);
        await expect(page.locator(".c-before-after")).toHaveCount(0);
        await expect(
          page.getByText("Sob consulta", { exact: true }),
        ).toBeVisible();
      }
      if (key === "nutri") {
        await expect(page.locator(".c-art-label")).toHaveCSS(
          "color",
          "rgb(255, 255, 255)",
        );
        await expect(page.locator("#portfolio")).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Escolher um horário →" }),
        ).toBeVisible();
        await expect(
          page.getByText("R$ 180,00", { exact: true }).first(),
        ).toBeVisible();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `reports/visual-multisegment/${key}-${device}.png`,
        fullPage: true,
      });
    });
for (const [key, slug, service] of [
  ["nutri", "clara-nutricao-ficticia", "Consulta de nutrição"],
  ["design", "horizonte-ficticio", "Transformação completa"],
] as const)
  test(`Consumidor ${key}: solicitação administrativa`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/empresa/" + slug);
    await page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", { name: service, exact: true }),
      })
      .getByRole("button", { name: "Solicitar orçamento" })
      .click();
    await page.getByRole("button", { name: "Continuar →" }).click();
    if (key === "nutri")
      await page
        .getByLabel("Modalidade do atendimento *")
        .selectOption("Online");
    await page.getByRole("button", { name: "Continuar →" }).click();
    await page.getByLabel("Seu nome", { exact: true }).fill("Marina Fictícia");
    await page.getByLabel("WhatsApp com DDD").fill("81999990000");
    await page.getByLabel(/Li o aviso:/).check();
    await page.getByRole("button", { name: "Continuar →" }).click();
    await page
      .getByRole("button", { name: "Enviar solicitação", exact: true })
      .click();
    await page.waitForURL(/\/acompanhar\/r_/);
    await expect(
      page.getByRole("heading", { name: "Olá, Marina." }),
    ).toBeVisible();
    if (key === "nutri") {
      await page
        .getByLabel("Escolha um dia")
        .fill(new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
      await page.getByRole("button", { name: "Consultar horários" }).click();
      await page.getByRole("button", { name: "08:00", exact: true }).click();
      await page
        .getByRole("button", { name: "Confirmar horário — 08:00" })
        .click();
      await expect(page.getByText("✓ Confirmado")).toBeVisible();
    }
  });
test("Gestora C: página existente e onboarding sem portfólio obrigatório", async ({
  page,
}) => {
  await demoLogin(page,"adminc@example.invalid");
  await page
    .getByRole("link", { name: /Clara Nutrição/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Revisar checklist de configuração" })
    .click();
  await expect(
    page
      .getByRole("link", { name: /Portfólio/ })
      .getByText("Recomendado / opcional"),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Navegação da empresa" })
    .getByRole("link", { name: "Página da empresa", exact: true })
    .click();
  await expect(page.getByLabel("URL pública")).toHaveValue(
    "http://127.0.0.1:5173/empresa/clara-nutricao-ficticia",
  );
  await expect(
    page.getByRole("combobox", { name: "Formato", exact: true }),
  ).toHaveValue("gallery");
  await page.getByRole("button", { name: "Mostrar prévia publicada" }).click();
  await expect(
    page.getByText("Nenhum trabalho publicado ainda."),
  ).toBeVisible();
});
