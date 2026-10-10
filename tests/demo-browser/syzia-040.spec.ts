import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
import type { Page } from "@playwright/test";
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
async function org(page: Page) {
  const ctx: any = await rpc(page, "foundation_context");
  return ctx.organizations.find((o: any) => o.slug === "ms-auto-ficticia").id;
}
const base = {
  name: "Plano público 040",
  description: "Oferta fictícia de teste local",
  price_cents: 14990,
  interval_months: 1,
  trial_days: 7,
  active: true,
  available: true,
  site_visible: true,
  self_service: true,
  self_service_trial: true,
  position: 12,
  member_limit: 3,
  service_limit: null,
  request_limit: null,
  ticket_limit: null,
  followup_limit: null,
  quota_semantics: 2,
  capabilities: {
    software: true,
    finance: true,
    analytics: true,
    commercial_followups: true,
    human_support: false,
  },
};
async function plan(page: Page, patch: any = {}) {
  const id = await rpc(page, "billing_plan_save", {
    p_id: null,
    p_revision: 0,
    p_data: {
      ...base,
      ...patch,
      capabilities: { ...base.capabilities, ...patch.capabilities },
    },
  });
  const o: any = await rpc(page, "billing_admin_overview");
  return o.plan_versions.find((v: any) => v.plan_id === id);
}
async function apply(page: Page, id: string, version: string | null) {
  const ctx: any = await rpc(page, "billing_context", { p_org: id });
  return rpc(page, "billing_homologation_set", {
    p_org: id,
    p_version: version,
    p_expected: ctx.homologation?.id || null,
    p_reason: "Teste local 040 pelo administrador real",
    p_key: crypto.randomUUID(),
  });
}
async function publish(page: Page, id: string, theme = "dark") {
  let p: any = await rpc(page, "consumer_presence_context", { p_org: id });
  await rpc(page, "consumer_branding_save", {
    p_org: id,
    p_revision: p.revision,
    p_data: { ...p.branding, theme, primary_color: "#C52831" },
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
}
async function request(page: Page, mode = "quote") {
  await page.goto("/empresa/ms-auto-ficticia");
  const p: any = await crpc(page, "consumer_public_page", {
      p_slug: "ms-auto-ficticia",
    }),
    s = p.services.find((s: any) => s.price_mode === mode);
  const q: any = await crpc(page, "consumer_create_request", {
    p_slug: p.slug,
    p_revision: p.revision,
    p_service: s.code,
    p_addons: [],
    p_answers: Object.fromEntries(
      s.questions
        .filter((q: any) => q.required)
        .map((q: any) => [q.code, "Dado fictício"]),
    ),
    p_customer: {
      name: "Cliente Navegador Fictício",
      whatsapp: "81999992222",
      accepted_notice: true,
      notice_version: "consumer-v1",
    },
    p_notes: "Teste de continuidade 040",
    p_contact: false,
    p_expected_cents: mode === "quote" ? null : s.price_cents,
    p_key: crypto.randomUUID(),
  });
  await crpc(page, "consumer_submit_request", {
    p_code: q.code,
    p_attachment_count: 0,
    p_key: crypto.randomUUID(),
  });
  return q;
}
test("01 Planos configurados: 7 dias grátis, destaque exclusivo, foco e reduz movimento", async ({
  page,
}) => {
  await demoLogin(page, "root@example.invalid");
  const v: any = await plan(page);
  const all: any = await rpc(page, "acquisition_plans");
  await rpc(page, "billing_plan_feature", {
    p_plan: v.plan_id,
    p_label: "Mais recomendado",
    p_previous: all.find((p: any) => p.featured)?.id || null,
  });
  await page.goto("/planos");
  const card = page.locator(".sy-plan-grid article").filter({
    has: page.getByRole("heading", { name: base.name, exact: true }),
  });
  await expect(card).toContainText("7 dias grátis");
  await expect(card).toContainText("Mais recomendado");
  expect(await page.locator(".sy-featured").count()).toBe(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await card.hover();
  expect(await card.evaluate((e) => getComputedStyle(e).transform)).toBe(
    "none",
  );
  await card.getByRole("link").first().focus();
  expect(await card.evaluate((e) => getComputedStyle(e).boxShadow)).not.toBe(
    "none",
  );
  await page.screenshot({
    path: "reports/syzia-040/planos.png",
    fullPage: true,
  });
});
test("02 Homologação pelo SuperAdmin e quatro planos por UI/rotas na sessão do ADM real", async ({
  page,
  context,
  browser,
}) => {
  await demoLogin(page, "root@example.invalid");
  const id = await org(page),
    other = await browser.newContext({ locale: "pt-BR" }),
    admin = await other.newPage();
  await demoLogin(admin);
  const variants = [
    ["Essencial", 1, false, false],
    ["Profissional", 3, true, false],
    ["Equipe", 8, true, false],
    ["Assistido", 5, true, true],
  ];
  for (const [name, limit, advanced, human] of variants) {
    const v: any = await plan(page, {
      name: name + " 040 UI",
      member_limit: limit,
      capabilities: {
        finance: advanced,
        analytics: advanced,
        commercial_followups: advanced,
        human_support: human,
      },
    });
    if (name === "Essencial") {
      await page.goto("/admin/assinaturas?empresa=" + id);
      const panel = page.getByRole("region", {
        name: "Plano para homologação",
      });
      await panel.getByLabel("Versão do plano").selectOption(v.id);
      await panel
        .getByLabel("Motivo da alteração")
        .fill("Validar o plano na empresa com seu administrador real");
      await panel
        .getByRole("button", {
          name: "Aplicar plano para homologação",
          exact: true,
        })
        .click();
      await expect(panel).toContainText("PLANO APLICADO PARA HOMOLOGAÇÃO");
    } else await apply(page, id, v.id);
    await admin.goto("/painel/" + id);
    await expect(
      admin
        .getByText(
          "PLANO APLICADO PARA HOMOLOGAÇÃO — não representa assinatura ou pagamento.",
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    await admin.goto("/painel/" + id + "/financeiro");
    if (advanced)
      await expect(
        admin.getByRole("heading", { name: "Acesso não disponível" }),
      ).toHaveCount(0);
    else
      await expect(
        admin.getByRole("heading", { name: "Acesso não disponível" }),
      ).toBeVisible();
    await admin.goto("/painel/" + id + "/metricas");
    if (advanced)
      await expect(
        admin.getByRole("heading", { name: "Acesso não disponível" }),
      ).toHaveCount(0);
    else
      await expect(
        admin.getByRole("heading", { name: "Acesso não disponível" }),
      ).toBeVisible();
    await admin.goto("/painel/" + id + "/comercial");
    if (!advanced)
      await expect(
        admin.getByRole("heading", { name: "Acesso não disponível" }),
      ).toBeVisible();
    await admin.goto("/painel/" + id + "/atendimento");
    await expect(
      admin.getByRole("heading", { name: "Acesso não disponível" }),
    ).toHaveCount(0);
  }
  await apply(page, id, null);
  await admin.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(admin.locator(".b-homologation-banner")).toHaveCount(0);
  await other.close();
});
test("03 Equipe SYZIA: provisionar, editar identidade, reemitir, suspender e separar vínculos", async ({
  page,
}) => {
  await demoLogin(page, "root@example.invalid");
  await page.goto("/admin/equipe");
  await expect(
    page.getByRole("heading", { name: "Equipe SYZIA", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Novo integrante SYZIA" }).click();
  await page
    .getByLabel("Nome completo", { exact: true })
    .fill("Pessoa Global Fictícia");
  await page.getByLabel("Username", { exact: true }).fill("pessoa.global040");
  await page
    .getByLabel("E-mail de contato", { exact: true })
    .fill("pessoa040@example.invalid");
  await page.getByRole("button", { name: "Criar pessoa", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Instruções de acesso" }),
  ).toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: "Pessoa Global Fictícia" })
    .getByRole("button", { name: "Abrir ficha" })
    .click();
  const card = page.getByRole("region", { name: "Ficha da pessoa" });
  await expect(
    card.getByRole("button", { name: "Vincular pessoa" }),
  ).toHaveCount(0);
  await card.getByText("Editar identidade global", { exact: true }).click();
  await card
    .getByLabel("Nome completo", { exact: true })
    .fill("Pessoa Global Revisada");
  await card.getByRole("button", { name: "Salvar identidade" }).click();
  await expect(
    card.getByRole("heading", { name: "Pessoa Global Revisada" }),
  ).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await card
    .getByRole("button", { name: "Gerar novo código de primeiro acesso" })
    .click();
  await expect(
    page.getByRole("region", { name: "Instruções de acesso" }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Desativar identidade", exact: true })
    .click();
  await expect(
    card.getByRole("button", { name: "Reativar identidade", exact: true }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Reativar identidade", exact: true })
    .click();
  await page.screenshot({
    path: "reports/syzia-040/equipe.png",
    fullPage: true,
  });
});
test("04 Consumidor: marca publicada escura/clara, proposta pendente oculta agenda e privacidade", async ({
  page,
  browser,
}) => {
  await demoLogin(page);
  const id = await org(page);
  await publish(page, id, "dark");
  const visitorContext = await browser.newContext({ locale: "pt-BR" }),
    visitor = await visitorContext.newPage();
  const q = await request(visitor);
  await visitor.goto("/acompanhar/" + q.code);
  await expect(
    visitor.getByText(
      "O agendamento estará disponível após a aprovação da proposta final.",
    ),
  ).toBeVisible();
  await expect(
    visitor.getByRole("button", { name: "Consultar horários" }),
  ).toHaveCount(0);
  await expect(visitor.locator(".c-logo")).toBeVisible();
  const contrasts = await visitor.evaluate(async()=>{const {contrast}=await import('/src/consumer/brand.ts');const hex=(s:string)=>'#'+s.match(/[0-9]+/g)!.slice(0,3).map(v=>Number(v).toString(16).padStart(2,'0')).join('');return ['.c-status','.c-version','.c-secure'].map(sel=>{const e=document.querySelector(sel)!;const cs=getComputedStyle(e);return contrast(hex(cs.color),hex(cs.backgroundColor));});});
  expect(contrasts.every(r=>r>=4.5)).toBe(true);
  const dark = await visitor
    .locator(".consumer")
    .evaluate((e) => getComputedStyle(e).backgroundColor);
  await visitor.screenshot({
    path: "reports/syzia-040/consumidor-escuro.png",
    fullPage: true,
  });
  await publish(page, id, "light");
  await visitor.reload();
  const light = await visitor
    .locator(".consumer")
    .evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(dark).not.toEqual(light);
  await visitor.getByRole("link", { name: /Meus pedidos/ }).click();
  await expect(visitor).toHaveURL(/empresa=ms-auto-ficticia/);
  await expect(visitor.locator(".c-logo")).toBeVisible();
  await expect(visitor.locator(".c-request-row")).not.toContainText(
    "Horizonte",
  );
  await visitor.screenshot({
    path: "reports/syzia-040/consumidor-claro.png",
    fullPage: true,
  });
  await visitorContext.close();
});
test("05 Proposta aprovada: agenda retorna sem horários/erro/opções e confirma/remarca/cancela", async ({
  page,
  browser,
}) => {
  await demoLogin(page);
  const id = await org(page);
  const ctx = await browser.newContext(),
    visitor = await ctx.newPage(),
    q = await request(visitor);
  const r: any = await rpc(page, "consumer_request_context", {
    p_code: q.code,
  });
  const version: any = await rpc(page, "consumer_send_quote", {
    p_code: q.code,
    p_items: [
      { name: "Serviço final fictício", quantity: 1, unit_cents: 15000 },
    ],
    p_duration: 60,
    p_expires: new Date(Date.now() + 86400000).toISOString(),
    p_expected_revision: r.revision,
    p_key: crypto.randomUUID(),
  });
  await visitor.goto("/acompanhar/" + q.code);
  await visitor.getByRole("button", { name: /Aprovar esta proposta/ }).click();
  await expect(
    visitor.getByRole("button", { name: "Consultar horários" }),
  ).toBeVisible();
  await visitor
    .getByLabel("Escolha um dia", { exact: true })
    .fill("2100-01-01");
  await visitor.getByRole("button", { name: "Consultar horários" }).click();
  await expect(
    visitor.getByText(/Não há horários disponíveis neste dia/),
  ).toBeVisible();
  await visitor.route("**/rest/v1/rpc/consumer_request_slots", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "unavailable" }),
    }),
  );
  await visitor.getByRole("button", { name: "Consultar horários" }).click();
  await expect(visitor.getByRole("alert")).toContainText(
    "Não foi possível consultar os horários",
  );
  await visitor.unroute("**/rest/v1/rpc/consumer_request_slots");
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await visitor.getByLabel("Escolha um dia", { exact: true }).fill(day);
  await visitor.getByRole("button", { name: "Consultar horários" }).click();
  await expect(visitor.locator(".c-slots button").first()).toBeVisible();
  await visitor.locator(".c-slots button").first().click();
  await visitor.getByRole("button", { name: /Confirmar horário/ }).click();
  await expect(
    visitor.getByLabel("Escolha outro dia para remarcar"),
  ).toBeVisible();
  await visitor
    .getByLabel("Escolha outro dia para remarcar")
    .fill(new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10));
  await visitor.getByRole("button", { name: "Consultar horários" }).click();
  await visitor.locator(".c-slots button").first().click();
  await visitor.getByRole("button", { name: /Confirmar remarcação/ }).click();
  await visitor.getByRole("button", { name: "Cancelar este horário" }).click();
  await expect(
    visitor.getByLabel("Escolha um dia", { exact: true }),
  ).toBeVisible();
  await ctx.close();
});
test("06 FAQ: altura de conteúdo, sinal aberto, mobile FAQ→horários→ajuda sem overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/empresa/ms-auto-ficticia");
  await expect(page.locator(".c-faq summary").first()).toBeVisible();
  await page.locator(".c-faq summary").first().click();
  expect(
    await page
      .locator(".c-faq details[open] .c-faq-symbol")
      .evaluate((e) => getComputedStyle(e, "::before").content),
  ).toContain("−");
  const boxes = await Promise.all(
    [".c-faq", ".c-business", ".c-help-block"].map((s) =>
      page.locator(s).boundingBox(),
    ),
  );
  expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
  expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "reports/syzia-040/faq-mobile.png",
    fullPage: true,
  });
});
test("07 Trial self-service: cadastro, confirmação sem pagamento e entrada no onboarding existente", async ({
  page,
  browser,
}) => {
  await demoLogin(page, "root@example.invalid");
  const v: any = await plan(page, { name: "Trial automático 040" });
  const ctx = await browser.newContext({ locale: "pt-BR" }),
    fresh = await ctx.newPage();
  try {
    await fresh.goto("/cadastrar?plano=" + v.plan_id);
    await fresh
      .getByLabel("Nome completo", { exact: true })
      .fill("Titular Trial Fictício");
    await fresh
      .getByLabel("Username", { exact: true })
      .fill("titular.trial040");
    await fresh
      .getByLabel("E-mail", { exact: true })
      .fill("titulartrial040@example.invalid");
    await fresh
      .getByLabel("Sua senha", { exact: true })
      .fill("SenhaFicticia040!2026");
    await fresh
      .getByLabel("Confirmar senha", { exact: true })
      .fill("SenhaFicticia040!2026");
    await fresh
      .getByRole("button", { name: "Criar identidade", exact: true })
      .click();
    await expect(
      fresh.getByRole("heading", { name: "Empresa e plano" }),
    ).toBeVisible();
    await fresh
      .getByLabel("Nome da empresa", { exact: true })
      .fill("Negócio Trial Fictício");
    await fresh.getByLabel(/^Endereço da página/).fill("negocio-trial040");
    await fresh.getByLabel("Telefone", { exact: true }).fill("11999990000");
    await fresh.getByLabel("Documento", { exact: true }).fill("52998224725");
    await fresh.getByRole("button", { name: "Salvar e continuar" }).click();
    await expect(
      fresh.getByText("7 dias grátis", { exact: true }),
    ).toBeVisible();
    await expect(
      fresh.getByRole("button", { name: "Continuar para pagamento" }),
    ).toHaveCount(0);
    await fresh.getByRole("checkbox").check();
    await fresh
      .getByRole("button", { name: "Ativar período grátis e preparar empresa" })
      .click();
    await expect(
      fresh.getByRole("heading", { name: "Empresa preparada." }),
    ).toBeVisible();
    await fresh
      .getByRole("button", { name: "Abrir configuração da empresa" })
      .click();
    await expect(fresh).toHaveURL(/\/painel\//);
    await expect(
      fresh.getByRole("heading", { name: "Antes de começar", exact: true }),
    ).toBeVisible();
    await fresh.getByRole("checkbox").nth(0).check();
    await fresh.getByRole("checkbox").nth(1).check();
    await fresh.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(
      fresh.getByRole("heading", {
        name: "Vamos preparar sua empresa",
        exact: true,
      }),
    ).toBeVisible();
    await fresh.screenshot({
      path: "reports/syzia-040/trial-onboarding.png",
      fullPage: true,
    });
  } catch (error) {
    await fresh.screenshot({
      path: "reports/syzia-040/trial-debug.png",
      fullPage: true,
    });
    console.log(
      "TRIAL-DEBUG",
      fresh.url(),
      await fresh.locator("body").innerText(),
    );
    throw error;
  }
  await ctx.close();
});
test("08 Manual da Central em português e busca por label ou chave", async ({
  page,
}) => {
  await demoLogin(page);
  const id = await org(page);
  const q: any = await rpc(page, "central_queue", { p_org: id });
  expect(q.tickets.length).toBeGreaterThan(0);
  await page.goto("/central/" + q.tickets[0].code);
  await page.getByRole("button", { name: "Manual", exact: true }).click();
  await expect(
    page.locator("summary").filter({ hasText: "Empresa e atendimento" }),
  ).toBeVisible();
  await expect(
    page
      .locator("summary")
      .filter({ hasText: /^(business|operation|policies|payments)$/ }),
  ).toHaveCount(0);
  const search = page.getByLabel(/Buscar no manual/);
  await search.fill("business");
  await expect(
    page.locator("summary").filter({ hasText: "Empresa e atendimento" }),
  ).toBeVisible();
  await search.fill("Empresa e atendimento");
  await expect(
    page.locator("summary").filter({ hasText: "Empresa e atendimento" }),
  ).toBeVisible();
  await page.screenshot({
    path: "reports/syzia-040/manual.png",
    fullPage: true,
  });
});
test("09 Colaborador sem grants: Clientes explica falta de permissão e Assumir fica desabilitado", async ({
  page,
  browser,
}) => {
  await demoLogin(page);
  const id = await org(page),
    team: any = await rpc(page, "permissions_team", { p_org: id }),
    member = team.members.find(
      (m: any) =>
        m.role === "own_attendant" || m.role === "colaborador_empresa",
    );
  await rpc(page, "permissions_save", {
    p_org: id,
    p_user: member.user_id,
    p_revision: member.revision,
    p_grants: [
      { action: "central.read", scope: "organization", granted: true },
    ],
    p_key: crypto.randomUUID(),
  });
  const ctx = await browser.newContext(),
    worker = await ctx.newPage();
  await worker.goto("/entrar");
  await worker
    .getByLabel("E-mail ou usuário", { exact: true })
    .fill("own@example.invalid");
  await worker
    .getByLabel("Senha", { exact: true })
    .fill("FictitiousPassword123!");
  await worker.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    worker.getByRole("heading", { name: "Escolha seu ambiente" }),
  ).toBeVisible();
  await worker.getByRole("button", { name: /MS Auto/ }).click();
  await worker.waitForURL(/\/painel\//);
  await worker.goto("/painel/" + id + "/clientes");
  await expect(
    worker.getByRole("heading", { name: "Acesso não disponível" }),
  ).toBeVisible();
  const queue: any = await rpc(page, "central_queue", { p_org: id });
  await worker.goto("/central/" + queue.tickets[0].code);
  await expect(
    worker.getByRole("button", { name: "Assumir atendimento", exact: true }),
  ).toBeDisabled();
  await expect(
    worker.getByText(/Você não possui permissão para assumir atendimentos/),
  ).toBeVisible();
  await ctx.close();
});
