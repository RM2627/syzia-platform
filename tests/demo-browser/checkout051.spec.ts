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
async function setup(page: any, overrides: any = {}) {
  await mockCheckoutSDK(page);
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
    page.getByRole("button", { name: "Confirmar meio de pagamento" }),
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
      .getByRole("button", { name: "Confirmar meio de pagamento" })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "Confirmar meio de pagamento" }),
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
    expect(ax).toContain("Confirmar meio de pagamento");
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
    .getByRole("button", { name: "Confirmar meio de pagamento" })
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
    .getByRole("button", { name: "Confirmar meio de pagamento" })
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
test("051 UI one POST, token only, disabled CTA during processing, official confirmation", async ({
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
    .getByRole("button", { name: "Confirmar meio de pagamento" })
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
    "plan_version_id",
    "request_key",
    "trial_expected",
  ]);
  expect(JSON.stringify(posts)).not.toContain("52998224725");
  expect(JSON.stringify(posts)).not.toContain("titular@example.invalid");
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
    .getByRole("button", { name: "Confirmar meio de pagamento" })
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
    .getByRole("button", { name: "Confirmar meio de pagamento" })
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
    .getByRole("button", { name: "Confirmar meio de pagamento" })
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
