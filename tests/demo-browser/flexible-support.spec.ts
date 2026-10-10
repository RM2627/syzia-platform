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
async function crpc(p: Page, name: string, args: any = {}) {
  return p.evaluate(
    async ({ name, args }) => {
      const c = await import("/src/consumer/api.ts");
      await c.ensureConsumer();
      try {
        return await c.crpc(name, args);
      } catch (e: any) {
        throw new Error(e.message || JSON.stringify(e));
      }
    },
    { name, args },
  );
}
async function shot(p: Page, name: string) {
  await mkdir("reports/flexible-support/screenshots", { recursive: true });
  await p.screenshot({
    path: `reports/flexible-support/screenshots/${name}.png`,
    fullPage: true,
  });
  expect(
    await p.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - innerWidth),
    ),
  ).toBe(0);
}
async function org(p: Page) {
  const d: any = await rpc(p, "foundation_context");
  return d.organizations.find((o: any) => o.slug === "ms-auto-ficticia").id;
}
async function configure(p: Page) {
  await demoLogin(p, "root@example.invalid");
  const d: any = await rpc(p, "assisted_admin_context");
  await rpc(p, "assisted_policy_mode_save", {
    p_revision: d.policy.revision,
    p_active: true,
    p_hours: [],
    p_timezone: d.policy.timezone,
    p_message: d.policy.outside_message,
    p_mode: "flexible",
  });
}
for (const width of [1440, 390, 320])
  test(`Global ${width}: flexible without grid, scheduled grid, switch preserves settings`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await configure(page);
    await page.goto("/admin/assinaturas");
    await page
      .getByText("Horário global da Equipe SYZIA", { exact: true })
      .click();
    const mode = page.getByRole("combobox", {
      name: "Modelo de disponibilidade",
      exact: true,
    });
    await expect(mode).toHaveValue("flexible");
    await expect(page.getByLabel("Timezone", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Adicionar intervalo · Segunda",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "Salvar horário compartilhado",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Configuração salva e auditada.", { exact: true }),
    ).toBeVisible();
    await shot(page, `policy-flexible-${width}`);
    await mode.selectOption("scheduled");
    await page
      .getByRole("button", {
        name: "Adicionar intervalo · Segunda",
        exact: true,
      })
      .click();
    await page.getByLabel("Segunda início 1", { exact: true }).fill("08:00");
    await page.getByLabel("Segunda fim 1", { exact: true }).fill("09:00");
    await page
      .getByRole("button", {
        name: "Salvar horário compartilhado",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Configuração salva e auditada.", { exact: true }),
    ).toBeVisible();
    await shot(page, `policy-scheduled-${width}`);
    await mode.selectOption("flexible");
    await page
      .getByRole("button", {
        name: "Salvar horário compartilhado",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Configuração salva e auditada.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByText("Horário global da Equipe SYZIA", { exact: true })
      .click();
    await expect(mode).toHaveValue("flexible");
    const d: any = await rpc(page, "assisted_admin_context");
    expect(d.policy.hours).toEqual([{ day: 1, open: "08:00", close: "09:00" }]);
    expect(
      d.configuration_history.some(
        (a: any) => a.after_value?.availability_mode === "flexible",
      ),
    ).toBe(true);
    await page.goto("/planos");
    await expect(
      page
        .getByText(
          "Para empresas que querem contar com o apoio da equipe compartilhada da SYZIA no atendimento aos clientes.",
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    await expect(page.locator("main")).toContainText(
      "conforme disponibilidade",
    );
    await shot(page, `plans-${width}`);
  });
for (const width of [1440, 390])
  test(`Company ${width}: rules and consumption read-only; direct global URL and RPC denied`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await demoLogin(page);
    const id = await org(page);
    await page.goto(`/painel/${id}/assinatura`);
    await expect(
      page
        .getByText("Conforme disponibilidade da equipe", { exact: false })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", {
        name: "Modelo de disponibilidade",
        exact: true,
      }),
    ).toHaveCount(0);
    await shot(page, `company-${width}`);
    const denied = await page.evaluate(async () => {
      try {
        await (
          await import("/src/api.ts")
        ).rpc("assisted_policy_mode_save", {
          p_revision: 1,
          p_active: true,
          p_hours: [],
          p_timezone: "UTC",
          p_message: "Alteração indevida de teste",
          p_mode: "flexible",
        });
        return false;
      } catch {
        return true;
      }
    });
    expect(denied).toBe(true);
    await page.goto("/admin/assinaturas");
    await expect(
      page.getByRole("heading", { name: "Acesso restrito", exact: true }),
    ).toBeVisible();
  });
async function newSupportTicket(admin: Page, visitor: Page, suffix: string) {
  await demoLogin(admin);
  const id = await org(admin);
  let ctx: any = await rpc(admin, "company_context", { p_org: id });
  const service: any = await rpc(admin, "company_save", {
    p_org: id,
    p_entity: "service",
    p_id: null,
    p_expected_revision: ctx.settings.revision,
    p_data: {
      name: "Serviço suporte flexível " + suffix,
      description: "Serviço fictício para verificar suporte compartilhado.",
      availability: "Disponibilidade configurada pela empresa.",
      price_mode: "fixed",
      price_cents: 10000,
      duration_minutes: 30,
      contract_mode: "immediate",
      photo_policy: "optional",
      quotes_allowed: true,
    },
  });
  const draft: any = await rpc(admin, "consumer_page_draft", {
    p_org: id,
    p_show_prices: true,
  });
  await rpc(admin, "consumer_publish_draft", {
    p_org: id,
    p_token: draft.token,
    p_show_prices: true,
    p_expected_revision: draft.page_revision,
  });
  // Catalog edits invalidate the existing published manual. Prepare a legitimate
  // current manual through the same authorized commands as the company UI.
  ctx = await rpc(admin, "company_context", { p_org: id });
  const manual = await rpc(admin, "company_create_manual", {
    p_org: id,
    p_expected_revision: ctx.settings.revision,
    p_title: "Manual fictício 046 " + suffix,
  });
  ctx = await rpc(admin, "company_context", { p_org: id });
  await rpc(admin, "company_publish_manual", {
    p_org: id,
    p_manual: manual,
    p_expected_revision: ctx.settings.revision,
  });
  ctx = await rpc(admin, "company_context", { p_org: id });
  await rpc(admin, "company_set_activation", {
    p_org: id,
    p_expected_revision: ctx.settings.revision,
    p_human: true,
    p_public_faq: true,
  });
  await visitor.goto("/empresa/ms-auto-ficticia");
  const pub: any = await crpc(visitor, "consumer_public_page", {
    p_slug: "ms-auto-ficticia",
  });
  const s = pub.services.find(
    (s: any) => s.name === "Serviço suporte flexível " + suffix,
  );
  expect(s).toBeTruthy();
  const request: any = await crpc(visitor, "consumer_start_help", {
    p_slug: pub.slug,
    p_revision: pub.revision,
    p_items: [{ service: s.code, addons: [], answers: {}, notes: "" }],
    p_customer: {
      name: "Cliente fictício 046 " + suffix,
      whatsapp: "81999990000",
      accepted_notice: true,
      notice_version: "consumer-v1",
    },
    p_stage: "review",
    p_key: crypto.randomUUID(),
  });
  await visitor.goto("/acompanhar/" + request.code);
  await expect(
    visitor.getByRole("heading", {
      name: "Converse com o atendimento",
      exact: true,
    }),
  ).toBeVisible();
  const thread: any = await crpc(visitor, "central_consumer_thread", {
    p_request: request.code,
  });
  return { id, code: thread.code, request: request.code };
}
for (const width of [1440, 390])
  test(`Central ${width}: unavailable cannot claim; available claims with immediate feedback`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const admin = await browser.newPage(),
      visitor = await browser.newPage();
    const t = await newSupportTicket(admin, visitor, "central-" + width);
    await demoLogin(page, "shared@example.invalid");
    await page.goto("/central/" + t.code);
    await page
      .getByRole("combobox", { name: "Minha presença", exact: true })
      .selectOption("pause");
    const claim = page.getByRole("button", {
      name: "Assumir atendimento",
      exact: true,
    });
    await expect(claim).toBeDisabled();
    await expect(
      page.getByText("Aguardando apoio.", { exact: false }),
    ).toBeVisible();
    await shot(page, `queue-unavailable-${width}`);
    await page
      .getByRole("combobox", { name: "Minha presença", exact: true })
      .selectOption("available");
    await expect(claim).toBeEnabled();
    await claim.click();
    await expect(claim).toBeDisabled();
    const ctx: any = await rpc(page, "central_context", { p_code: t.code });
    expect(ctx.ticket.assignee_id).toBe(ctx.me);
    expect(ctx.shared_support.counted).toBe(true);
    await shot(page, `claimed-${width}`);
    await admin.close();
    await visitor.close();
  });
for (const width of [1440, 390])
  test(`Consumer ${width}: message persists with no shared staff online and no quota charged`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const admin = await browser.newPage();
    const t = await newSupportTicket(admin, page, "consumer-" + width);
    for (const email of [
      "agenta@example.invalid",
      "backup@example.invalid",
      "agentb@example.invalid",
      "shared@example.invalid",
    ]) {
      const staff = await browser.newPage();
      await demoLogin(staff, email);
      await rpc(staff, "central_presence", { p_state: "offline" });
      await staff.close();
    }
    await page.reload();
    await expect(
      page.getByText(
        "Recebemos sua mensagem. A equipe responsável responderá assim que estiver disponível.",
        { exact: true },
      ),
    ).toBeVisible();
    const before: any = await rpc(admin, "assisted_company_usage", {
      p_org: t.id,
    });
    await page
      .getByLabel("Sua mensagem", { exact: true })
      .fill("Mensagem fictícia 046 preservada sem humano online");
    await page
      .getByRole("button", { name: "Enviar ao atendimento", exact: true })
      .click();
    await expect(
      page
        .locator(".c-chat-message")
        .filter({
          hasText: "Mensagem fictícia 046 preservada sem humano online",
        }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page
        .locator(".c-chat-message")
        .filter({
          hasText: "Mensagem fictícia 046 preservada sem humano online",
        }),
    ).toBeVisible();
    const after: any = await rpc(admin, "assisted_company_usage", {
      p_org: t.id,
    });
    expect(after.used).toBe(before.used);
    const th: any = await crpc(page, "central_consumer_thread", {
      p_request: t.request,
    });
    expect(th.shared_open).toBe(false);
    await shot(page, `consumer-waiting-${width}`);
    await admin.close();
  });
