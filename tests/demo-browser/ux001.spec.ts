import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
import type { Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
async function rpc(p: Page, name: string, args: any = {}) {
  return p.evaluate(
    async ({ name, args }) => (await import("/src/api.ts")).rpc(name, args),
    { name, args },
  );
}
async function company(
  p: Page,
  email = "admin@example.invalid",
  slug = "ms-auto-ficticia",
) {
  if (email === "own@example.invalid") {
    await p.goto("/entrar");
    await p.getByLabel("E-mail ou usuário", { exact: true }).fill(email);
    await p.getByLabel("Senha", { exact: true }).fill("FictitiousPassword123!");
    await p.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      p.getByRole("heading", { name: "Escolha seu ambiente" }),
    ).toBeVisible();
    await p.getByRole("button", { name: /MS Auto/ }).click();
    await p.waitForURL(/\/painel\//);
  } else {
    await demoLogin(p, email);
  }
  const c: any = await rpc(p, "foundation_context");
  return c.organizations.find((o: any) => o.slug === slug).id;
}
const nav = (p: Page) =>
  p.getByRole("navigation", { name: "Navegação da empresa" });
const tab = (p: Page) => p.locator(".central > .h-tabs .selected");
const detail = (p: Page) =>
  p.getByRole("region", { name: "Atendimento selecionado" });
async function all(p: Page) {
  const loaded = p.waitForResponse((response) => {
    if (!response.url().endsWith("/rpc/central_queue")) return false;
    const args = response.request().postDataJSON();
    return args?.p_view === "all" && args?.p_mine === false && !args?.p_search;
  });
  await p.getByRole("button", { name: "Todos", exact: true }).click();
  const data = await (await loaded).json();
  await expect(p.locator("a.h-ticket")).toHaveCount(data.tickets.length);
  await expect(p.locator("a.h-ticket").nth(1)).toBeVisible();
}
async function shots(p: Page, name: string) {
  await mkdir("reports/ux001/screenshots", { recursive: true });
  await p.screenshot({
    path: `reports/ux001/screenshots/${name}.png`,
    fullPage: true,
  });
  expect(
    await p.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - innerWidth),
    ),
  ).toBe(0);
}
for (const width of [1440, 390, 320])
  test(`UX001 empresarial ${width}: filtro, troca, histórico, URL direta, reload e limpar seleção`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const org = await company(page);
    const base = `/painel/${org}/atendimento`;
    await page.goto(base);
    await all(page);
    await page
      .getByRole("combobox", { name: "Ordenar", exact: true })
      .selectOption("wait");
    const links = await page.locator("a.h-ticket").evaluateAll((es) =>
      es.map((e) => ({
        href: e.getAttribute("href")!,
        name: e.querySelector("h3")!.textContent!,
      })),
    );
    const one = links[0],
      two = links.find((x) => x.name !== one.name)!;
    expect(two).toBeTruthy();
    await page.locator(`a[href="${one.href}"]`).click();
    await expect(
      detail(page).getByRole("heading", { name: one.name, exact: true }),
    ).toBeVisible();
    await expect(nav(page)).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/painel/${org}/atendimento\\?ticket=`),
    );
    await expect(tab(page)).toHaveText("Todos");
    await expect(
      page.getByRole("combobox", { name: "Empresa", exact: true }),
    ).toBeDisabled();
    await page.route("**/rpc/central_context", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.continue();
    });
    await page.locator(`a[href="${two.href}"]`).click();
    await expect(page.locator(".h-work").getByRole("status")).toHaveText(
      "Abrindo contexto autorizado…",
    );
    await expect(detail(page)).toHaveCount(0);
    await expect(
      detail(page).getByRole("heading", { name: two.name, exact: true }),
    ).toBeVisible();
    await expect(tab(page)).toHaveText("Todos");
    await expect(
      page.getByRole("combobox", { name: "Ordenar", exact: true }),
    ).toHaveValue("wait");
    await page.unroute("**/rpc/central_context");
    await shots(page, `enterprise-${width}`);
    await page.goBack();
    await expect(
      detail(page).getByRole("heading", { name: one.name, exact: true }),
    ).toBeVisible();
    await expect(tab(page)).toHaveText("Todos");
    await page.goForward();
    await expect(
      detail(page).getByRole("heading", { name: two.name, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Voltar à fila", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(base + "$"));
    await expect(detail(page)).toHaveCount(0);
    await expect(tab(page)).toHaveText("Todos");
    await expect(
      page.getByRole("combobox", { name: "Ordenar", exact: true }),
    ).toHaveValue("wait");
    await page.goBack();
    await expect(
      detail(page).getByRole("heading", { name: two.name, exact: true }),
    ).toBeVisible();
    const url = page.url();
    await page.reload();
    await expect(
      detail(page).getByRole("heading", { name: two.name, exact: true }),
    ).toBeVisible();
    await expect(nav(page)).toBeVisible();
    const direct = await context.newPage();
    await direct.goto(url);
    await expect(
      detail(direct).getByRole("heading", { name: two.name, exact: true }),
    ).toBeVisible();
    await expect(nav(direct)).toBeVisible();
    await direct.close();
  });
test("UX001 Home, notificações, Pendências, Comercial e alternância determinística", async ({
  page,
}) => {
  const org = await company(page);
  const base = `/painel/${org}`;
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: "Precisa da sua atenção" }),
  ).toBeVisible();
  const showAll = page.getByRole("button", { name: /Ver todas as .* tarefas/ });
  if (await showAll.count()) await showAll.click();
  const attention = page.locator('.op-attention[href*="ticket="]').first();
  await expect(attention).toBeVisible();
  expect(await attention.getAttribute("href")).toContain(base + "/");
  await attention.click();
  await expect(detail(page)).toBeVisible();
  await expect(nav(page)).toBeVisible();
  await nav(page)
    .getByRole("link", { name: "Pendências", exact: true })
    .click();
  await expect(tab(page)).toHaveText("Aguardando empresa");
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await page
    .getByLabel("Buscar cliente, empresa ou ticket", { exact: true })
    .fill("Ana");
  await expect(page.locator("a.h-ticket").first()).toBeVisible();
  await page.locator("a.h-ticket").first().click();
  await expect(page).toHaveURL(new RegExp(base + "/pendencias\\?ticket="));
  await expect(tab(page)).toHaveText("Todos");
  await expect(
    page.getByLabel("Buscar cliente, empresa ou ticket", { exact: true }),
  ).toHaveValue("Ana");
  await expect(detail(page)).toBeVisible();
  await nav(page)
    .getByRole("link", { name: "Atendimento", exact: true })
    .click();
  await expect(tab(page)).toHaveText("Minha fila");
  await expect(
    page.getByLabel("Buscar cliente, empresa ou ticket", { exact: true }),
  ).toHaveValue("");
  await nav(page)
    .getByRole("link", { name: "Pendências", exact: true })
    .click();
  await expect(tab(page)).toHaveText("Aguardando empresa");
  await nav(page).getByRole("link", { name: "Comercial", exact: true }).click();
  await expect(page.locator("a.co-opportunity").first()).toBeVisible();
  await page.locator("a.co-opportunity").first().click();
  await expect(page).toHaveURL(new RegExp(base + "/comercial\\?op="));
  await page
    .getByRole("link", { name: "Abrir atendimento e orçamento ↗", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(base + "/atendimento\\?ticket="));
  await expect(detail(page)).toBeVisible();
  await expect(nav(page)).toBeVisible();
  await page.goBack();
  await page
    .getByRole("link", { name: "Respostas rápidas autorizadas ↗", exact: true })
    .click();
  await expect(page).toHaveURL(/ticket=.*&panel=replies/);
  await expect(page.locator(".h-context-tabs .selected")).toHaveText(
    "Respostas",
  );
  await shots(page, "company-origins");
  await nav(page).getByRole("link", { name: "Clientes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Clientes", exact: true }),
  ).toBeVisible();
  expect(await page.locator('main a[href^="/central/"]').count()).toBe(0);
});
test("UX001 Central e Comercial globais continuam globais; fila preservada", async ({
  page,
}) => {
  await company(page);
  await page.goto("/central");
  await all(page);
  const links = await page
    .locator("a.h-ticket")
    .evaluateAll((es) => es.map((e) => e.getAttribute("href")!));
  expect(links.every((h) => h.startsWith("/central/"))).toBeTruthy();
  await page.locator(`a[href="${links[0]}"]`).click();
  await expect(detail(page)).toBeVisible();
  await expect(nav(page)).toHaveCount(0);
  await expect(tab(page)).toHaveText("Todos");
  await page.locator(`a[href="${links[1]}"]`).click();
  await expect(page).toHaveURL(new RegExp(links[1] + "$"));
  await expect(detail(page)).toBeVisible();
  await expect(tab(page)).toHaveText("Todos");
  await shots(page, "global");
  await page.goto("/comercial");
  await page.locator("a.co-opportunity").first().click();
  await expect(page).toHaveURL(/\/comercial\//);
  await page
    .getByRole("link", { name: "Abrir atendimento e orçamento ↗", exact: true })
    .click();
  await expect(page).toHaveURL(/\/central\//);
  await expect(nav(page)).toHaveCount(0);
});
test("UX001 URL de B em painel de A e usuário sem grant são negados", async ({
  page,
  browser,
}) => {
  const b = await browser.newContext();
  const pb = await b.newPage();
  const orgB = await company(
    pb,
    "adminb@example.invalid",
    "horizonte-ficticio",
  );
  const queueB: any = await rpc(pb, "central_queue", { p_org: orgB });
  const codeB = queueB.tickets[0].code;
  const orgA = await company(page);
  await page.goto(`/painel/${orgA}/atendimento?ticket=${codeB}`);
  await expect(page.locator(".h-work").getByRole("alert")).toContainText(
    "não autorizada",
  );
  await expect(detail(page)).toHaveCount(0);
  await shots(page, "cross-tenant-denied");
  const team: any = await rpc(page, "permissions_team", { p_org: orgA });
  const member = team.members.find(
    (m: any) => m.user_id === "10000000-0000-0000-0000-000000000007",
  );
  await rpc(page, "permissions_save", {
    p_org: orgA,
    p_user: member.user_id,
    p_revision: member.revision,
    p_grants: [],
    p_key: crypto.randomUUID(),
  });
  const w = await browser.newContext();
  const pw = await w.newPage();
  await company(pw, "own@example.invalid");
  await pw.goto(`/painel/${orgA}/atendimento?ticket=${codeB}`);
  await expect(
    pw.getByRole("heading", { name: "Acesso não disponível" }),
  ).toBeVisible();
  await expect(detail(pw)).toHaveCount(0);
  await w.close();
  await b.close();
});
test("UX001 Equipe SYZIA atribuída opera global; não atribuída permanece negada", async ({
  page,
  browser,
}) => {
  const b = await browser.newContext();
  const pb = await b.newPage();
  const orgB = await company(
    pb,
    "adminb@example.invalid",
    "horizonte-ficticio",
  );
  const queueB: any = await rpc(pb, "central_queue", { p_org: orgB });
  const orgA = await company(page, "agenta@example.invalid");
  await page.goto("/central");
  await all(page);
  await page.locator("a.h-ticket").first().click();
  await expect(detail(page)).toBeVisible();
  await expect(nav(page)).toHaveCount(0);
  await page.goto(`/central/${queueB.tickets[0].code}`);
  await expect(page.locator(".h-work").getByRole("alert")).toContainText(
    "não autorizada",
  );
  await expect(detail(page)).toHaveCount(0);
  await b.close();
});
test("UX001 URL copiada sem sessão não abre conteúdo empresarial", async ({
  page,
}) => {
  await page.goto(
    "/painel/00000000-0000-0000-0000-000000000000/atendimento?ticket=ficticio",
  );
  await expect(page).toHaveURL(/\/entrar/);
  await expect(detail(page)).toHaveCount(0);
});

test("UX001 duas empresas autorizadas: ticket B não aparece no painel A; filtros limpos em B", async ({
  page,
  browser,
}) => {
  const admins = [];
  const orgs = [];
  const codes = [];
  for (const [email, slug] of [
    ["admin@example.invalid", "ms-auto-ficticia"],
    ["adminb@example.invalid", "horizonte-ficticio"],
  ]) {
    const c = await browser.newContext();
    admins.push(c);
    const p = await c.newPage();
    const org = await company(p, email, slug);
    orgs.push(org);
    const q: any = await rpc(p, "central_queue", { p_org: org });
    codes.push(q.tickets[0].code);
    await rpc(p, "operations_set_attendant", {
      p_org: org,
      p_user: "10000000-0000-0000-0000-000000000007",
      p_enabled: true,
    });
    const team: any = await rpc(p, "permissions_team", { p_org: org });
    const m = team.members.find(
      (m: any) => m.user_id === "10000000-0000-0000-0000-000000000007",
    );
    await rpc(p, "permissions_save", {
      p_org: org,
      p_user: m.user_id,
      p_revision: m.revision,
      p_grants: [
        "home.read",
        "central.read",
        "central.manage",
        "central.reply",
        "pending.read",
      ].map((action) => ({ action, scope: "organization", granted: true })),
      p_key: crypto.randomUUID(),
    });
  }
  await company(page, "shared@example.invalid");
  await page.goto(`/painel/${orgs[0]}/atendimento?ticket=${codes[1]}`);
  await expect(page.locator(".h-work").getByRole("alert")).toHaveText(
    "Atendimento indisponível neste contexto empresarial.",
  );
  await expect(detail(page)).toHaveCount(0);
  await page.goto(`/painel/${orgs[0]}/atendimento?ticket=${codes[0]}`);
  await expect(detail(page)).toBeVisible();
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await page
    .getByLabel("Buscar cliente, empresa ou ticket", { exact: true })
    .fill("Ana");
  await page.goto(`/painel/${orgs[1]}/atendimento?ticket=${codes[1]}`);
  await expect(detail(page)).toBeVisible();
  await expect(tab(page)).toHaveText("Minha fila");
  await expect(
    page.getByLabel("Buscar cliente, empresa ou ticket", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Empresa", exact: true }),
  ).toHaveValue(orgs[1]);
  await shots(page, "two-authorized-tenants");
  for (const c of admins) await c.close();
});

test("UX001 notificação de decisão abre e troca ticket dentro de Pendências", async ({
  page,
}) => {
  const org = await company(page);
  const q: any = await rpc(page, "central_queue", { p_org: org });
  const ticket = q.tickets.find(
    (t: any) => !["resolved", "closed", "waiting_company"].includes(t.state),
  );
  expect(ticket).toBeTruthy();
  const ctx: any = await rpc(page, "central_context", { p_code: ticket.code });
  await rpc(page, "central_act", {
    p_code: ticket.code,
    p_revision: ctx.ticket.revision,
    p_action: "escalate",
    p_data: {
      reason: "Decisão fictícia UX001",
      summary: "Verificação local do link de notificação.",
      question: "Como prosseguir neste cenário fictício?",
    },
    p_key: crypto.randomUUID(),
  });
  await page.goto(`/painel/${org}`);
  const notification = page
    .getByRole("region", { name: "Últimas atualizações" })
    .locator('a[href*="ticket="]')
    .first();
  await expect(notification).toBeVisible();
  expect(await notification.getAttribute("href")).toContain(
    `/painel/${org}/pendencias?ticket=`,
  );
  await notification.click();
  await expect(detail(page)).toBeVisible();
  await expect(nav(page)).toBeVisible();
  await expect(tab(page)).toHaveText("Aguardando empresa");
  await shots(page, "notification-pending");
});
