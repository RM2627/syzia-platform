import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
import type { Page, Locator } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const firstName = "Visita técnica fictícia 038",
  secondName = "Projeto complementar fictício 038";
async function rpc(page: Page, name: string, args: any = {}): Promise<any> {
  return page.evaluate(
    async ({ name, args }) => (await import("/src/api.ts")).rpc(name, args),
    { name, args },
  );
}
async function orgLogin(page: Page) {
  await demoLogin(page);
  await page
    .getByRole("link", { name: /MS Auto/ })
    .first()
    .click();
  await page.waitForURL(/\/painel\//);
  return new URL(page.url()).pathname.split("/")[2];
}
async function publish(page: Page, org: string) {
  const d = await rpc(page, "consumer_page_draft", {
    p_org: org,
    p_show_prices: true,
  });
  await rpc(page, "consumer_publish_draft", {
    p_org: org,
    p_show_prices: true,
    p_token: d.token,
    p_expected_revision: d.page_revision,
  });
}
async function setup(
  page: Page,
  org: string,
  theme = "light",
  color = "#6C4DFF",
) {
  let c = await rpc(page, "company_context", { p_org: org });
  for (const [name, price] of [
    [firstName, 12000],
    [secondName, null],
  ] as const) {
    if (c.services.some((s: any) => s.name === name)) continue;
    const id = await rpc(page, "company_save", {
      p_org: org,
      p_entity: "service",
      p_id: null,
      p_expected_revision: c.settings.revision,
      p_data: {
        name,
        description: "Serviço fictício para demonstrar o pedido integrado.",
        availability: "Condições confirmadas pela empresa.",
        price_mode: price == null ? "quote" : "fixed",
        price_cents: price,
        duration_minutes: 60,
        quotes_allowed: true,
        direct_booking: false,
      },
    });
    c = await rpc(page, "company_context", { p_org: org });
    await rpc(page, "company_save", {
      p_org: org,
      p_entity: "field",
      p_id: null,
      p_expected_revision: c.settings.revision,
      p_data: {
        service_id: id,
        label:
          name === firstName
            ? "O que precisa na visita?"
            : "O que precisa no projeto?",
        kind: "text",
        required: true,
      },
    });
    c = await rpc(page, "company_context", { p_org: org });
    await rpc(page, "company_save", {
      p_org: org,
      p_entity: "addon",
      p_id: null,
      p_expected_revision: c.settings.revision,
      p_data: {
        service_id: id,
        name:
          name === firstName
            ? "Relatório da visita"
            : "Apresentação do projeto",
        price_mode: "fixed",
        price_cents: 2000,
        duration_minutes: 15,
      },
    });
    c = await rpc(page, "company_context", { p_org: org });
  }
  const presence = await rpc(page, "consumer_presence_context", { p_org: org });
  await rpc(page, "consumer_branding_save", {
    p_org: org,
    p_revision: presence.revision,
    p_data: {
      ...presence.branding,
      theme,
      primary_color: color,
      logo: presence.branding.logo || null,
      cover: presence.branding.cover || null,
    },
  });
  await publish(page, org);
  return c;
}
const card = (page: Page, name: string) =>
  page
    .locator(".c-service")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
async function openOrder(page: Page, both = true) {
  await card(page, firstName)
    .getByRole("button", { name: "Adicionar ao pedido" })
    .click();
  if (both)
    await card(page, secondName)
      .getByRole("button", { name: "Adicionar ao pedido" })
      .click();
  await page
    .getByRole("button", { name: "Continuar pedido", exact: true })
    .click();
  const d = page.getByRole("dialog", { name: "Seu pedido", exact: true });
  await expect(d).toBeVisible();
  return d;
}
async function details(d: Locator, both = true) {
  await d.getByRole("button", { name: "Continuar →", exact: true }).click();
  await d
    .getByLabel("O que precisa na visita?")
    .fill("Avaliar o espaço fictício");
  await d.getByLabel("Relatório da visita").check();
  if (both) {
    await d
      .getByLabel("O que precisa no projeto?")
      .fill("Planejar a mudança fictícia");
    await d.getByLabel("Apresentação do projeto").check();
  }
}
async function contact(d: Locator) {
  await d.getByRole("button", { name: "Continuar →", exact: true }).click();
  await d
    .getByLabel("Seu nome", { exact: true })
    .fill("Cliente Fictício Navegador");
  await d.getByLabel("WhatsApp com DDD").fill("81999990000");
  await d.getByLabel(/Li o aviso/).check();
}
async function themeCheck(d: Locator, theme: string) {
  const result = await d.evaluate((el) => {
    const s = getComputedStyle(el),
      input = el.querySelector("input:not([type=checkbox]), select, textarea");
    const p = el.querySelector(".c-progress span");
    return {
      background: s.backgroundColor,
      color: s.color,
      input: input ? getComputedStyle(input).backgroundColor : null,
      progress: p ? getComputedStyle(p).color : null,
      width: el.getBoundingClientRect().width,
      viewport: innerWidth,
      overflow: el.scrollWidth > el.clientWidth + 1,
    };
  });
  expect(result.background).toBe(
    theme === "dark" ? "rgb(28, 29, 34)" : "rgb(255, 255, 255)",
  );
  expect(result.color).toBe(
    theme === "dark" ? "rgb(244, 244, 247)" : "rgb(32, 33, 38)",
  );
  if (result.input)
    expect(result.input).toBe(
      theme === "dark" ? "rgb(17, 18, 23)" : "rgb(247, 247, 249)",
    );
  expect(result.overflow).toBe(false);
  expect(result.width).toBeLessThan(result.viewport);
  return result;
}
for (const mobile of [false, true]) {
  test(`Senhas: login e self-service, teclado e campos independentes · ${mobile ? "celular" : "desktop"}`, async ({
    page,
  }) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 },
    );
    await page.goto("/entrar");
    const input = page.getByLabel("Senha", { exact: true });
    await input.fill("FictitiousPassword038!");
    await expect(input).toHaveAttribute("type", "password");
    await expect(input).toHaveAttribute("autocomplete", "current-password");
    await page
      .getByRole("button", { name: "Mostrar senha", exact: true })
      .focus();
    await page.keyboard.press("Space");
    await expect(input).toHaveAttribute("type", "text");
    await expect(input).toHaveValue("FictitiousPassword038!");
    await page
      .getByRole("button", { name: "Ocultar senha", exact: true })
      .click();
    await expect(input).toHaveAttribute("type", "password");
    await page.goto("/cadastrar");
    const a = page.getByLabel("Sua senha", { exact: true }),
      b = page.getByLabel("Confirmar senha", { exact: true });
    await a.fill("FictitiousPassword038!");
    await b.fill("FictitiousPassword038!");
    await page
      .getByRole("button", { name: "Mostrar senha", exact: true })
      .first()
      .click();
    await expect(a).toHaveAttribute("type", "text");
    await expect(b).toHaveAttribute("type", "password");
    await page
      .getByRole("button", { name: "Mostrar senha", exact: true })
      .click();
    await expect(b).toHaveAttribute("type", "text");
    await expect(a).toHaveAttribute("autocomplete", "new-password");
    await expect(b).toHaveAttribute("autocomplete", "new-password");
    await page.screenshot({
      path: `reports/syzia-038/senhas-${mobile ? "mobile" : "desktop"}.png`,
    });
  });
  test(`Publicação: revisão, edição posterior, prévia navegável e publicação · ${mobile ? "celular" : "desktop"}`, async ({
    page,
  }) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    const org = await orgLogin(page);
    await setup(page, org, "dark", "#F2C94C");
    await page.goto(`/painel/${org}/pagina`);
    const pub = page.getByRole("button", {
      name: "Publicar alterações",
      exact: true,
    });
    await expect(
      page.getByText("Revise a prévia para publicar", { exact: true }),
    ).toBeVisible();
    await expect(pub).toBeDisabled();
    expect(await pub.evaluate((e) => getComputedStyle(e).cursor)).toBe(
      "not-allowed",
    );
    await page
      .locator("#publicacao")
      .getByRole("button", { name: "Visualizar como cliente", exact: true })
      .click();
    await expect(
      page.getByText("✓ Prévia revisada", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(pub).toBeEnabled();
    const preview = page.getByLabel("Prévia do rascunho");
    await preview
      .locator(".c-service")
      .filter({ hasText: firstName })
      .getByRole("button", { name: "Adicionar ao pedido" })
      .click();
    await preview.getByRole("button", { name: "Continuar pedido" }).click();
    const d = page.getByRole("dialog", { name: "Seu pedido", exact: true });
    await themeCheck(d, "dark");
    await details(d, false);
    await themeCheck(d, "dark");
    await contact(d);
    await themeCheck(d, "dark");
    await d.getByRole("button", { name: "Continuar →" }).click();
    await themeCheck(d, "dark");
    await expect(
      d.getByRole("button", { name: "Enviar solicitação" }),
    ).toBeDisabled();
    await d.getByRole("button", { name: "Fechar solicitação" }).click();
    await page.getByLabel("HEX (opcional)").fill("#183C62");
    await expect(pub).toBeDisabled();
    await expect(
      page.getByText("Revise a prévia para publicar", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Salvar identidade visual" })
      .click();
    await page
      .locator("#publicacao")
      .getByRole("button", { name: "Visualizar como cliente" })
      .click();
    await expect(pub).toBeEnabled();
    await pub.click();
    await expect(
      page.getByText(
        "Alterações publicadas. Sua página já apresenta a versão revisada.",
      ),
    ).toBeVisible();
    await page.screenshot({
      path: `reports/syzia-038/publicacao-${mobile ? "mobile" : "desktop"}.png`,
    });
  });
}
for (const mobile of [false, true])
  for (const theme of ["light", "dark"])
    test(`Quatro etapas e overlays, marcas clara/escura/saturada · ${theme} · ${mobile ? "celular" : "desktop"}`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      );
      const org = await orgLogin(page);
      const visitor = await context.newPage();
      await visitor.setViewportSize(page.viewportSize()!);
      const measurements: any[] = [];
      for (const color of ["#FFFFFF", "#0B0B14", "#E10909"]) {
        await setup(page, org, theme, color);
        await visitor.goto("/empresa/ms-auto-ficticia");
        const d = await openOrder(visitor);
        measurements.push({ color, step: 0, ...(await themeCheck(d, theme)) });
        await d.getByLabel(firstName).first().uncheck();
        await d.getByLabel(secondName).first().uncheck();
        await expect(
          d.getByRole("button", { name: "Continuar →" }),
        ).toBeDisabled();
        expect(
          await d
            .getByRole("button", { name: "Continuar →" })
            .evaluate((e) => getComputedStyle(e).cursor),
        ).toBe("not-allowed");
        await d.getByLabel(firstName).first().check();
        await d.getByLabel(secondName).first().check();
        await details(d);
        measurements.push({ color, step: 1, ...(await themeCheck(d, theme)) });
        await contact(d);
        measurements.push({ color, step: 2, ...(await themeCheck(d, theme)) });
        await d.getByRole("button", { name: "Continuar →" }).click();
        measurements.push({ color, step: 3, ...(await themeCheck(d, theme)) });
        await expect(d.getByText(/item sob consulta/)).not.toHaveCount(0);
        await expect(d.getByText("Valor final", { exact: true })).toHaveCount(
          0,
        );
        if (color === "#E10909") {
          await d.screenshot({
            path: `reports/syzia-038/pedido-${theme}-${mobile ? "mobile" : "desktop"}.png`,
          });
          let release!: () => void;
          const gate = new Promise<void>((r) => {
            release = r;
          });
          await visitor.route(
            "**/rest/v1/rpc/consumer_create_multi_request",
            async (route) => {
              await gate;
              await route.abort("failed");
            },
          );
          await d
            .getByRole("button", { name: "Enviar solicitação", exact: true })
            .click();
          await expect(
            d.getByRole("button", {
              name: "Enviando com segurança…",
              exact: true,
            }),
          ).toHaveAttribute("aria-busy", "true");
          release();
          await expect(d.getByRole("alert")).toBeVisible();
          await themeCheck(d, theme);
          await visitor.unroute("**/rest/v1/rpc/consumer_create_multi_request");
        }
        await d.getByRole("button", { name: "Fechar solicitação" }).click();
        const zoom = visitor.getByRole("button", { name: /^Ampliar / }).first();
        if (await zoom.count()) {
          await zoom.click();
          const gallery = visitor.getByRole("dialog");
          await themeCheck(gallery, theme);
          await gallery
            .getByRole("button", { name: "Fechar", exact: true })
            .click();
        }
      }
      await writeFile(
        `reports/syzia-038/temas-${theme}-${mobile ? "mobile" : "desktop"}.json`,
        JSON.stringify(measurements, null, 2),
      );
      await visitor.close();
    });
test("Relações pela interface e pedido único → ajuste empresarial → recusa e aprovação pelo acompanhamento", async ({
  page,
  context,
}) => {
  const org = await orgLogin(page),
    c = await setup(page, org, "dark", "#6C4DFF");
  const first = c.services.find((s: any) => s.name === firstName),
    second = c.services.find((s: any) => s.name === secondName);
  await page.goto(`/painel/${org}/servicos`);
  await page.getByRole("button", { name: new RegExp(firstName) }).click();
  const relations = page
    .locator("section.card")
    .filter({
      has: page.getByRole("heading", { name: "Relações com outros serviços" }),
    });
  await relations
    .getByLabel("Outro serviço da empresa")
    .selectOption(second.id);
  await relations.getByLabel("Tipo de relação").selectOption("includes");
  await relations.getByRole("button", { name: "Adicionar relação" }).click();
  await expect(
    relations.getByText(`${firstName} inclui ${secondName}`, { exact: true }),
  ).toBeVisible();
  await publish(page, org);
  const visitor = await context.newPage();
  await visitor.goto("/empresa/ms-auto-ficticia");
  await card(visitor, firstName)
    .getByRole("button", { name: "Adicionar ao pedido" })
    .click();
  await card(visitor, secondName)
    .getByRole("button", { name: "Adicionar ao pedido" })
    .click();
  await expect(visitor.getByRole("alert")).toContainText("já está contemplado");
  await expect(visitor.getByLabel("Seu pedido", { exact: true })).toContainText(
    "1 serviço",
  );
  await relations.getByRole("button", { name: /^Remover relação:/ }).click();
  await expect(
    relations.getByRole("button", { name: /^Remover relação:/ }),
  ).toHaveCount(0);
  await relations
    .getByLabel("Outro serviço da empresa")
    .selectOption(second.id);
  await relations.getByLabel("Tipo de relação").selectOption("incompatible");
  await relations.getByRole("button", { name: "Adicionar relação" }).click();
  await expect(relations.getByText(/: incompatíveis/)).toBeVisible();
  await publish(page, org);
  await visitor.reload();
  await card(visitor, firstName)
    .getByRole("button", { name: "Adicionar ao pedido" })
    .click();
  await card(visitor, secondName)
    .getByRole("button", { name: "Adicionar ao pedido" })
    .click();
  await expect(visitor.getByRole("alert")).toContainText(
    "não pode ser combinado",
  );
  await relations.getByRole("button", { name: /^Remover relação:/ }).click();
  await expect(
    relations.getByRole("button", { name: /^Remover relação:/ }),
  ).toHaveCount(0);
  await relations
    .getByLabel("Outro serviço da empresa")
    .selectOption(second.id);
  await relations.getByLabel("Tipo de relação").selectOption("review");
  await relations.getByRole("button", { name: "Adicionar relação" }).click();
  await expect(relations.getByText(/: requer revisão/)).toBeVisible();
  await publish(page, org);
  await visitor.reload();
  const d = await openOrder(visitor);
  await expect(d.getByText(/Revisão necessária:/)).toBeVisible();
  await details(d);
  await contact(d);
  await d.getByRole("button", { name: "Continuar →" }).click();
  let requests = 0;
  visitor.on("request", (r) => {
    if (r.url().endsWith("/consumer_create_multi_request")) requests++;
  });
  await d
    .getByRole("button", { name: "Enviar solicitação", exact: true })
    .click();
  await visitor.waitForURL(/\/acompanhar\//);
  expect(requests).toBe(1);
  const code = new URL(visitor.url()).pathname.split("/")[2];
  await expect(
    visitor.getByRole("heading", { name: "Pedido original · 2 serviços" }),
  ).toBeVisible();
  await page.goto(`/painel/${org}/orcamentos?pedido=${code}`);
  await expect(
    page.getByRole("heading", { name: /Proposta para/ }),
  ).toBeVisible();
  await page.getByLabel(`Incluir ${secondName} na proposta`).uncheck();
  await page
    .getByLabel("Incluir Apresentação do projeto na proposta")
    .uncheck();
  await page
    .getByLabel("Explicação da proposta para o cliente")
    .fill(
      "O projeto será avaliado depois da visita. Esta proposta inclui a visita e o relatório.",
    );
  await page
    .getByRole("button", { name: "Enviar proposta final", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Proposta enviada");
  await visitor.reload();
  await expect(
    visitor.getByText(/Explicação da proposta: O projeto/),
  ).toBeVisible();
  await visitor.getByRole("button", { name: "Recusar esta proposta" }).click();
  await expect(visitor.locator(".c-status")).toContainText(/recus/i);
  await page.reload();
  await page
    .getByLabel("Explicação da proposta para o cliente")
    .fill(
      "Após sua recusa, confirmamos a visita e o relatório, conforme a nova conversa.",
    );
  await page
    .getByRole("button", { name: "Enviar proposta final", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Proposta enviada");
  await visitor.reload();
  await visitor.getByRole("button", { name: "Aprovar esta proposta" }).click();
  await expect(visitor.locator(".c-status")).toContainText(/aprov/i);
  await expect(
    visitor.getByRole("heading", { name: "Pedido original · 2 serviços" }),
  ).toBeVisible();
  await visitor.screenshot({
    path: "reports/syzia-038/acompanhamento.png",
    fullPage: true,
  });
  await visitor.close();
});
test("Primeiro acesso e redefinição mantêm senha independente da confirmação; código não recebe olho", async ({
  page,
}) => {
  await demoLogin(page, "root@example.invalid");
  const issue: any = await page.evaluate(async () =>
    (await import("/src/access/EnterpriseAccess.tsx")).accessApi(
      "/access/person",
      {
        name: "Pessoa Fictícia Senhas",
        username: "senha.038",
        email: "senha038@example.invalid",
        role: "person",
        request_key: crypto.randomUUID(),
      },
    ),
  );
  async function checkFields(issued: any) {
    await page.goto("/ativar-acesso#access=" + issued.activation_link);
    await page.getByLabel("Código temporário").fill(issued.temporary_code);
    await expect(
      page.getByRole("button", { name: "Mostrar senha" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Validar código" }).click();
    const a = page.getByLabel("Nova senha", { exact: true }),
      b = page.getByLabel("Confirmar nova senha", { exact: true });
    await a.fill("FictitiousPassword038!");
    await b.fill("FictitiousPassword038!");
    await expect(a).toHaveAttribute("type", "password");
    await expect(b).toHaveAttribute("autocomplete", "new-password");
    await page
      .getByRole("button", { name: "Mostrar senha", exact: true })
      .first()
      .click();
    await expect(a).toHaveAttribute("type", "text");
    await expect(b).toHaveAttribute("type", "password");
    await page
      .getByRole("button", { name: "Mostrar senha", exact: true })
      .click();
    await expect(b).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Ativar minha conta" }).click();
    await expect(
      page.getByRole("heading", { name: "Senha definida" }),
    ).toBeVisible();
  }
  await checkFields(issue);
  await demoLogin(page, "root@example.invalid");
  const reissued = await page.evaluate(async () => {
    const { rpc } = await import("/src/api.ts"),
      { accessApi } = await import("/src/access/EnterpriseAccess.tsx");
    const persons: any = await rpc("people_directory");
    const p = persons.find((x: any) => x.username === "senha.038");
    try {
      return await accessApi("/access/reset", { id: p.account_id });
    } catch (e: any) {
      throw new Error("reset: " + (e.message || e.code));
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkFields(reissued);
});
