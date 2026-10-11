import { test, expect } from "../support/demo-test";
import { seed, rpc, crpc } from "../support/hotfix-seed";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
const out = "reports/hotfix-049";
test("HF-B01 modelo no cadastro/edição, ordem, snapshot, extras e duas abas", async ({
  page,
  context,
}) => {
  const x = await seed(page);
  await page.goto(`/painel/${x.org}/servicos`);
  // The company route is discovered from the existing navigation if needed.
  const editButton = page
    .getByRole("button")
    .filter({ hasText: x.name })
    .first();
  await expect(editButton).toBeVisible();
  await editButton.click();
  const editor = page.getByRole("region", {
    name: "Checklist padrão de execução",
  });
  await expect(editor.getByLabel("Etapa 1", { exact: true })).toHaveValue(
    "Conferir orientações",
  );
  await editor.getByLabel("Nova etapa do modelo").fill("Conferir entrega");
  await editor.getByRole("button", { name: "Adicionar ao modelo" }).click();
  await editor
    .getByRole("button", { name: "Mover etapa 3 para cima", exact: true })
    .click();
  await editor
    .getByLabel("Etapa 2", { exact: true })
    .fill("Revisar entrega combinada");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect
    .poll(async () => {
      const d: any = await rpc(page, "company_service_checklist", {
        p_org: x.org,
        p_service: x.service.id,
      });
      return d.items.map((i: any) => i.title).join("|");
    })
    .toBe("Conferir orientações|Revisar entrega combinada|Preparar materiais");
  const path = `/painel/${x.org}/agenda?ficha=${x.appointment.id}`;
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: x.name, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".execution-checklist")).toContainText("2 etapas");
  await expect(page.locator(".execution-checklist")).not.toContainText(
    "Revisar entrega combinada",
  );
  const tab = await context.newPage();
  await tab.goto(path);
  await expect(tab.getByText("0 de 2 etapas")).toBeVisible();
  await page
    .locator(".execution-checklist input[type=checkbox]")
    .first()
    .click();
  await expect(
    page.locator(".execution-checklist input[type=checkbox]").first(),
  ).toBeChecked();
  await tab
    .locator(".execution-checklist input[type=checkbox]")
    .first()
    .click();
  await expect(tab.getByRole("alert")).toContainText("outra sessão");
  await page.getByLabel("Nova etapa", { exact: true }).fill("Extra da ficha");
  await page
    .getByRole("button", { name: "Adicionar etapa", exact: true })
    .click();
  await expect(page.getByText("1 de 3 etapas")).toBeVisible();
  await page.reload();
  await expect(page.getByText("1 de 3 etapas")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await mkdir(out, { recursive: true });
  await page.screenshot({ path: out + "/ficha-mobile.png", fullPage: true });
  await tab.close();
});
test("HF-B02 WhatsApp canônico, cópia e mesma página em outro navegador; terceiro sem acesso", async ({
  page,
  browser,
  context,
}) => {
  const x = await seed(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/painel/${x.org}/orcamentos?pedido=${x.q.code}`);
  const contact = page.getByRole("region", { name: "Contato com o cliente" });
  await expect(
    contact.getByRole("link", { name: "Conversar pelo WhatsApp" }),
  ).toHaveAttribute("class", /whatsapp-button/);
  await contact
    .getByRole("button", { name: "Enviar orçamento pelo WhatsApp" })
    .click();
  const share = await contact
    .getByRole("link", { name: "Revisar mensagem no WhatsApp" })
    .getAttribute("href");
  const text = new URL(share!).searchParams.get("text")!;
  expect(text).toMatch(/R\$\s120,00/);
  expect(text).toContain("Estimativa inicial");
  expect(text).not.toMatch(/\b[rtq]_[a-f0-9]|PDF|anex/i);
  await contact
    .getByRole("button", { name: "Copiar link de acompanhamento" })
    .click();
  await page.getByRole("button", { name: "Gerar e copiar link" }).click();
  const field = contact.getByLabel("Link pessoal de acompanhamento");
  await expect(field).toHaveValue(/\/acompanhar\/.*#secret=[a-f0-9]{64}/);
  const link = await field.inputValue();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await expect(
    contact.getByRole("link", { name: "Enviar pelo WhatsApp", exact: true }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  const destination = new URL(
    (await contact
      .getByRole("link", { name: "Enviar pelo WhatsApp", exact: true })
      .getAttribute("href"))!,
  );
  expect(destination.searchParams.get("text")).toContain(link);
  const guest = await browser.newContext();
  const g = await guest.newPage();
  await g.goto(link);
  await expect(g.getByRole("heading", { name: "Olá, Marina." })).toBeVisible();
  expect(new URL(g.url()).hash).toBe("");
  expect(new URL(g.url()).pathname).toBe("/acompanhar/" + x.q.code);
  await g.reload();
  await expect(g.getByRole("heading", { name: "Olá, Marina." })).toBeVisible();
  const stranger = await browser.newContext();
  const s = await stranger.newPage();
  await s.goto(link);
  await expect(
    s.getByText("Não foi possível acessar esta solicitação com sua sessão."),
  ).toBeVisible();
  await stranger.close();
  await contact
    .getByRole("button", { name: "Revogar link de acompanhamento" })
    .click();
  await expect(field).toHaveCount(0);
  await g.reload();
  await expect(
    g.getByText("Não foi possível acessar esta solicitação com sua sessão."),
  ).toBeVisible();
  await guest.close();
});
test("HF-B03 Home humana, contador, fallback sem ID, leitura e refresh", async ({
  page,
}) => {
  const x = await seed(page);
  await crpc(page, "central_consumer_send", {
    p_request: x.q.code,
    p_body: "Olá, gostaria de confirmar os detalhes.",
    p_key: crypto.randomUUID(),
  });
  await page.goto(`/painel/${x.org}`);
  const summary = page.locator(".unread-summary");
  await expect(summary).toContainText("Marina Costa (demonstração)");
  await expect(summary).toContainText(x.name);
  expect(await summary.innerText()).not.toMatch(/\bt_[a-f0-9]/);
  await page.reload();
  await expect(summary).toContainText("Marina Costa");
  await summary
    .getByRole("link")
    .filter({ hasText: "Marina Costa" })
    .first()
    .click();
  await expect(page).toHaveURL(/atendimento\?ticket=/);
  await expect(
    page.getByRole("heading", { name: "Marina Costa (demonstração)" }),
  ).toBeVisible();
  // Legacy metadata fallback is a UI contract; actual tenant authorization remains covered in SQL.
  await page.route("**/rest/v1/rpc/central_unread", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            code: "t_fixture",
            organization_id: x.org,
            customer: null,
            service: null,
            unread_count: 1,
          },
        ],
      }),
    }),
  );
  await page.goto(`/painel/${x.org}`);
  await expect(summary).toContainText("Conversa com cliente");
  await expect(summary).not.toContainText("t_fixture");
  await expect(summary).toContainText("1 mensagem");
});
test("HF-B04 prévias reais com dados fictícios e landing desktop/mobile/teclado/cadastro", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const x = await seed(
    page,
    false,
    "Consultoria de organização — demonstração",
  );
  const opening: any = await crpc(page, "central_consumer_send", {
    p_request: x.q.code,
    p_body: "Olá! Podemos combinar os detalhes da consultoria?",
    p_key: crypto.randomUUID(),
  });
  await page.setViewportSize({ width: 1280, height: 850 });
  await mkdir(out, { recursive: true });
  for (const [id, path, heading] of [
    ["home", `/painel/${x.org}`, "O que fazer hoje?"],
    [
      "atendimento",
      `/painel/${x.org}/atendimento?ticket=${opening.code}`,
      "Marina Costa",
    ],
    [
      "orcamentos",
      `/painel/${x.org}/orcamentos?pedido=${x.q.code}`,
      "Proposta para",
    ],
    ["agenda", `/painel/${x.org}/agenda`, "Agenda"],
  ]) {
    await page.goto(path);
    await expect(
      page.locator("h1,h2").filter({ hasText: heading }).first(),
    ).toBeVisible();
    if (id === "agenda") {
      await page
        .getByLabel("Data da agenda")
        .fill(x.appointment.starts_at.slice(0, 10));
      await expect(
        page.getByText("Marina Costa (demonstração)").first(),
      ).toBeVisible();
    }
    await page
      .locator("h1,h2")
      .filter({ hasText: heading })
      .first()
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.evaluate(() => {
      window.scrollBy(0, -24);
      return document.fonts.ready;
    });
    await page.screenshot({ path: `${out}/produto-${id}.png` });
    if (process.env.HOTFIX_CAPTURE_PREVIEWS === "1")
      await sharp(`${out}/produto-${id}.png`)
        .webp({ quality: 83 })
        .toFile(`${out}/produto-${id}.webp`);
  }
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Sua página, seus clientes",
    );
    const plans = page.locator(".sy-plan-grid");
    await expect(plans).toContainText("R$ 49,90");
    await expect(plans).toContainText("R$ 89,90");
    await expect(plans).toContainText("R$ 149,90");
    await expect(plans).not.toContainText("1 membros");
    await expect(plans).not.toContainText("Assistido");
    await expect(plans).toContainText("7 dias grátis");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.getByRole("tab", { name: "Home", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "Atendimento", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("tab", { name: "Atendimento", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    const image = page.getByRole("tabpanel").locator("img");
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((i: HTMLImageElement) => i.naturalWidth))
      .toBe(1280);
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: `${out}/landing-${width}.png`,
        fullPage: true,
      });
  }
  await page
    .getByRole("navigation", { name: "Site SYZIA" })
    .getByRole("link", { name: "Começar", exact: true })
    .click();
  await expect(page).toHaveURL(/\/cadastrar/);
  // Sign out only this synthetic staff session so public identity fields can be inspected.
  await page.evaluate(async () => {
    const { supabase } = await import("/src/api.ts");
    await supabase.auth.signOut();
  });
  await page.reload();
  await page.getByLabel("Nome completo", { exact: true }).fill("Marina Souza");
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(
    "marina.souza",
  );
  await page.getByLabel("Username", { exact: true }).fill("marina.exemplo");
  await page
    .getByLabel("Nome completo", { exact: true })
    .fill("Marina Souza Santos");
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(
    "marina.exemplo",
  );
  await expect(page.locator("#signup-next")).toContainText(
    "Se for solicitada confirmação por e-mail",
  );
  await page.goto("/");
  await page
    .locator(".sy-final")
    .getByRole("link", { name: "Criar minha empresa", exact: true })
    .click();
  await expect(page).toHaveURL(/\/cadastrar/);
  await page.goto("/");
  await page
    .getByRole("link", { name: "Escolher plano", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/cadastrar\?plano=/);
  expect(errors).toEqual([]);
});
