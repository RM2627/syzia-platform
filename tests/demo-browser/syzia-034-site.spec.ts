import { test, expect } from "../support/demo-test";
import { writeFile } from "node:fs/promises";
test("Landing preserva marca, conteúdo real, FAQ dinâmico, navegação e três tamanhos", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const metrics: any[] = [];
  for (const [width, height] of [
    [1440, 1000],
    [820, 1180],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Sua empresa pode crescer/ }),
    ).toBeVisible();
    await expect(page.locator(".sy-plan-grid article").first()).toBeVisible();
    await expect(page.locator(".sy-public-page img")).toHaveJSProperty(
      "complete",
      true,
    );
    expect(
      await page
        .locator(".sy-public-page img")
        .evaluate((i: HTMLImageElement) => i.naturalWidth),
    ).toBeGreaterThan(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page
      .locator("summary")
      .filter({ hasText: "Posso testar antes de contratar?" })
      .click();
    await expect(page.locator(".sy-faq details[open]")).toContainText(
      "Há avaliação nas ofertas publicadas:",
    );
    const durations = await page.locator(".sy-plan-grid").innerText();
    expect(durations).toMatch(/dias de avaliação/);
    const summary = page
      .locator("summary")
      .filter({ hasText: "Meus funcionários veem todo o financeiro?" });
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.locator(".sy-faq details[open]").filter({ has: summary }),
    ).toContainText("permissões");
    await page.screenshot({
      path: `reports/syzia-034/landing-${width}.png`,
      fullPage: true,
    });
    metrics.push(
      await page.evaluate(() => ({
        width: innerWidth,
        domNodes: document.querySelectorAll("*").length,
        navigation: performance
          .getEntriesByType("navigation")
          .map((n: any) => ({
            domContentLoadedMs: n.domContentLoadedEventEnd,
            responseEndMs: n.responseEnd,
          })),
      })),
    );
    await page
      .getByRole("link", { name: "Conhecer a experiência", exact: true })
      .click();
    expect(new URL(page.url()).hash).toBe("#como-funciona");
    await page
      .getByRole("navigation", { name: "Site SYZIA" })
      .getByRole("link", { name: "Recursos" })
      .click();
    expect(new URL(page.url()).hash).toBe("#recursos");
  }
  await page
    .getByRole("link", { name: "Criar minha empresa", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/cadastrar/);
  await page.goto("/");
  await page
    .locator(".sy-final")
    .getByRole("link", { name: "Falar com a SYZIA" })
    .click();
  await expect(page).toHaveURL(/\/contato/);
  await page.getByLabel("Nome", { exact: true }).fill("Contato Fictício 034");
  await page.getByLabel("Empresa", { exact: true }).fill("Ateliê Fictício 034");
  await page.getByLabel("Telefone / WhatsApp").fill("11999999999");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("contato034@example.invalid");
  await page.getByLabel("Interesse").fill("Organizar atendimento e retornos.");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(
    page.getByRole("heading", { name: "Mensagem recebida." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await writeFile(
    "reports/syzia-034/browser-performance.json",
    JSON.stringify(
      {
        environment: "Vite local, sem equivalência a métricas externas",
        metrics,
        errors,
      },
      null,
      2,
    ),
  );
});
test("Planos vazios e indisponíveis não anunciam trial fixo", async ({
  page,
}) => {
  await page.route("**/rpc/acquisition_plans", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.goto("/");
  await expect(
    page.getByText("Os planos comerciais ainda estão sendo preparados."),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: "Posso testar antes de contratar?" })
    .click();
  await expect(page.locator(".sy-faq details[open]")).toContainText(
    "Não há oferta de avaliação publicada",
  );
  await page.screenshot({
    path: "reports/syzia-034/planos-vazios.png",
    fullPage: true,
  });
  await page.unroute("**/rpc/acquisition_plans");
  await page.route("**/rpc/acquisition_plans", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"message":"unavailable"}',
    }),
  );
  await page.reload();
  await expect(
    page.getByText("Não foi possível consultar os planos agora."),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: "Posso testar antes de contratar?" })
    .click();
  await expect(page.locator(".sy-faq details[open]")).toContainText(
    "Não foi possível consultar as ofertas agora.",
  );
});
