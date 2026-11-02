import { test, expect, type BrowserContext } from "@playwright/test";
const id = "11111111-1111-4111-8111-111111111111",
  invite = "22222222-2222-4222-8222-222222222222",
  claim = "33333333-3333-4333-8333-333333333333";
const invitation = "A".repeat(43),
  secret = "FictionalPassword070!",
  email = "lia@example.invalid";
function state() {
  return {
    registered: false,
    confirmed: false,
    intent: false,
    name: "",
    username: "",
    resendStatus: 200,
    signupError: "",
    calls: [] as { path: string; body: any }[],
  };
}
const jwt =
  "eyJhbGciOiJIUzI1NiJ9." +
  Buffer.from(
    JSON.stringify({
      sub: id,
      exp: Math.floor(Date.now() / 1000) + 3600,
      session_id: invite,
    }),
  ).toString("base64url") +
  ".fixture";
async function mock(ctx: BrowserContext, s: ReturnType<typeof state>) {
  await ctx.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(u.hostname)) return route.abort();
    if (u.port !== "54321") return route.continue();
    const method = route.request().method(),
      headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
        "x-supabase-api-version": "2024-01-01",
      };
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    const body = route.request().postDataJSON();
    s.calls.push({ path: u.pathname, body });
    let data: any = {},
      status = 200;
    const user = {
      id,
      aud: "authenticated",
      role: "authenticated",
      is_anonymous: false,
      email,
      email_confirmed_at: s.confirmed ? "2026-11-02T12:00:00Z" : null,
      user_metadata: { display_name: s.name, syzia_username: s.username },
      app_metadata: {},
      created_at: "2026-11-02T12:00:00Z",
    };
    const session = {
      user,
      access_token: jwt,
      refresh_token: "fixture-refresh",
      token_type: "bearer",
      expires_in: 3600,
    };
    if (u.pathname === "/access/signup") {
      s.intent = body.invitation === invitation;
      s.name = body.name;
      s.username = body.username;
      if (s.signupError) {
        status = 503;
        data = { error: s.signupError };
      } else data = { confirmation_required: true };
    } else if (u.pathname === "/access/signup-confirmation") {
      status = s.resendStatus;
      data =
        status === 200
          ? { confirmation_required: true }
          : {
              error:
                status === 429
                  ? "access_rate_limited"
                  : "signup_confirmation_uncertain",
            };
    } else if (u.pathname === "/access/signup-status")
      data = {
        registered: s.registered,
        confirmed: s.confirmed,
        name: s.name,
        username: s.username,
        missing_name: !s.name,
        missing_username: !s.username,
      };
    else if (u.pathname === "/access/selfservice-register") {
      s.name = body.name;
      s.username = body.username;
      s.registered = true;
      data = { registered: true };
    } else if (u.pathname === "/access/identity-login") {
      if (!s.confirmed) {
        status = 400;
        data = { error: "identity_context_required" };
      } else
        data = {
          session,
          identity_setup_required: !s.registered,
          contexts: { personal: { id, generation: 1 }, companies: [] },
        };
    } else if (u.pathname === "/demonstrations/invite")
      data = {
        id: invite,
        purpose: "activation",
        company: "Aurora Interiores",
      };
    else if (u.pathname.endsWith("/user")) data = user;
    else if (u.pathname.endsWith("/token") || u.pathname.endsWith("/verify"))
      data = session;
    else if (u.pathname.endsWith("/commercial_activation_pending"))
      data = s.intent ? [{ id: invite, company: "Aurora Interiores" }] : [];
    else if (u.pathname.endsWith("/commercial_claim_request"))
      data = { id: claim };
    else if (
      u.pathname.endsWith("/commercial_claim_context") ||
      u.pathname.endsWith("/commercial_activation_resume")
    )
      data = {
        id: claim,
        state: "approved",
        company: "Aurora Interiores",
        snapshot_hash: "a".repeat(64),
        organization_id: null,
        stale: false,
        configuration: {
          template: "classic",
          tables: {
            services: [
              {
                id: "service",
                name: "Consultoria de ambientes",
                price_cents: 9900,
              },
            ],
          },
        },
      };
    else if (u.pathname.endsWith("/acquisition_public_context"))
      data = { plans: [] };
    else if (u.pathname.endsWith("/acquisition_plans")) data = [];
    else if (u.pathname.endsWith("/selfservice_context")) data = null;
    else if (u.pathname.includes("/rest/")) data = { plans: [], items: [] };
    return route.fulfill({
      status,
      headers,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
}
test("notebook signup → mobile official callback mock → original notebook login: same preparation, one identity", async ({
  browser,
}) => {
  const s = state(),
    notebook = await browser.newContext(),
    mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
  await mock(notebook, s);
  await mock(mobile, s);
  const a = await notebook.newPage(),
    b = await mobile.newPage();
  const errors: string[] = [];
  a.on("pageerror", (e) => errors.push(e.message));
  b.on("pageerror", (e) => errors.push(e.message));
  await a.goto("/ativar-empresa#convite=" + invitation);
  await a.getByRole("button", { name: "Criar identidade pela SYZIA" }).click();
  await a.getByLabel("Nome completo", { exact: true }).fill("Lia Costa");
  await a.getByLabel("E-mail", { exact: true }).fill(email);
  await a.getByLabel("Sua senha", { exact: true }).fill(secret);
  await a.getByLabel("Confirmar senha", { exact: true }).fill(secret);
  await a
    .getByRole("button", { name: "Criar identidade", exact: true })
    .click();
  await expect(
    a.getByRole("heading", { name: "Confirme seu e-mail", exact: true }),
  ).toBeVisible();
  await expect(a.getByLabel("Nome completo", { exact: true })).toHaveCount(0);
  // Simulated Supabase confirmation, separate clean browser context without notebook storage.
  s.confirmed = true;
  await b.goto(
    "/confirmar-email#type=signup&access_token=" +
      jwt +
      "&refresh_token=fixture-refresh",
  );
  await expect(b).toHaveURL(/\/confirmar-email$/);
  await b
    .getByRole("button", { name: "Confirmar e-mail e continuar", exact: true })
    .click();
  await expect(
    b.getByRole("heading", { name: "Identidade preparada" }),
  ).toBeVisible();
  await expect(b.getByLabel("Nome completo")).toHaveCount(0);
  await expect(b.getByLabel("Username")).toHaveCount(0);
  await b
    .getByRole("button", { name: "Voltar ao convite de ativação" })
    .click();
  await expect(
    b.getByRole("heading", { name: "Convite verificado" }),
  ).toBeVisible();
  await b.locator("summary").filter({ hasText: "Serviços" }).click();
  await expect(b.getByText("Consultoria de ambientes")).toBeVisible();
  await a
    .getByRole("button", { name: "Já confirmei meu e-mail", exact: true })
    .click();
  await expect(a.getByRole("alert")).toContainText(
    "Entre com seu e-mail e senha",
  );
  await a
    .getByRole("link", { name: "Entrar e continuar", exact: true })
    .click();
  await a.getByLabel("E-mail ou usuário", { exact: true }).fill(email);
  await a.getByLabel("Senha", { exact: true }).fill(secret);
  await a.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    a.getByRole("heading", { name: "Identidade preparada" }),
  ).toBeVisible();
  await a
    .getByRole("button", { name: "Voltar ao convite de ativação" })
    .click();
  await expect(
    a.getByRole("heading", { name: "Convite verificado" }),
  ).toBeVisible();
  expect(s.calls.filter((x) => x.path === "/access/signup")).toHaveLength(1);
  expect(
    s.calls.filter((x) => x.path === "/access/selfservice-register"),
  ).toHaveLength(1);
  expect(
    s.calls.some(
      (x) =>
        x.path.endsWith("/commercial_activation_resume") &&
        x.body.p_invite === invite,
    ),
  ).toBe(true);
  expect(
    s.calls.some((x) =>
      /billing|claim_complete|selfservice_complete/.test(x.path),
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
  await notebook.close();
  await mobile.close();
});
for (const width of [1440, 390, 360])
  test(
    "expired/reused link, resend, loss of session and responsive recovery " +
      width,
    async ({ context, page }) => {
      const s = state();
      await mock(context, s);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(
        "/confirmar-email#error=access_denied&error_description=PRIVATE_PROVIDER_DETAIL",
      );
      await expect(page.getByRole("alert")).toContainText(
        "expirou, já foi utilizado",
      );
      await expect(page.locator("body")).not.toContainText(
        "PRIVATE_PROVIDER_DETAIL",
      );
      await page.getByLabel("E-mail do cadastro", { exact: true }).fill(email);
      await page
        .getByRole("button", {
          name: "Reenviar e-mail de confirmação",
          exact: true,
        })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Se houver um cadastro",
      );
      await expect(
        page.getByRole("button", { name: /Reenviar em/ }),
      ).toBeDisabled();
      await page.goto("/cadastrar");
      await expect(
        page.getByRole("heading", { name: "Confirme seu e-mail", exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel("Nome completo")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await page.getByLabel("E-mail do cadastro").focus();
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
        "BUTTON",
      );
    },
  );
test("signup partial failure enters recovery; resend rate limit cannot claim mail sent", async ({
  context,
  page,
}) => {
  const s = state();
  s.signupError = "signup_confirmation_uncertain";
  s.resendStatus = 429;
  await mock(context, s);
  await page.goto("/cadastrar");
  await page.getByLabel("Nome completo", { exact: true }).fill("Lia Costa");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Sua senha", { exact: true }).fill(secret);
  await page.getByLabel("Confirmar senha", { exact: true }).fill(secret);
  await page
    .getByRole("button", { name: "Criar identidade", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirme seu e-mail", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível confirmar o envio",
  );
  await page
    .getByRole("button", {
      name: "Reenviar e-mail de confirmação",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText("Muitas solicitações");
  await expect(page.getByRole("status")).toHaveCount(0);
});
test("partial profile asks only missing username; same-device callback resumes", async ({
  context,
  page,
}) => {
  const s = state();
  s.name = "Lia Costa";
  s.confirmed = true;
  s.intent = true;
  await mock(context, s);
  await page.goto(
    "/confirmar-email#type=signup&access_token=" +
      jwt +
      "&refresh_token=fixture-refresh",
  );
  await page
    .getByRole("button", { name: "Confirmar e-mail e continuar" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Complete sua identidade" }),
  ).toBeVisible();
  await expect(page.getByLabel("Nome completo")).toHaveCount(0);
  await page.getByLabel("Username", { exact: true }).fill("lia.costa");
  await page.getByRole("button", { name: "Salvar identidade" }).click();
  await expect(
    page.getByRole("heading", { name: "Identidade preparada" }),
  ).toBeVisible();
  expect(
    s.calls.find((x) => x.path === "/access/selfservice-register")!.body.name,
  ).toBe("Lia Costa");
});

test("old implicit redirect to cadastrar is accepted without PKCE verifier or duplicate profile", async ({
  context,
  page,
}) => {
  const s = state();
  s.name = "Lia Costa";
  s.username = "lia.costa";
  s.confirmed = true;
  s.intent = true;
  await mock(context, s);
  await page.goto(
    "/cadastrar#type=signup&access_token=" +
      jwt +
      "&refresh_token=fixture-refresh",
  );
  await page
    .getByRole("button", { name: "Confirmar e-mail e continuar" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Identidade preparada" }),
  ).toBeVisible();
  await expect(page.getByLabel("Nome completo")).toHaveCount(0);
  expect(s.calls.filter((x) => x.path === "/access/signup")).toHaveLength(0);
});
test("reproduces original PKCE/implicit mismatch using installed Supabase SDK, without consuming credentials", async ({
  context,
  page,
}) => {
  const s = state();
  await mock(context, s);
  await page.goto("/confirmar-email");
  const result = await page.evaluate(
    async ({ jwt }) => {
      const { supabase } = await import("/src/api.ts");
      history.replaceState(
        null,
        "",
        "/cadastrar#type=signup&access_token=" +
          jwt +
          "&refresh_token=fixture-refresh",
      );
      const C = (supabase as any).constructor;
      const isolated = new C(
        "http://127.0.0.1:54321",
        "sb_publishable_local_contract_test",
        {
          auth: {
            storageKey: "regression-original-pkce",
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: true,
            flowType: "pkce",
          },
        },
      );
      const initialized = await isolated.auth.initialize();
      const r = await isolated.auth.getSession();
      history.replaceState(null, "", "/confirmar-email");
      return { session: r.data.session, error: initialized.error?.message };
    },
    { jwt },
  );
  expect(result.session).toBeNull();
  expect(result.error).toBe("Not a valid PKCE flow url.");
});

test('normal login ignores stale invitation from a previous commercial visit',async({context,page})=>{
 const s=state();s.confirmed=true;s.registered=true;await mock(context,s);await page.goto('/entrar');
 await page.evaluate(token=>sessionStorage.setItem('syzia-commercial-invitation',token),invitation);
 await page.getByLabel('E-mail ou usuário',{exact:true}).fill(email);await page.getByLabel('Senha',{exact:true}).fill(secret);
 const request=page.waitForRequest(r=>r.url().endsWith('/access/identity-login'));
 await page.getByRole('button',{name:'Entrar',exact:true}).click();expect((await request).postDataJSON().invitation).toBeUndefined();
});

test('profile validation outage blocks next step instead of showing a new company form',async({context,page})=>{
 const s=state();s.name='Lia Costa';s.username='lia.costa';s.confirmed=true;await mock(context,s);
 await page.route('**/access/signup-status',route=>route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({error:'access_unavailable'})}));
 await page.goto('/confirmar-email#type=signup&access_token='+jwt+'&refresh_token=fixture-refresh');await page.getByRole('button',{name:'Confirmar e-mail e continuar'}).click();
 await expect(page.getByRole('heading',{name:'Retomar identidade'})).toBeVisible();await expect(page.getByLabel('Nome da empresa',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Entrar e continuar',exact:true})).toBeVisible();
});
