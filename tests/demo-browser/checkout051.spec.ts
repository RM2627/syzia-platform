import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
import { mockCheckoutSDK, fillCheckout } from "../support/checkout051-sdk";
import { mkdir } from "node:fs/promises";
const catalog = [
  {
    code: "profissional",
    version_id: "00000000-0000-4000-8000-000000000051",
    name: "Profissional",
    price_cents: 8990,
    member_limit: 3,
    capabilities: {
      software: true,
      finance: true,
      analytics: true,
      commercial_followups: true,
    },
  },
];
async function setup(page: any, overrides: any = {}, tokenDelay = 250, outcome: "ok" | "error" | "missing" = "ok") {
  await mockCheckoutSDK(page, tokenDelay, outcome);
  await demoLogin(page, "admin@example.invalid");
  const ctx: any = await page.evaluate(async () =>
    (await import("/src/api.ts")).rpc("foundation_context"),
  );
  const org = ctx.organizations.find(
    (x: any) => x.slug === "ms-auto-ficticia",
  ).id;
  const state: any = {
    managed: true,
    catalog,
    eligibility: "eligible",
    members: 1,
    subscription: null,
    ...overrides,
  };
  await page.route("**/rest/v1/rpc/billing047_context", (r: any) =>
    r.fulfill({ json: state }),
  );
  await page.route("**/billing/status", (r: any) => r.fulfill({ json: state }));
  await page.route("**/billing/config", (r: any) => r.fulfill({ json: {
    public_key: "offline-public-key", payer_email_suggestion: "admin@example.invalid",
  } }));
  await page.goto(`/painel/${org}/assinatura`);
  await expect(
    page.getByRole("heading", { name: "Sua assinatura", exact: true }),
  ).toBeVisible();
  return { state, org };
}
async function open(page: any) {
  await page
    .getByRole("button", { name: "Assinar Profissional", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Iniciar meus 7 dias grátis" }),
  ).toBeEnabled();
}
for (const width of [1440, 768, 390, 320])
  test(`051 UI ${width}: secure fields, summary, focus, no overflow or overlap`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await setup(page);
    await open(page);
    await expect(
      page.getByRole("heading", { name: "Tudo pronto para o próximo passo." }),
    ).toBeFocused();
    await expect(
      page.getByText("Elegível a 7 dias grátis", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("A confirmar", { exact: true })).toHaveCount(2);
    await expect(page.getByText(/Hoje: R\$|\(estimativa/)).toHaveCount(0);
    await expect(page.getByText("Até 3 integrantes na equipe")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBe(0);
    const boxes = await page
      .locator(".mp-payment-panel,.mp-summary")
      .evaluateAll((elements) =>
        elements.map((e) => {
          const r = e.getBoundingClientRect();
          return { l: r.left, r: r.right, t: r.top, b: r.bottom };
        }),
      );
    expect(boxes[0].r <= boxes[1].l || boxes[1].b <= boxes[0].t).toBeTruthy();
    await mkdir("reports/syzia-051/screenshots", { recursive: true });
    await page.screenshot({
      path: `reports/syzia-051/screenshots/checkout-${width}.png`,
      fullPage: true,
    });
    const contrast = await page.locator(".mp-summary").evaluate((root) => {
      const luminance = (rgb: number[]) =>
        rgb
          .map((n) => {
            n /= 255;
            return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
          })
          .reduce((a, n, i) => a + n * [0.2126, 0.7152, 0.0722][i], 0);
      const parse = (s: string) =>
        s
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
      return [...root.querySelectorAll("p,strong,dt,dd,li,span,h2")]
        .filter((e) => e.textContent?.trim())
        .map((e) => {
          let b: Element | null = e,
            bg = "";
          while (b) {
            bg = getComputedStyle(b).backgroundColor;
            if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") break;
            b = b.parentElement;
          }
          const a = luminance(parse(getComputedStyle(e).color)),
            c = luminance(parse(bg));
          return (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05);
        });
    });
    expect(Math.min(...contrast)).toBeGreaterThanOrEqual(4.5);
    await page.getByLabel("Nome no cartão", { exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Emissor do cartão")).toBeFocused();
    await page
      .getByRole("button", { name: "Iniciar meus 7 dias grátis" })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "Iniciar meus 7 dias grátis" }),
    ).toBeInViewport();
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page
        .locator(".mp-checkout")
        .evaluate((e) => getComputedStyle(e).animationName),
    ).toBe("none");
    const ax = await page.locator(".mp-checkout").ariaSnapshot();
    expect(ax).toContain("Nome no cartão");
    expect(ax).toContain("Valor inicial");
    expect(ax).toContain("Iniciar meus 7 dias grátis");
  });
test("051 UI validation: empty, name, document and SDK validity errors stay next to fields; no POST", async ({
  page,
}) => {
  await setup(page);
  let posts = 0;
  await page.route("**/billing/command", (r) => {
    posts++;
    return r.fulfill({ json: {} });
  });
  await open(page);
  await page
    .getByRole("button", { name: "Iniciar meus 7 dias grátis" })
    .click();
  await expect(
    page.getByText("Informe o nome como aparece no cartão."),
  ).toBeVisible();
  await expect(
    page.getByLabel("Nome no cartão", { exact: true }),
  ).toBeFocused();
  await fillCheckout(page);
  await page
    .getByLabel("Documento do titular", { exact: true })
    .fill("00000000000");
  await page
    .getByRole("button", { name: "Iniciar meus 7 dias grátis" })
    .click();
  await expect(
    page.getByText("Confira os dígitos do documento."),
  ).toBeVisible();
  await page
    .frameLocator('iframe[title="Validade"]')
    .getByRole("textbox")
    .fill("01/20");
  await page.getByLabel("Nome no cartão", { exact: true }).focus();
  await expect(
    page.getByText("Informe uma validade válida no formato mês/ano."),
  ).toBeVisible();
  expect(posts).toBe(0);
  await expect(page.getByText("MUST_NOT_BE_DISPLAYED")).toHaveCount(0);
});
test("051 UI one POST, token and confirmed payer email only, disabled CTA during processing, official confirmation", async ({
  page,
}) => {
  const { state } = await setup(page);
  let posts: any[] = [];
  let release: () => void = () => {};
  const wait = new Promise<void>((ok) => (release = ok));
  await page.route("**/billing/command", async (r) => {
    posts.push(r.request().postDataJSON());
    await wait;
    state.subscription = {
      id: "fixture",
      plan_version_id: catalog[0].version_id,
      code: "profissional",
      state: "trialing",
      price_cents: 8990,
      method: "visa",
      operation_pending: false,
      trial_end: "2030-12-20T12:00:00Z",
      next_charge: "2030-12-20T12:00:00Z",
    };
    await r.fulfill({ json: state });
  });
  await open(page);
  await fillCheckout(page);
  await page
    .getByRole("button", { name: "Iniciar meus 7 dias grátis" })
    .click();
  await expect(
    page.getByRole("button", { name: "Protegendo os dados…", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Enviando solicitação…" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Assinatura confirmada" }),
  ).toHaveCount(0);
  expect(posts).toHaveLength(1);
  expect(Object.keys(posts[0]).sort()).toEqual([
    "action",
    "card_token",
    "organization_id",
    "payer_email",
    "plan_version_id",
    "request_key",
    "trial_expected",
  ]);
  expect(JSON.stringify(posts)).not.toContain("52998224725");
  expect(posts[0].payer_email).toBe("titular@example.invalid");
  expect(JSON.stringify(posts)).not.toContain("admin@example.invalid");
  release();
  await expect(
    page.getByRole("region", { name: "Assinatura confirmada" }),
  ).toBeVisible();
  await expect(
    page.getByText("Em período grátis", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Próxima cobrança: 20 de dez. de 2030/),
  ).toBeVisible();
  await page.screenshot({
    path: "reports/syzia-051/screenshots/confirmacao-desktop.png",
    fullPage: true,
  });
});
test("051 UI definitive refusal permits explicit recovery in same contract, never false success", async ({
  page,
}) => {
  const { state } = await setup(page);
  let posts = 0;
  await page.route("**/billing/command", (r) => {
    posts++;
    state.subscription = {
      id: "fixture",
      plan_version_id: catalog[0].version_id,
      state: "payment_pending",
      price_cents: 8990,
      checkout_retryable: true,
      checkout_trial: true,
      error_code: "billing_provider_invalid_request",
      operation_pending: false,
    };
    return r.fulfill({
      status: 502,
      json: { error: "billing_provider_invalid_request" },
    });
  });
  await open(page);
  await fillCheckout(page);
  await page
    .getByRole("button", { name: "Iniciar meus 7 dias grátis" })
    .click();
  await expect(
    page.getByText(/O Mercado Pago não aceitou os dados/),
  ).toBeVisible();
  await expect(
    page.getByText(/A solicitação anterior não foi concluída/),
  ).toBeVisible();
  await expect(page.getByLabel("Nome no cartão", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByRole("region", { name: "Assinatura confirmada" }),
  ).toHaveCount(0);
  expect(posts).toBe(1);
  await page.getByRole("button", { name: "Atualizar situação" }).click();
  expect(posts).toBe(1);
});
test("051 UI uncertain result or failed follow-up blocks resubmission and success, including browser return", async ({
  page,
}) => {
  const { state, org } = await setup(page);
  let posts = 0;
  await page.route("**/billing/command", (r) => {
    posts++;
    state.subscription = {
      id: "fixture",
      plan_version_id: catalog[0].version_id,
      state: "reconciliation",
      price_cents: 8990,
      checkout_retryable: false,
      operation_pending: true,
    };
    return r.fulfill({ status: 502, json: { error: "billing_timeout" } });
  });
  await open(page);
  await fillCheckout(page);
  await page
    .getByRole("button", { name: "Iniciar meus 7 dias grátis" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Estamos verificando a solicitação" }),
  ).toBeVisible();
  await expect(page.locator(".mp-form")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Assinatura confirmada" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Atualizar situação" }).click();
  expect(posts).toBe(1);
  await page.goto(`/painel/${org}/assinatura?retorno=1&status=approved`);
  await expect(
    page.getByRole("heading", { name: "Estamos verificando a solicitação" }),
  ).toBeVisible();
  await expect(
    page.getByText("Em período grátis", { exact: true }),
  ).toHaveCount(0);
  expect(posts).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "reports/syzia-051/screenshots/pendente-mobile.png",
    fullPage: true,
  });
});
test("051 UI member mismatch and unverified eligibility prevent checkout without changing team", async ({
  page,
}) => {
  const { state } = await setup(page, { members: 4 });
  await page.getByRole("button", { name: "Assinar Profissional" }).click();
  await expect(
    page.getByText(
      "O plano selecionado permite menos integrantes do que a equipe atual. Nenhum vínculo foi alterado.",
    ),
  ).toBeVisible();
  await expect(page.locator(".mp-form")).toHaveCount(0);
  state.eligibility = "verification_required";
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Assinar Profissional" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", {
      name: "Confirme a elegibilidade do período grátis",
    }),
  ).toBeVisible();
});

test("051 UI network failure with unavailable status never offers another create", async ({
  page,
}) => {
  await setup(page);
  let posts = 0;
  await open(page);
  await fillCheckout(page);
  await page.route("**/rest/v1/rpc/billing047_context", (r) => r.abort());
  await page.route("**/billing/status", (r) => r.abort());
  await page.route("**/billing/command", (r) => {
    posts++;
    return r.abort();
  });
  await page
    .getByRole("button", { name: "Iniciar meus 7 dias grátis" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Estamos verificando a solicitação" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Atualizar situação" }).click();
  await expect(page.locator(".mp-form")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Assinar Profissional" }),
  ).toHaveCount(0);
  expect(posts).toBe(1);
});

for (const width of [1440, 390])
  test(`051 payer UI ${width}: suggested email is editable, changes require new confirmation, exact payer is sent`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const { state } = await setup(page);
    await open(page);
    const email = page.getByLabel("E-mail do pagador", { exact: true });
    await expect(email).toHaveValue("admin@example.invalid");
    await fillCheckout(page);
    const consent = page.getByRole("checkbox", { name: /Confirmo o e-mail/ });
    await expect(consent).toBeChecked();
    await email.fill(" New.Payer+Trial@EXAMPLE.INVALID ");
    await email.blur();
    await expect(email).toHaveValue("New.Payer+Trial@example.invalid");
    await expect(consent).not.toBeChecked();
    await expect(page.getByText("E-mail para esta assinatura:")).toContainText("New.Payer+Trial@example.invalid");
    const posts: any[] = [];
    await page.route("**/billing/command", r => {
      posts.push(r.request().postDataJSON());
      state.subscription = { id: "fixture", state: "reconciliation", operation_pending: true };
      return r.fulfill({ json: state });
    });
    await page.getByRole("button", { name: "Iniciar meus 7 dias grátis" }).click();
    await expect(page.getByText("Confirme o e-mail e autorize as condições para continuar.")).toBeVisible();
    expect(posts).toHaveLength(0);
    await consent.check();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    await page.screenshot({ path: `reports/syzia-051/screenshots/payer-confirmed-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Iniciar meus 7 dias grátis" }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0].payer_email).toBe("New.Payer+Trial@example.invalid");
    expect(JSON.stringify(posts)).not.toMatch(/admin@example.invalid|52998224725|4111111111111111/);
    const storage = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
    expect(storage).not.toContain("New.Payer+Trial@example.invalid");
    await expect(page.getByRole("region", { name: "Assinatura confirmada" })).toHaveCount(0);
  });

test("051 payer UI invalid or missing email never submits or silently falls back to admin", async ({ page }) => {
  await setup(page);
  await open(page);
  await fillCheckout(page);
  let posts = 0;
  await page.route("**/billing/command", r => { posts++; return r.fulfill({ json: {} }); });
  for (const value of ["", "not-an-email", "a..b@example.invalid"]) {
    await page.getByLabel("E-mail do pagador", { exact: true }).fill(value);
    await page.getByRole("checkbox", { name: /Confirmo o e-mail/ }).check();
    await page.getByRole("button", { name: "Iniciar meus 7 dias grátis" }).click();
    await expect(page.getByText("Informe um e-mail válido.", { exact: true })).toBeVisible();
  }
  expect(posts).toBe(0);
});

test("051 payer UI locks email while tokenizing and rejects a changed SDK/DOM identity before POST", async ({ page }) => {
  await setup(page, {}, 1200);
  await open(page);
  await fillCheckout(page);
  let posts = 0;
  await page.route("**/billing/command", r => { posts++; return r.fulfill({ json: {} }); });
  await page.getByRole("button", { name: "Iniciar meus 7 dias grátis" }).click();
  const email = page.getByLabel("E-mail do pagador", { exact: true });
  await expect(email).toHaveAttribute("readonly", "");
  // Simulate an SDK/script changing the field despite the UI lock.
  await email.evaluate((e: HTMLInputElement) => { e.value = "unexpected@example.invalid"; });
  await expect(page.getByRole("alert")).toHaveText("Revise os campos indicados antes de continuar.");
  expect(posts).toBe(0);
});

for (const outcome of ["error", "missing"] as const) test(`INT-C SDK ${outcome}: one action fails closed, no command or leaked SDK data`,async({page})=>{
 await setup(page,{},250,outcome);let commands=0;
 await page.route("**/billing/command",r=>{commands++;return r.fulfill({json:{}})});
 await open(page);await fillCheckout(page);
 await page.getByRole("button",{name:"Iniciar meus 7 dias grátis"}).click();
 await expect(page.getByRole("alert")).toContainText("Não foi possível proteger os dados");
 expect(commands).toBe(0);await expect(page.getByText("PRIVATE_SDK_ERROR_SHOULD_NEVER_LEAK")).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Iniciar meus 7 dias grátis"})).toBeEnabled();
});
test("INT-C consumed trial: paid CTA and no free-period promise",async({page})=>{
 await setup(page,{eligibility:"previous_identity"});
 await page.getByRole("button",{name:"Assinar Profissional",exact:true}).click();
 await expect(page.getByRole("button",{name:"Confirmar assinatura mensal"})).toBeEnabled();
 await expect(page.getByRole("button",{name:"Iniciar meus 7 dias grátis"})).toHaveCount(0);
 await expect(page.locator(".mp-summary")).not.toContainText("Elegível a 7 dias grátis");
 let body:any;await page.route("**/billing/command",r=>{body=r.request().postDataJSON();return r.fulfill({status:400,json:{error:"billing_provider_invalid_request"}})});
 await fillCheckout(page);await page.getByRole("button",{name:"Confirmar assinatura mensal"}).click();
 await expect.poll(()=>body?.trial_expected).toBe(false);
});
for(const width of [1440,390]) test(`INT-D ${width}: existing card update and history never claim an overdue invoice paid`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 const subscription={id:"existing",state:"grace_period",code:"profissional",price_cents:8990,method:"visa",method_last_four:"1111",can_update_method:true,operation_pending:false,trial_start:"2030-11-01T12:00:00Z",trial_end:"2030-11-08T12:00:00Z",payments:[{state:"failed",amount_cents:8990,debit_at:"2030-12-08T12:00:00Z"}],payments_count:1};
 const {state}=await setup(page,{subscription,eligibility:"previous_grant"});
 await expect(page.getByText(/visa · final 1111/)).toBeVisible();
 await page.getByText("Histórico de cobranças",{exact:true}).click();
 await expect(page.getByText(/Não aprovada/)).toBeVisible();
 await page.getByRole("button",{name:"Atualizar meio de pagamento"}).click();
 await fillCheckout(page,true);
 let commands:any[]=[];await page.route("**/billing/command",r=>{commands.push(r.request().postDataJSON());return r.fulfill({json:state})});
 await page.getByRole("button",{name:"Atualizar cartão",exact:true}).click();
 await expect(page.getByText("Cartão atualizado. Isso não confirma o pagamento de cobranças pendentes.")).toBeVisible();
 expect(commands).toHaveLength(1);expect(commands[0].action).toBe("method");expect(commands[0]).not.toHaveProperty("payer_email");expect(commands[0]).not.toHaveProperty("trial_expected");
 await expect(page.getByText("Pagamento em regularização",{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
for(const width of [1440,390]) test(`INT-A ${width}: superadmin verifies CPF in one simple audited form`,async({page})=>{
 await page.setViewportSize({width,height:1000});await demoLogin(page,"root@example.invalid");await page.goto("/admin/assinaturas");
 await page.getByLabel("Empresa da assinatura").selectOption({label:"Estúdio Horizonte"});
 await page.getByRole("button",{name:"Registrar identidade verificada"}).click();const d=page.getByRole("dialog");
 await expect(d.getByLabel("Referência da verificação")).toHaveCount(0);await expect(d.getByLabel("Motivo administrativo")).toHaveCount(0);
 await d.getByLabel("CPF conferido",{exact:true}).fill("52998224725");
 let requests:any[]=[];page.on("request",r=>{if(r.url().endsWith("/billing051_verify_identity"))requests.push(r.postDataJSON())});
 await d.getByRole("button",{name:"Confirmar verificação"}).click();expect(requests).toHaveLength(0);
 await d.getByLabel(/Confirmo que realizei a verificação/).check();await d.getByRole("button",{name:"Confirmar verificação"}).click();
 await expect(d).toHaveCount(0);expect(requests).toHaveLength(1);expect(requests[0].p_confirmed).toBe(true);expect(requests[0].p_type).toBe("CPF");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
