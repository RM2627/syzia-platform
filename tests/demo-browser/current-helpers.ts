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

export { rpc, crpc, admin, setup, start, details, schedule, hours, noOverflow };
