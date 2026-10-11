import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
import { mkdir, readFile } from "node:fs/promises";
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";
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
async function seed(page: Page, images = false) {
  await demoLogin(page);
  const ctx: any = await rpc(page, "foundation_context"),
    org = ctx.organizations.find((x: any) => x.slug === "ms-auto-ficticia").id;
  const company: any = await rpc(page, "company_context", { p_org: org });
  const name = "Serviço 049 " + crypto.randomUUID().slice(0, 6);
  await rpc(page, "company_save", {
    p_org: org,
    p_entity: "service",
    p_id: null,
    p_expected_revision: company.settings.revision,
    p_data: {
      name,
      description: "Serviço fictício para validar operação.",
      price_mode: "fixed",
      price_cents: 12000,
      duration_minutes: 60,
      contract_mode: "immediate",
      photo_policy: "optional",
      quotes_allowed: true,
    },
  });
  if (images) {
    const logo = await page.evaluate(async (org) => {
      const { uploadCompanyImage } =
        await import("/src/consumer/CompanyMedia.tsx");
      const canvas = document.createElement("canvas");
      canvas.width = 120;
      canvas.height = 60;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#C52831";
      ctx.fillRect(0, 0, 120, 60);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("EMPRESA", 5, 38);
      const blob = await new Promise<Blob>((ok) =>
        canvas.toBlob((x) => ok(x!), "image/webp"),
      );
      return uploadCompanyImage(
        org,
        new File([blob], "logo-ficticio.webp", { type: "image/webp" }),
      );
    }, org);
    const presence: any = await rpc(page, "consumer_presence_context", {
      p_org: org,
    });
    await rpc(page, "consumer_branding_save", {
      p_org: org,
      p_revision: presence.revision,
      p_data: { ...presence.branding, logo, primary_color: "#C52831" },
    });
  }
  const d: any = await rpc(page, "consumer_page_draft", {
    p_org: org,
    p_show_prices: true,
  });
  await rpc(page, "consumer_publish_draft", {
    p_org: org,
    p_token: d.token,
    p_show_prices: true,
    p_expected_revision: d.page_revision,
  });
  const p: any = await crpc(page, "consumer_public_page", {
      p_slug: "ms-auto-ficticia",
    }),
    s = p.services.find((x: any) => x.name === name),
    items = [{ service: s.code, addons: [], answers: {}, notes: "" }];
  const q: any = await crpc(page, "consumer_create_multi_request", {
    p_slug: p.slug,
    p_revision: p.revision,
    p_items: items,
    p_customer: {
      name: "Cliente São José 049",
      whatsapp: "(87) 99999-1234",
      email: "cliente049@example.invalid",
      accepted_notice: true,
      notice_version: "consumer-v1",
    },
    p_notes: "Observação fictícia",
    p_contact: true,
    p_expected_cents: 12000,
    p_key: crypto.randomUUID(),
  });
  if (images)
    await page.evaluate(
      async ({ code, service }) => {
        const c = await import("/src/consumer/api.ts");
        const canvas = document.createElement("canvas");
        canvas.width = 80;
        canvas.height = 60;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#b34830";
        ctx.fillRect(0, 0, 80, 60);
        const blob = await new Promise<Blob>((ok) =>
          canvas.toBlob((x) => ok(x!), "image/png"),
        );
        await c.upload(
          code,
          new File([blob], "imagem-ficticia.png", { type: "image/png" }),
          crypto.randomUUID(),
          service,
        );
      },
      { code: q.code, service: s.code },
    );
  const day = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  const slots: any = await crpc(page, "consumer_journey_slots", {
    p_slug: p.slug,
    p_revision: p.revision,
    p_items: items,
    p_day: day,
  });
  expect(slots.slots.length).toBeGreaterThan(0);
  await crpc(page, "consumer_complete_journey", {
    p_code: q.code,
    p_start: slots.slots[0],
    p_attachment_count: images ? 1 : 0,
    p_key: crypto.randomUUID(),
  });
  const request: any = await crpc(page, "consumer_request_context", {
    p_code: q.code,
  });
  const agenda: any = await rpc(page, "operations_agenda", {
    p_org: org,
    p_from: day,
    p_to: new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10),
  });
  return {
    org,
    q,
    request,
    name,
    appointment:
      agenda.appointments.find((a: any) => a.request_code === q.code) ||
      agenda.appointments.find(
        (a: any) => a.public_code === request.appointments[0].code,
      ) ||
      agenda.appointments.find(
        (a: any) =>
          a.customer === "Cliente São José 049" &&
          a.starts_at === request.appointments[0].starts_at,
      ),
  };
}
test("049-B01 presença, PDF, imagens privadas, WhatsApp e checklist desktop/mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const x = await seed(page, true);
  expect(x.appointment?.id).toBeTruthy();
  await page.goto("/acompanhar/" + x.q.code);
  await expect(
    page.getByRole("button", { name: "Confirmar presença", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirmar presença", exact: true })
    .click();
  await expect(
    page.getByText(/Presença confirmada pelo cliente/).first(),
  ).toBeVisible();
  await mkdir("reports/syzia-049/documents", { recursive: true });
  for (const [label, file] of [
    ["Baixar orçamento em PDF", "orcamento-browser.pdf"],
    ["Baixar comprovante", "comprovante-browser.pdf"],
  ]) {
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: label, exact: true })
      .first()
      .click();
    const download = await pending;
    await download.saveAs("reports/syzia-049/documents/" + file);
    const pdf = await PDFDocument.load(
      await readFile("reports/syzia-049/documents/" + file),
    );
    expect(pdf.getAuthor()).toContain("MS Auto");
    expect(
      pdf
        .getPages()[0]
        .node.Resources()
        ?.lookup(PDFName.of("XObject"), PDFDict)
        .entries().length,
    ).toBeGreaterThan(0);
    expect(download.suggestedFilename()).toMatch(/-v\d+\.pdf$/);
  }
  const path = `/painel/${x.org}/agenda?ficha=${x.appointment.id}`;
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: "Checklist de execução" }),
  ).toBeVisible();
  await expect(page.getByText("Nenhuma etapa adicionada.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ampliar imagem enviada pelo cliente" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ampliar imagem enviada pelo cliente" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Imagem enviada pelo cliente" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  const link = page.getByRole("link", {
    name: "Conversar pelo WhatsApp",
    exact: true,
  });
  await expect(link).toHaveAttribute("href", "https://wa.me/5587999991234");
  await expect(link).toHaveAttribute("target", "_blank");
  await page
    .getByLabel("Nova etapa", { exact: true })
    .fill("Conferir orientações do cliente");
  await page.getByRole("button", { name: "Adicionar etapa" }).click();
  await expect(page.getByText("0 de 1 etapas")).toBeVisible();
  await page.locator(".execution-checklist input[type=checkbox]").click();
  await expect(page.getByText("1 de 1 etapas")).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".execution-checklist input[type=checkbox]"),
  ).toBeChecked();
  await mkdir("reports/syzia-049/screenshots", { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByText(/Presença confirmada pelo cliente/).first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBe(0);
    await page.screenshot({
      path: `reports/syzia-049/screenshots/ficha-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto(`/painel/${x.org}/orcamentos?pedido=${x.q.code}`);
  await expect(
    page.getByRole("heading", { name: /Proposta para/ }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Enviar orçamento pelo WhatsApp",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("link", { name: "Revisar mensagem no WhatsApp" }),
  ).toHaveAttribute("href", /https:\/\/wa.me\/5587999991234\?text=/);
  await page.goto("/acompanhar/" + x.q.code);
  const mobile = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar comprovante", exact: true })
    .click();
  await (
    await mobile
  ).saveAs("reports/syzia-049/documents/comprovante-mobile.pdf");
  await page.screenshot({
    path: "reports/syzia-049/screenshots/consumidor-320.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("049-B02 chat: Enter, Shift+Enter, autoscroll, novas recebidas, leitura individual e retry", async ({
  page,
}) => {
  const x = await seed(page);
  const opening: any = await crpc(page, "central_consumer_send", {
    p_request: x.q.code,
    p_body: "Início da conversa 049",
    p_key: crypto.randomUUID(),
  });
  for (let i = 0; i < 5; i++)
    await crpc(page, "central_consumer_send", {
      p_request: x.q.code,
      p_body:
        `Mensagem ${i} com histórico.\n` + "Texto longo e legível. ".repeat(30),
      p_key: crypto.randomUUID(),
    });
  await page.goto("/acompanhar/" + x.q.code);
  const box = page.locator(".message-thread"),
    textarea = page.getByLabel("Sua mensagem", { exact: true });
  await expect(textarea).toBeVisible();
  await textarea.fill("Linha um");
  await textarea.press("Shift+Enter");
  await textarea.pressSequentially("Linha dois");
  expect(await textarea.inputValue()).toContain("\n");
  await textarea.press("Enter");
  await expect(textarea).toHaveValue("");
  await expect(
    box.getByText("Linha um\nLinha dois", { exact: true }),
  ).toBeVisible();
  await box.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });
  let ctx: any = await rpc(page, "central_context", { p_code: opening.code });
  await rpc(page, "central_act", {
    p_code: opening.code,
    p_revision: ctx.ticket.revision,
    p_action: "message",
    p_data: { body: "Resposta recebida enquanto lê o histórico" },
    p_key: crypto.randomUUID(),
  });
  await page
    .getByRole("button", { name: "Atualizar conversa", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Nova mensagem.*ir ao final/ }),
  ).toBeVisible();
  expect(await box.evaluate((el) => el.scrollTop)).toBe(0);
  await page
    .getByRole("button", { name: /Nova mensagem.*ir ao final/ })
    .click();
  await expect(
    box.getByText("Resposta recebida enquanto lê o histórico", { exact: true }),
  ).toBeVisible();
  let failed = false;
  await page.route("**/rest/v1/rpc/central_consumer_send", async (route) => {
    if (!failed) {
      failed = true;
      await route.abort("failed");
    } else await route.continue();
  });
  await textarea.fill("Reenvio seguro 049");
  await page
    .getByRole("button", { name: "Enviar ao atendimento", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirmar envio anterior" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar envio anterior" }).click();
  await expect(textarea).toHaveValue("");
  await expect(
    box.getByText("Reenvio seguro 049", { exact: true }),
  ).toHaveCount(1);
  await page.unroute("**/rest/v1/rpc/central_consumer_send");
  await page.goto(`/painel/${x.org}`);
  await expect(
    page.getByRole("heading", { name: "Mensagens não lidas" }),
  ).toBeVisible();
  await page.goto(`/painel/${x.org}/atendimento?ticket=${opening.code}`);
  await expect(page.locator(".message-thread")).toBeVisible();
  await page.locator(".message-thread").scrollIntoViewIfNeeded();
  await page.locator(".message-thread").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect
    .poll(async () => {
      const u: any = await rpc(page, "central_unread", { p_org: x.org });
      return u.items.some((i: any) => i.code === opening.code);
    })
    .toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "reports/syzia-049/screenshots/chat-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBe(0);
});
test("049-B03 IME, teclado móvel, download móvel e telefone amigável sem apagar inválido", async ({
  page,
  browser,
}) => {
  const x = await seed(page);
  await crpc(page, "central_consumer_send", {
    p_request: x.q.code,
    p_body: "Teste de teclado 049",
    p_key: crypto.randomUUID(),
  });
  await page.goto("/acompanhar/" + x.q.code);
  const input = page.getByLabel("Sua mensagem", { exact: true });
  await expect(input).toBeVisible();
  await input.fill("Composição IME");
  await input.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
  });
  await expect(input).toHaveValue("Composição IME");
  expect(
    (
      await crpc(page, "central_consumer_thread", { p_request: x.q.code })
    ).messages.some((m: any) => m.body === "Composição IME"),
  ).toBe(false);
  const ctx = await browser.newContext({
    storageState: await page.context().storageState(),
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "pt-BR",
  });
  try {
    const mobile = await ctx.newPage();
    await mobile.goto("http://127.0.0.1:5173/acompanhar/" + x.q.code);
    const message = mobile.getByLabel("Sua mensagem", { exact: true });
    await message.fill("Linha móvel");
    await message.press("Enter");
    await expect(message).toHaveValue("Linha móvel\n");
    const download = mobile.waitForEvent("download");
    await mobile
      .getByRole("button", { name: "Baixar comprovante", exact: true })
      .click();
    await (
      await download
    ).saveAs("reports/syzia-049/documents/comprovante-touch.pdf");
  } finally {
    await ctx.close();
  }
  await page.goto("/empresa/ms-auto-ficticia");
  const card = page
    .locator(".c-service")
    .filter({ has: page.getByRole("heading", { name: x.name, exact: true }) });
  await card.getByRole("button", { name: "Adicionar ao pedido" }).click();
  await page
    .getByRole("button", { name: "Continuar pedido", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  for (
    let i = 0;
    i < 4 &&
    !(await dialog.getByLabel("WhatsApp com DDD", { exact: true }).isVisible());
    i++
  )
    await dialog
      .getByRole("button", { name: "Continuar →", exact: true })
      .click();
  const phone = dialog.getByLabel("WhatsApp com DDD", { exact: true });
  await phone.fill("20999991234");
  await dialog.getByLabel("Seu nome", { exact: true }).click();
  await expect(phone).toHaveValue("20999991234");
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  await expect(
    dialog.getByText(/Confira o DDD e o número completo/),
  ).toBeVisible();
  await phone.fill("+55 87 99999-1234");
  await dialog.getByLabel("Seu nome", { exact: true }).click();
  await expect(phone).toHaveValue("(87) 99999-1234");
  await expect(phone).toHaveAttribute("aria-invalid", "false");
});
test("049-B04 polling pausa em aba oculta e não sobrepõe consulta pendente", async ({
  page,
}) => {
  const x = await seed(page);
  await page.clock.install();
  await page.goto("/acompanhar/" + x.q.code);
  await expect(page.getByLabel("Sua mensagem", { exact: true })).toBeVisible();
  let count = 0,
    pending = 0,
    max = 0,
    release: () => void = () => {};
  const gate = new Promise<void>((ok) => (release = ok));
  await page.route("**/rest/v1/rpc/central_consumer_thread", async (route) => {
    count++;
    pending++;
    max = Math.max(max, pending);
    await gate;
    await route.continue();
    pending--;
  });
  await page.clock.fastForward(16000);
  await expect.poll(() => count).toBe(1);
  await page.clock.fastForward(60000);
  expect(count).toBe(1);
  expect(max).toBe(1);
  release();
  await expect.poll(() => pending).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const before = count;
  await page.clock.fastForward(60000);
  expect(count).toBe(before);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => count).toBe(before + 1);
  expect(max).toBe(1);
});
