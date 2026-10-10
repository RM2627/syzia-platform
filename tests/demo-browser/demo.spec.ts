import { demoLogin as login } from "../support/demo-login";
import { test, expect } from "../support/demo-test";
// Actual supabase-js and HTTP/CORS: no route interception.
async function fit(p: any) {
  expect(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
}

for (const [label, width, height] of [
  ["desktop", 1440, 1000],
  ["tablet", 820, 1180],
  ["mobile", 390, 844],
] as const)
  test("demo HTTP pública A/B " + label, async ({ page: p }) => {
    await p.setViewportSize({ width, height });
    const errors: string[] = [];
    p.on("requestfailed", (r) => errors.push(r.url()));
    for (const [k, slug, title] of [
      ["a", "ms-auto-ficticia", "Lavagem de cuidado"],
      ["b", "horizonte-ficticio", "Consultoria de ambientes"],
    ]) {
      await p.goto("/empresa/" + slug);
      await expect(p.getByRole("heading", { name: title })).toBeVisible();
      await expect(p.locator(".c-logo")).toBeVisible();
      await p
        .locator(".c-cover")
        .evaluate((img: HTMLImageElement) => img.decode());
      await fit(p);
      await expect(p.getByText("INTERNO SECRETO")).toHaveCount(0);
      await p.screenshot({
        path: `reports/visual-phase8/public-${k}-${label}.png`,
        fullPage: true,
      });
    }
    await expect(p.locator(".consumer")).toHaveClass(/c-theme-earth/);
    expect(errors).toEqual([]);
  });
test("demo HTTP fluxo público sem Supabase real", async ({ page: p }) => {
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto("/empresa/ms-auto-ficticia");
  await p
    .getByRole("article")
    .filter({ has: p.getByRole("heading", { name: "Lavagem de cuidado" }) })
    .getByRole("button", { name: "Solicitar orçamento" })
    .click();
  await p.getByRole("button", { name: "Continuar →" }).click();
  await p.getByLabel("Qual é o modelo do carro? *").fill("Veículo fictício");
  await p.getByRole("button", { name: "Continuar →" }).click();
  await p.getByLabel("Seu nome", { exact: true }).fill("Ana Fictícia");
  await p.getByLabel("WhatsApp com DDD").fill("81999990000");
  await p.getByLabel(/Li o aviso:/).check();
  await p.getByRole("button", { name: "Continuar →" }).click();
  await p
    .getByRole("button", { name: "Enviar solicitação", exact: true })
    .click();
  await p.waitForURL(/\/acompanhar\/r_/);
  await expect(p.getByRole("heading", { name: "Olá, Ana." })).toBeVisible();
  await fit(p);
});
test("demo HTTP métricas, filtros e responsividade", async ({ page: p }) => {
  await login(p);
  const href = await p.locator(".org-card").first().getAttribute("href");
  await p.goto(href + "/metricas");
  await expect(p.getByText("Do interesse à conversão")).toBeVisible();
  await expect(
    p.getByRole("heading", { name: "Financeiro empresarial" }),
  ).toBeVisible();
  await expect(
    p
      .locator(".ds-metric")
      .filter({ hasText: "Oportunidades" })
      .first()
      .locator("strong"),
  ).not.toHaveText("0");
  for (const [label, width, height] of [
    ["desktop", 1440, 1000],
    ["tablet", 820, 1180],
    ["mobile", 390, 844],
  ] as const) {
    await p.setViewportSize({ width, height });
    await fit(p);
    await p.screenshot({
      path: `reports/visual-phase8/analytics-${label}.png`,
      fullPage: true,
    });
  }
  await p.getByLabel("Data inicial").fill("2020-01-01");
  await p.getByLabel("Data final").fill("2020-01-02");
  await expect(
    p.getByText("Um novo período, novas possibilidades"),
  ).toBeVisible();
  await expect(
    p
      .locator(".ds-metric")
      .filter({ hasText: "Taxa de conversão" })
      .locator("strong"),
  ).toHaveText("0%");
  await p.getByLabel("Origem", { exact: true }).selectOption("google");
  await expect(
    p.getByText("Um novo período, novas possibilidades"),
  ).toBeVisible();
});
test("demo HTTP plataforma e operação com permissões distintas", async ({
  page: p,
}) => {
  await login(p, "root@example.invalid");
  await p.goto("/admin/metricas");
  await expect(p.getByText("Empresas cadastradas")).toBeVisible();
  await p.screenshot({
    path: "reports/visual-phase8/platform-desktop.png",
    fullPage: true,
  });
  await p.getByRole("button", { name: "Sair", exact: true }).click();
  await login(p, "agenta@example.invalid");
  const href = await p.locator(".org-card").first().getAttribute("href");
  await p.goto(href + "/operacao");
  await expect(
    p.getByRole("heading", { name: "Acesso não disponível" }),
  ).toBeVisible();
  await expect(p.getByText("Do interesse à conversão")).toHaveCount(0);
  await p.goto(href + "/metricas");
  await expect(
    p.getByRole("heading", { name: "Acesso não disponível" }),
  ).toBeVisible();
  await expect(p.locator(".ds-metric")).toHaveCount(0);
});
test("demo HTTP painel, Central e Comercial", async ({ page: p }) => {
  await p.setViewportSize({ width: 1440, height: 1000 });
  await login(p);
  const href = await p.locator(".org-card").first().getAttribute("href");
  for (const [name, path, selector] of [
    ["company", href + "/configuracao", ".company-module"],
    ["central", "/central", ".central"],
    ["commercial", "/comercial", ".co-heading"],
  ]) {
    await p.goto(path);
    await expect(p.locator(selector)).toBeVisible();
    await expect(p.getByRole("alert")).toHaveCount(0);
    await fit(p);
    await p.screenshot({
      path: `reports/visual-phase8/${name}-desktop.png`,
      fullPage: true,
    });
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await fit(p);
  await p.screenshot({
    path: "reports/visual-phase8/commercial-mobile.png",
    fullPage: true,
  });
  await p.goto("/central");
  await expect(p.locator(".central")).toBeVisible();
  await fit(p);
  await p.screenshot({
    path: "reports/visual-phase8/central-mobile.png",
    fullPage: true,
  });
});
test("Fase 8: assinatura da empresa, limites e cancelamento reversível", async ({
  page: p,
}) => {
  await login(p);
  const href = await p.locator(".org-card").first().getAttribute("href");
  await p.goto(href + "/assinatura");
  await expect(
    p.getByRole("heading", { name: "Seu plano, sua operação." }),
  ).toBeVisible();
  await expect(
    p.getByRole("heading", { name: "Uso e capacidade" }),
  ).toBeVisible();
  for (const [label, width, height] of [
    ["desktop", 1440, 1000],
    ["notebook", 1280, 800],
    ["tablet", 820, 1180],
    ["mobile", 390, 844],
  ] as const) {
    await p.setViewportSize({ width, height });
    await fit(p);
    await p.screenshot({
      path: `reports/visual-phase8/subscription-${label}.png`,
      fullPage: true,
    });
  }
  await p
    .getByRole("button", { name: "Cancelar ao fim do período", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Confirmar alteração", exact: true })
    .click();
  await expect(
    p.getByText("Cancelamento programado para o fim do período."),
  ).toBeVisible();
  await p
    .getByRole("button", { name: "Manter assinatura", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Confirmar alteração", exact: true })
    .click();
  await expect(
    p.getByText("Cancelamento programado para o fim do período."),
  ).toHaveCount(0);
});
test("Fase 8: administração de planos, editor acessível e escopo", async ({
  page: p,
}) => {
  await login(p, "root@example.invalid");
  await p.goto("/admin/assinaturas");
  await expect(
    p.getByRole("heading", { name: "Assinaturas das empresas" }),
  ).toBeVisible();
  for (const [label, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await p.setViewportSize({ width, height });
    await fit(p);
    await p.screenshot({
      path: `reports/visual-phase8/billing-admin-${label}.png`,
      fullPage: true,
    });
  }
  await p.getByRole("button", { name: "Criar plano", exact: true }).click();
  await expect(p.getByRole("dialog")).toBeVisible();
  await p.getByLabel("Nome", { exact: true }).fill("Oferta fictícia de teste");
  await p.getByLabel("Preço fictício (R$)").fill("149.90");
  await p.getByRole("button", { name: "Salvar versão" }).click();
  await expect(p.getByRole("dialog")).toHaveCount(0);
  await expect(
    p.getByRole("heading", { name: "Oferta fictícia de teste" }),
  ).toBeVisible();
  await p
    .getByLabel("Empresa da assinatura")
    .selectOption({ label: "MS Auto Details • Fictícia" });
  await expect(
    p.getByRole("heading", { name: "Histórico da assinatura" }),
  ).toBeVisible();
  await expect(
    p.getByRole("button", { name: "Simular resultado" }),
  ).toBeVisible();
  await p.getByRole("button", { name: "Sair", exact: true }).click();
  await login(p, "adminb@example.invalid");
  await p.goto("/admin/assinaturas");
  await expect(
    p.getByRole("heading", { name: "Assinaturas das empresas" }),
  ).toHaveCount(0);
});
test("Fase 8: portfólio ampliado, teclado, touch e retorno do foco", async ({
  page: p,
}) => {
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto("/empresa/ms-auto-ficticia");
  const first = p.getByRole("button", { name: /Ampliar .* — Antes/ }).first();
  await first.click();
  const dialog = p.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Antes · 1/2")).toBeVisible();
  await p.keyboard.press("ArrowRight");
  await expect(dialog.getByText("Depois · 2/2")).toBeVisible();
  await dialog.locator("img").evaluate((target) => {
    const start = new Touch({
      identifier: 1,
      target,
      clientX: 200,
      clientY: 200,
    });
    target.dispatchEvent(
      new TouchEvent("touchstart", { bubbles: true, touches: [start] }),
    );
    const end = new Touch({
      identifier: 1,
      target,
      clientX: 100,
      clientY: 200,
    });
    target.dispatchEvent(
      new TouchEvent("touchend", { bubbles: true, changedTouches: [end] }),
    );
  });
  await expect(dialog.getByText("Antes · 1/2")).toBeVisible();
  await p.screenshot({
    path: "reports/visual-phase8/portfolio-mobile.png",
    fullPage: true,
  });
  await p.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(first).toBeFocused();
  await fit(p);
});
test("Fase 8: página pública não carrega módulos administrativos", async ({
  page: p,
}) => {
  const urls: string[] = [];
  p.on("request", (r) => urls.push(r.url()));
  await p.goto("/empresa/ms-auto-ficticia");
  await expect(
    p.getByRole("heading", { name: "Lavagem de cuidado" }),
  ).toBeVisible();
  expect(
    urls.filter((u) =>
      /FoundationApp|\/billing\/Billing|\/analytics\/Analytics|\/commercial\/Commercial|\/central\/Central\.tsx|\/consumer\/Admin/.test(
        u,
      ),
    ),
  ).toEqual([]);
});
test("Fase 8: jornada completa pública → Central → proposta → aprovação → agenda → Analytics", async ({
  page: p,
  browser,
}) => {
  p.setDefaultTimeout(10000);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto("/empresa/ms-auto-ficticia");
  await p
    .getByRole("article")
    .filter({ has: p.getByRole("heading", { name: "Lavagem de cuidado" }) })
    .getByRole("button", { name: "Solicitar orçamento" })
    .click();
  await p.getByRole("button", { name: "Continuar →" }).click();
  await p
    .getByLabel("Qual é o modelo do carro? *")
    .fill("Veículo da jornada fictícia");
  await p.getByRole("button", { name: "Continuar →" }).click();
  await p
    .getByLabel("Seu nome", { exact: true })
    .fill("Joana Jornada Fictícia");
  await p.getByLabel("WhatsApp com DDD").fill("81999990001");
  await p.getByLabel(/Li o aviso:/).check();
  await p.getByRole("button", { name: "Continuar →" }).click();
  await p
    .getByRole("button", { name: "Enviar solicitação", exact: true })
    .click();
  await p.waitForURL(/\/acompanhar\/r_/);
  await p
    .getByLabel("Sua mensagem", { exact: true })
    .fill("Gostaria de confirmar o orçamento deste serviço fictício.");
  await p.getByRole("button", { name: "Enviar ao atendimento" }).click();
  const ctx = await browser.newContext(),
    staff = await ctx.newPage();
  try {
    staff.setDefaultTimeout(10000);
    await staff.goto(p.url());
    await expect(staff.getByRole("alert")).toBeVisible();
    await expect(
      staff.getByRole("heading", { name: "Olá, Joana." }),
    ).toHaveCount(0);
    await login(staff, "agenta@example.invalid");
    const href = await staff.locator(".org-card").first().getAttribute("href");
    await staff.goto("/central");
    await staff
      .getByRole("button", { name: "Fila geral", exact: true })
      .click();
    await staff
      .getByLabel("Buscar cliente, empresa ou ticket")
      .fill("Joana Jornada");
    await expect(staff.locator(".h-ticket")).toHaveCount(1);
    await staff.locator(".h-ticket").click();
    await staff
      .getByRole("button", { name: "Assumir atendimento", exact: true })
      .click();
    await staff
      .getByLabel("Resposta pública ao cliente")
      .fill("Olá, Joana. Sua proposta está pronta para revisão.");
    await staff
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await staff.getByRole("button", { name: "Orçamento", exact: true }).click();
    await staff
      .getByLabel("Motivo da condição")
      .fill("Preço de catálogo publicado, sem alteração");
    await staff
      .getByRole("button", { name: "Enviar proposta autorizada" })
      .click();
    await expect(staff.locator(".h-quote").first()).toContainText(
      "Proposta final",
    );
    await p.reload();
    await p.getByRole("button", { name: "Aprovar esta proposta" }).click();
    await expect(p.getByText("● Proposta aprovada")).toBeVisible();
    await p
      .getByLabel("Escolha um dia")
      .fill(new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
    await p.getByRole("button", { name: "Consultar horários" }).click();
    await p.getByRole("button", { name: "08:00", exact: true }).click();
    await p.getByRole("button", { name: "Confirmar horário — 08:00" }).click();
    await expect(p.getByText("✓ Confirmado")).toBeVisible();
    await p.screenshot({
      path: "reports/visual-phase8/journey-tracking-mobile.png",
      fullPage: true,
    });
    await staff.getByRole("button", { name: "Sair", exact: true }).click();
    await login(staff);
    await staff.goto(href + "/metricas");
    await expect(staff.getByText("Do interesse à conversão")).toBeVisible();
    await expect(staff.getByRole("heading", {name:"Financeiro empresarial"})).toBeVisible();
    await staff.goto("/comercial");
    await expect(staff.locator(".co-heading")).toBeVisible();
    await expect(staff.getByRole("alert")).toHaveCount(0);
  } finally {
    await staff
      .screenshot({
        path: "reports/visual-phase8/journey-staff-last.png",
        fullPage: true,
      })
      .catch(() => {});
    await ctx.close().catch(() => {});
  }
});
