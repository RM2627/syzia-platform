import { demoLogin as login } from "../support/demo-login";
import { test, expect } from "../support/demo-test";

for (const [device, width, height] of [
  ["desktop", 1440, 1000],
  ["tablet", 820, 1180],
  ["mobile", 390, 844],
] as const) {
  test(
    "Página da empresa: navegar, copiar, prévia e portfólio " + device,
    async ({ page, context }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.setViewportSize({ width, height });
      await login(page);
      await page
        .getByRole("link", { name: /MS Auto/ })
        .first()
        .click();
      await page
        .getByRole("navigation", { name: "Navegação da empresa" })
        .getByRole("link", { name: "Página da empresa", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Página da empresa", exact: true }),
      ).toBeVisible();
      const url = "http://127.0.0.1:5173/empresa/ms-auto-ficticia";
      await expect(page.getByLabel("URL pública", { exact: true })).toHaveValue(
        url,
      );
      await expect(
        page.getByRole("link", { name: /Ver página pública/ }),
      ).toHaveAttribute("href", "/empresa/ms-auto-ficticia");
      await expect(
        page.getByRole("link", { name: /Ver página pública/ }),
      ).toHaveAttribute("target", "_blank");
      await page
        .getByRole("button", { name: "Copiar link", exact: true })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: /Link copiado/ }),
      ).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        url,
      );
      await page.screenshot({
        path: `reports/visual-company-page/hub-${device}.png`,
        fullPage: false,
      });
      await page.getByRole("link", { name: /^Portfólio/ }).click();
      await expect(
        page.getByRole("heading", { name: "Portfólio", exact: true }),
      ).toBeInViewport();
      await expect(
        page.locator(".portfolio-draft-grid article").first(),
      ).toBeVisible();
      await expect(
        page.locator(".portfolio-draft-grid img").first(),
      ).toBeVisible();
      await page
        .locator(".portfolio-draft-grid article")
        .first()
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `reports/visual-company-page/portfolio-${device}.png`,
      });
      await page
        .getByRole("button", { name: "Mostrar prévia publicada" })
        .click();
      await expect(
        page
          .getByLabel("Prévia do portfólio publicado")
          .getByRole("heading")
          .first(),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    },
  );
}
test("Onboarding leva à central e copiar sem permissão oferece alternativa", async ({
  page,
}) => {
  await login(page, "newadmin@example.invalid");
  await page
    .getByRole("link", { name: /Ateliê Inicial/ })
    .first()
    .click();
  await page.getByRole("link", { name: /Identidade visual/ }).click();
  await expect(page).toHaveURL(/\/pagina#identidade$/);
  await expect(
    page.getByText("Ainda não publicada", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(Error("denied")) },
      configurable: true,
    }),
  );
  await page.getByRole("button", { name: "Copiar link", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /Selecione e copie/ }),
  ).toBeVisible();
  await expect(page.getByLabel("URL pública")).not.toHaveValue(
    /ms-auto-ficticia/,
  );
});
for (const email of [
  "own@example.invalid",
  "agenta@example.invalid",
  "adminb@example.invalid",
]) {
  test(
    "Central da página não concede gestão a " + email,
    async ({ page, browser }) => {
      await login(page);
      await page
        .getByRole("link", { name: /MS Auto/ })
        .first()
        .click();
      const target = page.url() + "/pagina";
      const actorContext = await browser.newContext({
        baseURL: "http://127.0.0.1:5173",
        locale: "pt-BR",
      });
      const actor = await actorContext.newPage();
      try {
        await login(actor, email);
        await actor.goto(target);
        await expect(
          actor.getByRole("heading", {
            name: /Empresa indisponível|Seu acesso à empresa|Acesso não disponível/,
          }),
        ).toBeVisible();
        await expect(
          actor.getByRole("button", {
            name: "Publicar dados aprovados",
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          actor.getByRole("button", { name: "Salvar trabalho", exact: true }),
        ).toHaveCount(0);
      } finally {
        await actorContext.close();
      }
    },
  );
}
test("Portfólio: enviar imagem, incluir, ordenar, publicar e remover sem vazar rascunho", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("link", { name: /MS Auto/ })
    .first()
    .click();
  await page
    .getByRole("navigation", { name: "Navegação da empresa" })
    .getByRole("link", { name: "Página da empresa", exact: true })
    .click();
  const sharp = (await import("sharp")).default;
  const png = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#193e35" },
  })
    .png()
    .toBuffer();
  await page.getByLabel("Enviar imagem empresarial").setInputFiles({
    name: "trabalho-ficticio.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    page.getByRole("status").filter({ hasText: /Rascunho salvo/ }),
  ).toBeVisible();
  await page
    .getByLabel("Título", { exact: true })
    .fill("Trabalho fictício de revisão");
  await page
    .getByLabel("Descrição curta")
    .fill("Imagem fictícia para validar a revisão local.");
  await page.getByLabel("Ordem", { exact: true }).fill("2");
  await page.getByRole("checkbox", { name: "Imagem 1", exact: true }).check();
  await page
    .getByRole("button", { name: "Salvar trabalho", exact: true })
    .click();
  const draft = page
    .locator(".portfolio-draft-grid article")
    .filter({ hasText: "Trabalho fictício de revisão" });
  await expect(draft).toBeVisible();
  await page.getByRole("button", { name: "Mostrar prévia publicada" }).click();
  await expect(
    page
      .getByLabel("Prévia do portfólio publicado")
      .getByText("Trabalho fictício de revisão"),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Publicar dados aprovados", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /Publicação atualizada/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mostrar prévia publicada" }).click();
  await expect(
    page
      .getByLabel("Prévia do portfólio publicado")
      .getByRole("heading", { name: "Trabalho fictício de revisão" }),
  ).toBeVisible();
  await draft
    .getByRole("button", { name: "Remover da próxima publicação" })
    .click();
  await expect(draft.getByText(/Fora da próxima publicação/)).toBeVisible();
  await page
    .getByRole("button", { name: "Publicar dados aprovados", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /Publicação atualizada/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mostrar prévia publicada" }).click();
  await expect(
    page
      .getByLabel("Prévia do portfólio publicado")
      .getByText("Trabalho fictício de revisão"),
  ).toHaveCount(0);
});
