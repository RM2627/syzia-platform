import sharp from "sharp";
import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
import type { Page } from "@playwright/test";
const day = () =>
  new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
async function rpc(page: Page, name: string, args: any = {}) {
  return page.evaluate(
    async ({ name, args }) => (await import("/src/api.ts")).rpc(name, args),
    { name, args },
  );
}
async function crpc(page: Page, name: string, args: any = {}) {
  return page.evaluate(
    async ({ name, args }) => {
      const c = await import("/src/consumer/api.ts");
      await c.ensureConsumer();
      return c.crpc(name, args);
    },
    { name, args },
  );
}
async function admin(page: Page) {
  await demoLogin(page);
  const ctx: any = await rpc(page, "foundation_context");
  const o = ctx.organizations.find((o: any) => o.slug === "ms-auto-ficticia");
  await page.goto("/painel/" + o.id);
  return o.id;
}
async function setup(
  page: Page,
  id: string,
  suffix: string,
  mode = "fixed",
  theme = "dark",
) {
  let context: any = await rpc(page, "company_context", { p_org: id });
  const service = await rpc(page, "company_save", {
    p_org: id,
    p_entity: "service",
    p_id: null,
    p_expected_revision: context.settings.revision,
    p_data: {
      name: "Serviço teste " + suffix,
      description: "Descrição clara para uma contratação simples.",
      availability: "Atendimento com horário escolhido pelo cliente.",
      price_mode: mode,
      price_cents: mode === "quote" ? null : 12000,
      duration_minutes: 60,
      contract_mode: mode === "fixed" ? "immediate" : "evaluation",
      photo_policy: "optional",
      quotes_allowed: true,
    },
  });
  let presence: any = await rpc(page, "consumer_presence_context", {
    p_org: id,
  });
  await rpc(page, "consumer_branding_save", {
    p_org: id,
    p_revision: presence.revision,
    p_data: { ...presence.branding, theme, primary_color: "#C52831" },
  });
  const d: any = await rpc(page, "consumer_page_draft", {
    p_org: id,
    p_show_prices: true,
  });
  await rpc(page, "consumer_publish_draft", {
    p_org: id,
    p_token: d.token,
    p_show_prices: true,
    p_expected_revision: d.page_revision,
  });
  return { id: service, name: "Serviço teste " + suffix };
}
async function start(page: Page, name: string) {
  await page.goto("/empresa/ms-auto-ficticia");
  const card = page
    .locator(".c-service")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await card.getByRole("button", { name: "Adicionar ao pedido" }).click();
  await page
    .getByRole("button", { name: "Continuar pedido", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function details(page: Page) {
  const d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Continuar →", exact: true }).click();
  await d.getByRole("button", { name: "Continuar →", exact: true }).click();
  await d.getByLabel("Seu nome", { exact: true }).fill("Cliente Fictício 041");
  await d.getByLabel("WhatsApp com DDD", { exact: true }).fill("81999990000");
  await d.getByRole("checkbox", { name: /Entendo|Li|Concordo/ }).check();
  await d.getByRole("button", { name: "Continuar →", exact: true }).click();
  return d;
}
async function schedule(page: Page) {
  const d = page.getByRole("dialog");
  await d.getByLabel("Dia desejado", { exact: true }).fill(day());
  await d
    .getByRole("button", { name: "Consultar disponibilidade", exact: true })
    .click();
  await expect(
    d
      .getByRole("group", { name: "Horários disponíveis" })
      .getByRole("button")
      .first(),
  ).toBeVisible();
  await d
    .getByRole("group", { name: "Horários disponíveis" })
    .getByRole("button")
    .first()
    .click();
  await d.getByRole("button", { name: "Continuar →", exact: true }).click();
  return d;
}
async function proposal(page: Page, org: string, code: string) {
  await page.goto("/painel/" + org + "/orcamentos?pedido=" + code);
  await expect(
    page.getByRole("heading", { name: "Preparar proposta", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel(/Valor final de/)
    .first()
    .fill("150");
  await page
    .getByRole("textbox", { name: /^Explicação da proposta para o cliente(?: \*| \(opcional\))?$/ })
    .fill("Valor final confirmado após avaliação.");
  await page
    .getByRole("button", { name: "Visualizar como cliente", exact: true })
    .click();
  await expect(page.getByLabel("Prévia como cliente")).toContainText("R$");
  await page.screenshot({
    path: "reports/syzia-041/calculadora.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Enviar proposta final", exact: true })
    .click();
  await expect(
    page.getByText(
      "Proposta enviada. O cliente recebe esta versão no acompanhamento.",
      { exact: true },
    ),
  ).toBeVisible();
}

test("01 Fluxo A: contratação direta pelo formulário, reserva e Agenda sem atendente", async ({
  page,
  browser,
}) => {
  const org = await admin(page),
    s = await setup(page, org, "direto");
  const visitor = await browser.newPage();
  await start(visitor, s.name);
  await details(visitor);
  await schedule(visitor);
  await visitor
    .getByRole("button", { name: "Confirmar e reservar", exact: true })
    .click();
  await visitor.waitForURL(/\/acompanhar\/r_/);
  await expect(
    visitor.getByText("Horário confirmado", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    visitor.getByRole("button", { name: "Aprovar esta proposta" }),
  ).toHaveCount(0);
  await visitor.screenshot({
    path: "reports/syzia-041/fluxo-a-direto.png",
    fullPage: true,
  });
  const code = visitor.url().split("/").at(-1)!;
  const d: any = await crpc(visitor, "consumer_request_context", {
    p_code: code,
  });
  expect(d.journey).toBe("direct");
  expect(d.appointments).toHaveLength(1);
  await page.goto("/painel/" + org + "/agenda");
  await expect(
    page.getByRole("heading", { name: /Agenda/ }).first(),
  ).toBeVisible();
  await visitor.close();
});

test("02 Fluxo B: horário pretendido, proposta com prévia e aprovação com reserva", async ({
  page,
  browser,
}) => {
  const org = await admin(page),
    s = await setup(page, org, "avaliação", "quote", "light");
  const visitor = await browser.newPage();
  await start(visitor, s.name);
  await details(visitor);
  await schedule(visitor);
  await visitor
    .getByRole("button", { name: "Enviar para avaliação", exact: true })
    .click();
  await visitor.waitForURL(/\/acompanhar\/r_/);
  await expect(
    visitor.getByText("Horário escolhido — aguardando confirmação", {
      exact: false,
    }),
  ).toBeVisible();
  const code = visitor.url().split("/").at(-1)!;
  let d: any = await crpc(visitor, "consumer_request_context", {
    p_code: code,
  });
  expect(d.appointments).toHaveLength(0);
  await visitor.screenshot({
    path: "reports/syzia-041/fluxo-b-pretendido.png",
    fullPage: true,
  });
  await proposal(page, org, code);
  await visitor.reload();
  await visitor
    .getByRole("button", { name: "Aprovar esta proposta", exact: true })
    .click();
  await expect(
    visitor.getByText("✓ Confirmado", { exact: false }),
  ).toBeVisible();
  d = await crpc(visitor, "consumer_request_context", { p_code: code });
  expect(d.accepted_version).toBeTruthy();
  expect(d.appointments).toHaveLength(1);
  await visitor.screenshot({
    path: "reports/syzia-041/fluxo-b-aprovado.png",
    fullPage: true,
  });
  await visitor.close();
});

test("03 Fluxo C: FAQ sem ticket, ajuda contextual, resposta e retomada no mesmo pedido", async ({
  page,
  browser,
}) => {
  const org = await admin(page),
    s = await setup(page, org, "ajuda");
  const visitor = await browser.newPage();
  await start(visitor, s.name);
  const d = visitor.getByRole("dialog");
  await d.getByText("Dúvidas sobre este serviço?", { exact: true }).click();
  await expect(
    d
      .locator(".c-service-help")
      .getByText("Descrição clara para uma contratação simples.", {
        exact: true,
      }),
  ).toBeVisible();
  expect(await crpc(visitor, "consumer_my_requests")).toEqual([]);
  await d
    .getByRole("button", { name: "Falar com atendimento", exact: true })
    .click();
  await d
    .getByLabel("Nome para atendimento", { exact: true })
    .fill("Cliente Ajuda Fictício");
  await d
    .getByLabel("WhatsApp para atendimento", { exact: true })
    .fill("81999992222");
  await d
    .getByRole("checkbox", { name: /Autorizo o uso destes dados/ })
    .check();
  await d
    .getByRole("button", { name: "Abrir atendimento contextual", exact: true })
    .click();
  await expect(
    d.getByRole("heading", { name: "Converse com o atendimento" }),
  ).toBeVisible();
  await d
    .getByLabel("Sua mensagem", { exact: true })
    .fill("Preciso confirmar como me preparar.");
  await d
    .getByRole("button", { name: "Enviar ao atendimento", exact: true })
    .click();
  await expect(
    d.getByText("Preciso confirmar como me preparar.", { exact: true }),
  ).toBeVisible();
  const requests: any = await crpc(visitor, "consumer_my_requests");
  const request = requests[0].code;
  const thread: any = await crpc(visitor, "central_consumer_thread", {
    p_request: request,
  });
  let context: any = await rpc(page, "central_context", {
    p_code: thread.code,
  });
  await rpc(page, "central_act", {
    p_code: thread.code,
    p_revision: context.ticket.revision,
    p_action: "message",
    p_data: { body: "Você pode seguir as orientações descritas no serviço." },
    p_key: crypto.randomUUID(),
  });
  await d
    .getByRole("button", { name: "Atualizar conversa", exact: true })
    .click();
  await expect(
    d.getByText("Você pode seguir as orientações descritas no serviço.", {
      exact: true,
    }),
  ).toBeVisible();
  await visitor.screenshot({
    path: "reports/syzia-041/fluxo-c-ajuda.png",
    fullPage: true,
  });
  await d
    .getByRole("button", { name: "Continuar minha solicitação", exact: true })
    .click();
  await details(visitor);
  await schedule(visitor);
  await d
    .getByRole("button", { name: "Confirmar e reservar", exact: true })
    .click();
  await visitor.waitForURL("/acompanhar/" + request);
  const after: any = await crpc(visitor, "consumer_my_requests");
  expect(after).toHaveLength(1);
  await visitor.close();
});

test("04 Mobile: avaliação, revisão e acompanhamento sem overflow", async ({
  page,
  browser,
}) => {
  const org = await admin(page),
    s = await setup(page, org, "mobile", "from");
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await start(mobile, s.name);
  await details(mobile);
  await schedule(mobile);
  await mobile
    .getByRole("dialog")
    .screenshot({ path: "reports/syzia-041/mobile-revisao.png" });
  expect(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mobile
    .getByRole("button", { name: "Enviar para avaliação", exact: true })
    .click();
  await mobile.waitForURL(/\/acompanhar\//);
  await mobile.screenshot({
    path: "reports/syzia-041/mobile-acompanhamento.png",
    fullPage: true,
  });
  expect(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mobile.close();
});

test("05 Navegação global possui uma entrada Equipe SYZIA; operação antiga preservada com outro papel", async ({
  page,
}) => {
  await demoLogin(page, "root@example.invalid");
  const platformMenu = page.getByRole("button", { name: "Plataforma SYZIA", exact: true });
  if (await platformMenu.getAttribute("aria-expanded") === "false") await platformMenu.click();
  await expect(
    page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("link", { name: "Equipe SYZIA", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("link", { name: "Equipe SYZIA", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Equipe SYZIA", exact: true }),
  ).toBeVisible();
  await page.goto("/operacao-syzia");
  await expect(
    page.getByRole("heading", { name: "Minha operação", exact: true }),
  ).toBeVisible();
});

test("06 Central abre calculadora em área ampla e solicita fotos pelo acompanhamento", async ({
  page,
  browser,
}) => {
  const org = await admin(page),
    s = await setup(page, org, "central", "quote");
  const visitor = await browser.newPage();
  await start(visitor, s.name);
  await details(visitor);
  await schedule(visitor);
  await visitor
    .getByRole("button", { name: "Enviar para avaliação", exact: true })
    .click();
  await visitor.waitForURL(/\/acompanhar\//);
  const code = visitor.url().split("/").at(-1)!,
    thread: any = await crpc(visitor, "central_consumer_thread", {
      p_request: code,
    });
  await page.goto("/central?ticket=" + thread.code);
  await expect(
    page.getByRole("button", { name: "Orçamento", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Orçamento", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Preparar proposta", exact: true }),
  ).toBeVisible();
  await page.getByText("Faltam fotos para avaliar?", { exact: true }).click();
  await page
    .getByLabel("O que precisa ser fotografado?", { exact: true })
    .fill("Envie uma imagem de cada lado do objeto.");
  await page
    .getByRole("button", {
      name: "Solicitar fotos pelo acompanhamento",
      exact: true,
    })
    .click();
  await visitor.reload();
  await expect(
    visitor.getByText("Fotos necessárias", { exact: true }),
  ).toBeVisible();
  await expect(
    visitor.getByText("Envie uma imagem de cada lado do objeto.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "reports/syzia-041/central-orcamento.png",
    fullPage: true,
  });
  await expect(
    page.getByText(
      "Valores a definir · preencha todos os itens para calcular o total.",
      { exact: true },
    ),
  ).toBeVisible();
  const buffer = await sharp({
    create: { width: 200, height: 200, channels: 3, background: "#777777" },
  })
    .png()
    .toBuffer();
  await visitor
    .getByLabel("Enviar fotos pelo acompanhamento", { exact: true })
    .setInputFiles({
      name: "foto-ficticia.png",
      mimeType: "image/png",
      buffer,
    });
  await expect(
    visitor.getByText("Fotos enviadas · aguardando análise da empresa.", {
      exact: true,
    }),
  ).toBeVisible();
  const updated: any = await crpc(visitor, "consumer_request_context", {
    p_code: code,
  });
  expect(updated.photos_received).toBe(true);
  expect(updated.attachments).toHaveLength(1);
  await visitor.screenshot({
    path: "reports/syzia-041/fotos-acompanhamento.png",
    fullPage: true,
  });
  await visitor.close();
});

test("07 Aprovação com horário ocupado oferece novas opções e mantém a mesma proposta", async ({
  page,
  browser,
}) => {
  const org = await admin(page),
    review = await setup(page, org, "conflito-avaliação", "quote"),
    direct = await setup(page, org, "conflito-direto");
  const visitor = await browser.newPage();
  await start(visitor, review.name);
  await details(visitor);
  await schedule(visitor);
  await visitor
    .getByRole("button", { name: "Enviar para avaliação", exact: true })
    .click();
  await visitor.waitForURL(/\/acompanhar\//);
  const code = visitor.url().split("/").at(-1)!;
  const before: any = await crpc(visitor, "consumer_request_context", {
    p_code: code,
  });
  const competitor = await browser.newPage();
  await start(competitor, direct.name);
  await details(competitor);
  await schedule(competitor);
  await competitor
    .getByRole("button", { name: "Confirmar e reservar", exact: true })
    .click();
  await competitor.waitForURL(/\/acompanhar\//);
  const other: any = await crpc(competitor, "consumer_request_context", {
    p_code: competitor.url().split("/").at(-1),
  });
  expect(new Date(other.appointments[0].starts_at).getTime()).toBe(
    new Date(before.desired_start).getTime(),
  );
  await proposal(page, org, code);
  await visitor.reload();
  await visitor
    .getByRole("button", { name: "Aprovar esta proposta", exact: true })
    .click();
  await expect(
    visitor.locator(".c-booking .c-slots button").first(),
  ).toBeVisible();
  const approved: any = await crpc(visitor, "consumer_request_context", {
    p_code: code,
  });
  expect(approved.state).toBe("approved");
  expect(approved.appointments).toHaveLength(0);
  expect(approved.accepted_version).toBeTruthy();
  await visitor.screenshot({
    path: "reports/syzia-041/horario-indisponivel.png",
    fullPage: true,
  });
  await visitor.locator(".c-booking .c-slots button").first().click();
  await visitor.getByRole("button", { name: /^Confirmar horário —/ }).click();
  await expect(
    visitor.getByText("✓ Confirmado", { exact: false }),
  ).toBeVisible();
  const after: any = await crpc(visitor, "consumer_request_context", {
    p_code: code,
  });
  expect(after.accepted_version).toBe(approved.accepted_version);
  expect(after.versions).toHaveLength(approved.versions.length);
  expect(after.appointments).toHaveLength(1);
  await visitor.close();
  await competitor.close();
});
