import { test, expect, type Page } from "@playwright/test";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "person@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  is_anonymous: false,
  app_metadata: { vireloq_password_operation: "preserved" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const jwt =
  "eyJhbGciOiJIUzI1NiJ9." +
  Buffer.from(
    JSON.stringify({
      sub: user.id,
      exp: Math.floor(Date.now() / 1000) + 3600,
      session_id: "22222222-2222-4222-8222-222222222222",
    }),
  ).toString("base64url") +
  ".fixture";
const session = {
  user,
  access_token: jwt,
  refresh_token: "fictional-refresh",
  token_type: "bearer",
  expires_in: 3600,
};
const hash = "fictional-hash-".padEnd(64, "a");
async function mock(
  page: Page,
  opts: { recoverStatus?: number; verifyStatus?: number } = {},
) {
  const calls: { path: string; method: string; body: any }[] = [];
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost")
      return route.abort();
    if (u.port !== "54321") return route.continue();
    const method = route.request().method();
    const body = route.request().postDataJSON();
    if (method === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
        },
      });
    calls.push({ path: u.pathname, method, body });
    let status = 200,
      data: any = {};
    if (u.pathname.endsWith("/recover")) {
      status = opts.recoverStatus || 200;
      data =
        status === 429
          ? {
              code: "over_email_send_rate_limit",
              msg: "sensitive provider details",
            }
          : {};
    } else if (
      u.pathname.endsWith("/verify") ||
      u.pathname.endsWith("/token")
    ) {
      status = opts.verifyStatus || 200;
      data =
        status === 200
          ? session
          : { code: "otp_expired", msg: "sensitive provider details" };
    } else if (u.pathname.endsWith("/user")) data = user;
    else if (u.pathname.endsWith("/logout")) {
      status = 204;
      data = null;
    } else if (u.pathname.endsWith("/access/identity-login")) {
      status = 401;
      data = { error: "identity_context_required" };
    } else if (u.pathname.includes("/rest/")) data = { legal_required: true };
    return route.fulfill({
      status,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
        "x-supabase-api-version": "2024-01-01",
        "access-control-expose-headers": "x-supabase-api-version",
      },
      body: status === 204 ? "" : JSON.stringify(data),
    });
  });
  return calls;
}
for (const width of [1440, 390])
  test("B01 recovery end-to-end PKCE " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await mock(page);
    await page.goto("/entrar");
    await page.getByRole("link", { name: "Esqueci minha senha" }).click();
    await expect(page.getByRole("heading", { name: "Esqueci minha senha" })).toBeVisible();
    await page.screenshot({
      path: `test-results/auth-communication/request-${width}.png`,
      fullPage: true,
    });
    await page.getByLabel("E-mail da conta").fill("person@example.invalid");
    await page.getByRole("button", { name: "Enviar instruções" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Se houver uma conta elegível",
    );
    const sent = calls.filter((c) => c.path.endsWith("/recover"));
    expect(sent).toHaveLength(1);
    expect(sent[0].body.code_challenge).toBeTruthy();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.goto("/atualizar-senha?code=fictional-recovery-code-1234567890");
    await expect(
      page.getByRole("button", { name: "Continuar recuperação" }),
    ).toBeVisible();
    expect(calls.filter((c) => c.path.endsWith("/token"))).toHaveLength(0);
    await expect(page).toHaveURL(/\/atualizar-senha$/);
    await page.getByRole("button", { name: "Continuar recuperação" }).click();
    await expect(page.getByLabel("Nova senha", { exact: true })).toBeVisible();
    await page.screenshot({
      path: `test-results/auth-communication/form-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByLabel("Nova senha", { exact: true })
      .fill("FictitiousPassword123!");
    await page.getByLabel("Confirmar nova senha").fill("MismatchPassword123!");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "senhas devem coincidir",
    );
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
    await page
      .getByLabel("Confirmar nova senha")
      .fill("FictitiousPassword123!");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(
      page.getByRole("heading", { name: "Senha atualizada" }),
    ).toBeVisible();
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({
      password: "FictitiousPassword123!",
      code_challenge: null,
      code_challenge_method: null,
    });
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).some((k) =>
          localStorage.getItem(k)?.includes("fictional-refresh"),
        ),
      ),
    ).toBe(false);
    await page.screenshot({
      path: `test-results/auth-communication/recovery-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "Voltar ao login" }).click();
    await expect(page).toHaveURL(/\/entrar$/);
    expect(calls.some((c) => /billing|context|capabilit/.test(c.path))).toBe(
      false,
    );
  });
test("B02 invalid, invite, consumed, expired and direct routes never update password", async ({
  page,
}) => {
  const calls = await mock(page, { verifyStatus: 403 });
  for (const suffix of [
    "",
    "?type=invite&token_hash=" + hash,
    "?code=fictional-recovery-code-1234567890&next=https://evil.invalid",
  ]) {
    await page.goto("/atualizar-senha" + suffix);
    await expect(page.getByRole("alert")).toContainText("inválido");
    expect(await page.getByLabel("Nova senha", { exact: true }).count()).toBe(
      0,
    );
  }
  await page.goto("/atualizar-senha#token_hash=" + hash + "&type=recovery");
  await page.getByRole("button", { name: "Continuar recuperação" }).click();
  await expect(page.getByRole("alert")).toContainText("expirou");
  expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  await expect(page.locator("body")).not.toContainText(
    "sensitive provider details",
  );
});
test("B03 rate limit is friendly; email remains private in output; support is reachable", async ({
  page,
}) => {
  await mock(page, { recoverStatus: 429 });
  await page.goto("/recuperar-acesso");
  await page.getByLabel("E-mail da conta").fill("person@example.invalid");
  await page.getByRole("button", { name: "Enviar instruções" }).click();
  await expect(page.getByRole("alert")).toContainText("Muitas tentativas");
  await expect(page.locator("body")).not.toContainText(
    "sensitive provider details",
  );
  await expect(
    page.getByRole("link", { name: "fale com a SYZIA" }),
  ).toHaveAttribute("href", "mailto:syziaoficial@gmail.com");
});
test("B04 existing enterprise session and pending legal gate cannot become recovery proof or be replaced", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.addInitScript(
    (s) => localStorage.setItem("sb-127-auth-token", JSON.stringify(s)),
    { ...session, expires_at: Math.floor(Date.now() / 1000) + 3600 },
  );
  await page.goto("/atualizar-senha");
  await expect(page.getByRole("alert")).toContainText("inválido");
  expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  const before = await page.evaluate(() =>
    localStorage.getItem("sb-127-auth-token"),
  );
  await page.goto("/atualizar-senha#token_hash=" + hash + "&type=recovery");
  await page.getByRole("button", { name: "Continuar recuperação" }).click();
  await expect(page.getByLabel("Nova senha", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("sb-127-auth-token")),
  ).toBe(before);
  expect(calls.filter((c) => c.path.includes("/rest/"))).toHaveLength(0);
});
test("B05 old invitation stays disabled and current activation remains available", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.goto("/aceitar-convite#token_hash=" + hash + "&type=invite");
  await expect(
    page.getByRole("heading", { name: "Acesso por convite descontinuado" }),
  ).toBeVisible();
  await page.goto("/ativar-acesso#access=" + "a".repeat(43));
  await expect(page.getByLabel("Código temporário")).toBeVisible();
  expect(calls.filter((c) => c.path.includes("/auth/v1/verify"))).toHaveLength(
    0,
  );
});
test("B06 marking a notification sends only org/id, duplicate click is coalesced, failure does not block navigation", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.goto("/tests/auth-communication/notifications.html");
  await page.getByRole("link", { name: "Atualização fictícia" }).dblclick();
  expect(
    calls.filter((c) => c.path.endsWith("/operations_read_notification")),
  ).toHaveLength(1);
  expect(
    calls.find((c) => c.path.endsWith("/operations_read_notification"))!.body,
  ).toEqual({
    p_org: "11111111-1111-4111-8111-111111111111",
    p_id: "22222222-2222-4222-8222-222222222222",
  });
  await expect(page).toHaveURL(/destino$/);
});
test("B07 notification read failure keeps navigation available without marking it locally", async ({
  page,
}) => {
  await mock(page);
  let calls = 0;
  await page.route(
    "**/rest/v1/rpc/operations_read_notification",
    async (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      calls++;
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ code: "42501", message: "access_denied" }),
      });
    },
  );
  await page.goto("/tests/auth-communication/notifications.html");
  await page.getByRole("link", { name: "Atualização fictícia" }).click();
  await expect(page).toHaveURL(/destino$/);
  expect(calls).toBe(1);
});
test("B08 PKCE link in another browser has no proof and cannot update", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.goto("/atualizar-senha?code=fictional-recovery-code-1234567890");
  await page.getByRole("button", { name: "Continuar recuperação" }).click();
  await expect(page.getByRole("alert")).toContainText("inválido");
  expect(
    calls.filter((c) => c.path.endsWith("/token") || c.method === "PUT"),
  ).toHaveLength(0);
});
test('B09 expired signup confirmation has neutral feedback and no raw callback details', async ({page}) => {
 await mock(page);
 await page.route('**/rest/v1/rpc/acquisition_plans', route => route.request().method()==='OPTIONS'?route.fallback():route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'[]'}));
 await page.goto('/cadastrar#error=access_denied&error_code=otp_expired&error_description=PRIVATE_CALLBACK_DETAIL');
 await expect(page.getByRole('alert')).toContainText('link de confirmação');
 await expect(page.locator('body')).not.toContainText('PRIVATE_CALLBACK_DETAIL');
 await expect(page).toHaveURL(/\/cadastrar$/);
});
