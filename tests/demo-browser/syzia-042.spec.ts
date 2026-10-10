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
  extra: any = {},
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
      ...extra,
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
async function hours(page: Page, org: string, close = "15:00") {
  const c: any = await rpc(page, "company_context", { p_org: org });
  await rpc(page, "company_save", {
    p_org: org,
    p_entity: "settings",
    p_id: null,
    p_expected_revision: c.settings.revision,
    p_data: {
      business_hours: Array.from({ length: 7 }, (_, day) => ({
        day,
        open: "08:00",
        close,
      })),
    },
  });
  const a: any = await rpc(page, "consumer_admin_context", { p_org: org });
  await rpc(page, "consumer_schedule_config", {
    p_org: org,
    p_expected_revision: a.schedule.revision,
    p_rules: {
      active: true,
      lead_minutes: 0,
      horizon_days: 25,
      step_minutes: 30,
      buffer_minutes: 0,
      cancel_minutes: 0,
    },
  });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
}
test("01 Home carrega trabalho do dia, amanhã, links e ações existentes", async ({
  page,
}) => {
  const org = await admin(page);
  await expect(
    page.getByRole("heading", { name: "O que fazer hoje?", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Agenda de hoje", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Amanhã", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Precisa da sua atenção", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "+ Novo agendamento", exact: true }),
  ).toHaveAttribute("href", `/painel/${org}/novo-agendamento`);
  await page.screenshot({
    path: "reports/syzia-042/home-desktop.png",
    fullPage: true,
  });
  const a = page.locator(".op-appointment").first();
  if (await a.count()) {
    await a.click();
    await expect(
      page.getByText("FICHA DO SERVIÇO", { exact: true }),
    ).toBeVisible();
  }
  await page.goto(`/painel/${org}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.screenshot({
    path: "reports/syzia-042/home-mobile.png",
    fullPage: true,
  });
});
test("02 Falha de um bloco mantém demais; retry repete somente bloco; autorização distinta de rede", async ({
  page,
}) => {
  const org = await admin(page);
  let fail = true;
  const calls: Record<string, number> = {};
  await page.route("**/rest/v1/rpc/operations_home_section", async (route) => {
    const a = route.request().postDataJSON();
    calls[a.p_section] = (calls[a.p_section] || 0) + 1;
    if (fail && a.p_section === "attention")
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ code: "42501", message: "access_denied" }),
      });
    else await route.continue();
  });
  await page.reload();
  const attention = page.getByRole("region", {
    name: "Precisa da sua atenção",
  });
  await expect(attention).toContainText(
    "Seu acesso a este bloco não está autorizado",
  );
  await expect(
    page.getByRole("region", { name: "Agenda de hoje" }),
  ).not.toContainText("não está autorizado");
  const before = { ...calls };
  await page.screenshot({
    path: "reports/syzia-042/home-erro-local.png",
    fullPage: true,
  });
  fail = false;
  await attention.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(attention).not.toContainText("não está autorizado");
  expect(calls.header).toBe(before.header);
  expect(calls.agenda).toBe(before.agenda);
  expect(calls.attention).toBe(before.attention + 1);
  await page.unroute("**/rest/v1/rpc/operations_home_section");
  await page.route("**/rest/v1/rpc/operations_home_section", async (route) => {
    if (route.request().postDataJSON().p_section === "attention")
      await route.abort("internetdisconnected");
    else await route.continue();
  });
  await page.reload();
  await expect(attention).toContainText("Não foi possível conectar");
  await expect(
    page.getByRole("heading", { name: "O que fazer hoje?" }),
  ).toBeVisible();
});
test("03 Equipe SYZIA separada, sem controles globais; permissões locais abrem pessoa", async ({
  page,
}) => {
  const org = await admin(page);
  await page.goto(`/painel/${org}/acessos`);
  const shared = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Equipe SYZIA · Atendimento compartilhado",
        exact: true,
      }),
    })
    .last();
  await expect(shared).toBeVisible();
  await expect(
    shared.getByRole("button", { name: /Gerar|Desativar|Editar acesso/ }),
  ).toHaveCount(0);
  await expect(shared).toContainText("Escopo: esta empresa");
  await page.screenshot({
    path: "reports/syzia-042/equipe-compartilhada.png",
    fullPage: true,
  });
  await shared
    .getByRole("link", { name: "Revisar permissões nesta empresa" })
    .first()
    .click();
  await expect(page).toHaveURL(/permissoes\?pessoa=/);
  await expect(
    page.getByRole("heading", { name: /Permissões/ }).first(),
  ).toBeVisible();
});
test("04 Serviço contínuo de 6h30 sem janela explica e busca próximos horários", async ({
  page,
  browser,
}) => {
  const org = await admin(page);
  await hours(page, org, "14:00");
  const s = await setup(page, org, "contínuo 042", "fixed", "light", {
    duration_minutes: 390,
    execution_mode: "continuous",
  });
  const v = await browser.newPage();
  await start(v, s.name);
  const d = await details(v);
  await d.getByLabel("Dia desejado", { exact: true }).fill(day());
  await d
    .getByRole("button", { name: "Consultar disponibilidade", exact: true })
    .click();
  await expect(
    d.getByText(/precisa de aproximadamente 6h30 e não cabe/),
  ).toBeVisible();
  await expect(
    d.getByRole("button", { name: "Ver próximos horários compatíveis" }),
  ).toBeVisible();
  await d.screenshot({ path: "reports/syzia-042/continuo-sem-janela.png" });
  await d
    .getByRole("button", { name: "Ver próximos horários compatíveis" })
    .click();
  await expect(d.getByText(/não cabe/)).toBeVisible();
  await v.close();
});
test("05 Divisível reserva 2 períodos; consumidor e Agenda mostram mesma execução; remarcação e cancelamento", async ({
  page,
  browser,
}) => {
  const org = await admin(page);
  await hours(page, org);
  const s = await setup(page, org, "divisível 042", "fixed", "dark", {
    duration_minutes: 600,
    execution_mode: "split",
    execution_max_periods: 3,
  });
  const v = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await start(v, s.name);
  await details(v);
  await schedule(v);
  const d = v.getByRole("dialog");
  await expect(d.getByLabel("Períodos do atendimento")).toContainText(
    "Parte 2",
  );
  await d.screenshot({
    path: "reports/syzia-042/divisivel-revisao-mobile.png",
  });
  await d
    .getByRole("button", { name: "Confirmar e reservar", exact: true })
    .click();
  await v.waitForURL(/\/acompanhar\/r_/);
  await expect(v.getByLabel("Períodos do atendimento")).toContainText(
    "Parte 2",
  );
  await noOverflow(v);
  await v.screenshot({
    path: "reports/syzia-042/divisivel-acompanhamento.png",
    fullPage: true,
  });
  const code = v.url().split("/").at(-1)!;
  const context: any = await crpc(v, "consumer_request_context", {
    p_code: code,
  });
  expect(
    context.appointments.filter((a: any) => a.state === "confirmed"),
  ).toHaveLength(2);
  const agenda: any = await rpc(page, "operations_agenda", {
    p_org: org,
    p_from: day(),
    p_to: new Date(Date.parse(day() + "T12:00Z") + 10 * 86400000)
      .toISOString()
      .slice(0, 10),
  });
  const a = agenda.appointments.find((a: any) => a.request_code === code);
  await page.goto(`/painel/${org}/agenda?ficha=${a.id}`);
  await expect(
    page.getByRole("heading", { name: "Períodos deste atendimento" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remarcar este período" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Replanejar atendimento completo" }),
  ).toBeVisible();
  await page.screenshot({
    path: "reports/syzia-042/divisivel-ficha.png",
    fullPage: true,
  });
  await v
    .getByRole("button", { name: "Cancelar atendimento completo" })
    .click();
  await expect(v.getByText("✓ Confirmado", { exact: false })).toHaveCount(0);
  expect(
    (
      await crpc(v, "consumer_request_context", { p_code: code })
    ).appointments.filter((a: any) => a.state === "confirmed"),
  ).toHaveLength(0);
  await v.close();
});
test("06 Calculadora explica bloqueio, exibe duração, prévia e após aprovação remove texto obsoleto", async ({
  page,
  browser,
}) => {
  const org = await admin(page);
  await hours(page, org);
  const s = await setup(page, org, "avaliação 042", "quote", "light");
  const v = await browser.newPage();
  await start(v, s.name);
  await details(v);
  await schedule(v);
  await v
    .getByRole("dialog")
    .getByRole("button", { name: "Enviar para avaliação", exact: true })
    .click();
  await v.waitForURL(/\/acompanhar\/r_/);
  const code = v.url().split("/").at(-1)!;
  await page.goto(`/painel/${org}/orcamentos?pedido=${code}`);
  await page
    .getByLabel(/Valor final de/)
    .first()
    .fill("150");
  await page
    .getByLabel(/Duração de/)
    .first()
    .fill("600");
  await expect(
    page.getByRole("button", { name: "Enviar proposta final", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Explique as alterações na proposta antes de enviar.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel(/Explicação da proposta para o cliente/)
    .fill("Valor e duração definidos após avaliação do pedido fictício.");
  await page.getByRole("button", { name: "Visualizar como cliente" }).click();
  await expect(page.getByLabel("Prévia como cliente")).toContainText("10h");
  await page.screenshot({
    path: "reports/syzia-042/proposta-validacao.png",
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
  await v.reload();
  await v
    .getByRole("button", { name: "Aprovar esta proposta", exact: true })
    .click();
  await expect(
    v.getByText("Proposta aprovada. Escolha seu horário.", { exact: true }),
  ).toBeVisible();
  await expect(
    v.getByText("Serviços sob avaliação precisam de proposta aprovada.", {
      exact: false,
    }),
  ).toHaveCount(0);
  await v.screenshot({
    path: "reports/syzia-042/proposta-aprovada-agenda.png",
    fullPage: true,
  });
  await page.goto(`/painel/${org}`);
  const attention = page.getByRole("region", {
    name: "Precisa da sua atenção",
  });
  const link = attention
    .getByRole("link")
    .filter({ hasText: "Proposta aprovada · falta agendar" })
    .filter({ hasText: "Cliente Fictício 041" })
    .last();
  if (await attention.getByRole("button", { name: /Ver todas/ }).count())
    await attention.getByRole("button", { name: /Ver todas/ }).click();
  await link.click();
  await expect(
    page.getByRole("heading", { name: "Concluir agendamento", exact: true }),
  ).toBeVisible();
  await v.close();
});
test("07 Estados vazios localizados e link de retorno abre oportunidade correta", async ({
  page,
}) => {
  const org = await admin(page);
  const attention = page.getByRole("region", {
    name: "Precisa da sua atenção",
  });
  if (await attention.getByRole("button", { name: /Ver todas/ }).count())
    await attention.getByRole("button", { name: /Ver todas/ }).click();
  const followup = attention
    .getByRole("link")
    .filter({ hasText: "Retorno pendente" })
    .first();
  await expect(followup).toBeVisible();
  const href = await followup.getAttribute("href");
  await followup.click();
  await expect(page).toHaveURL(new RegExp("comercial\\?op="));
  await expect(page.locator(".co-layout")).toHaveClass(/has-detail/);
  expect(href).toContain("/comercial?op=");
  await page.route("**/rest/v1/rpc/operations_home_section", async (route) => {
    const section = route.request().postDataJSON().p_section;
    const body =
      section === "agenda"
        ? {
            today: new Date().toISOString().slice(0, 10),
            available: true,
            appointments: [],
            next: null,
          }
        : section === "attention"
          ? { items: [] }
          : null;
    if (body)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    else await route.continue();
  });
  await page.goto(`/painel/${org}`);
  await expect(
    page.getByText("Nenhum atendimento agendado para hoje.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Nenhuma tarefa aguardando sua ação neste momento.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "+ Novo cliente", exact: true }),
  ).toBeVisible();
});
