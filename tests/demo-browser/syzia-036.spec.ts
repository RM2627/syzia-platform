import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
import type { Page } from "@playwright/test";
async function call(page: Page, name: string, args: any = {}) {
  return page.evaluate(
    async ({ name, args }) => (await import("/src/api.ts")).rpc(name, args),
    { name, args },
  );
}
async function credentials(
  page: Page,
  path: string,
  action: () => Promise<void>,
) {
  const response = page.waitForResponse((r) => r.url().endsWith(path));
  await action();
  return (await response).json();
}
async function verify(page: Page, issued: any) {
  return page.request.post("http://127.0.0.1:54321/access/verify", {
    headers: { Origin: "http://127.0.0.1:5173" },
    data: {
      activation_link: issued.activation_link,
      code: issued.temporary_code,
    },
  });
}
for (const company of [false, true])
  test(`${company ? "Empresa" : "Pessoa sem empresa"}: falha Auth, retomada, três cópias, reemissão e ativação`, async ({
    page,
    context,
  }) => {
    page.on("dialog", (d) => d.accept());
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await demoLogin(
      page,
      company ? "admin@example.invalid" : "root@example.invalid",
    );
    let org = "";
    const name = company ? "Marcelo Empresa" : "Marcelo Pessoal";
    const username = company ? "marcelo.empresa" : "marcelo.pessoal";
    if (company) {
      await page
        .getByRole("link", { name: /MS Auto/ })
        .first()
        .click();
      await page.waitForURL(/\/painel\//);
      org = new URL(page.url()).pathname.split("/")[2];
      await page.goto(`/painel/${org}/acessos`);
      await page
        .locator("section.card")
        .filter({
          has: page.getByRole("heading", { name: "Novo usuário", exact: true }),
        })
        .getByLabel("Nome", { exact: true })
        .fill("Marcelo");
      await page.getByLabel("Sobrenome", { exact: true }).fill("Empresa");
    } else {
      await page.goto("/admin/equipe");
      await page
        .getByRole("button", { name: "Nova pessoa", exact: true })
        .click();
      await page.getByLabel("Nome completo", { exact: true }).fill(name);
      await page
        .getByLabel("E-mail de contato", { exact: true })
        .fill(username + "@example.invalid");
    }
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.request.post(
      "http://127.0.0.1:54321/__test/fail-next-provision",
    );
    const partial = await credentials(
      page,
      company ? "/access/provision" : "/access/person",
      () =>
        page
          .getByRole("button", {
            name: company ? "Criar usuário" : "Criar pessoa",
            exact: true,
          })
          .click(),
    );
    expect(partial.error).toBe("provisioning_incomplete");
    expect(partial.temporary_code).toBeUndefined();
    await expect(
      page.getByRole("region", { name: "Instruções de acesso" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Retomar provisionamento",
        exact: true,
      }),
    ).toBeVisible();
    const issued = await credentials(page, "/access/resume", () =>
      page
        .getByRole("button", { name: "Retomar provisionamento", exact: true })
        .click(),
    );
    expect(issued.delivery).toBe("manual");
    const panel = page.getByRole("region", { name: "Instruções de acesso" });
    await expect(
      panel.getByRole("heading", { name: "Pessoa criada com sucesso" }),
    ).toBeVisible();
    await expect(panel.locator("dd").first()).toHaveText(name);
    await panel
      .getByRole("button", { name: "Copiar código", exact: true })
      .click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      issued.temporary_code,
    );
    await panel
      .getByRole("button", { name: "Copiar link", exact: true })
      .click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain("/ativar-acesso#");
    expect(link).not.toContain(issued.temporary_code);
    await panel
      .getByRole("button", { name: "Copiar instruções de acesso", exact: true })
      .click();
    const message = await page.evaluate(() => navigator.clipboard.readText());
    expect(message).toContain(issued.temporary_code);
    expect(message).toContain(username);
    expect(message).toContain(link);
    expect(message).not.toContain("undefined");
    expect(message).not.toContain("Código da empresa");
    expect(link).toContain("#access=");
    expect(link).not.toContain(username);
    expect(link).not.toContain(issued.company_code);
    if (!company) expect(message).not.toContain("Empresa:");
    await panel.screenshot({
      path: `reports/syzia-036/credencial-${company ? "empresa" : "pessoal"}.png`,
    });
    const before: any = await call(
      page,
      company ? "access_team" : "people_directory",
      company ? { p_org: org } : {},
    );
    await panel.getByRole("button", { name: "Fechar instruções" }).click();
    if (!company)
      await page
        .getByRole("row")
        .filter({ hasText: name })
        .getByRole("button", { name: "Abrir ficha" })
        .click();
    const target = company
      ? page.locator(".access-account").filter({ hasText: name })
      : page.getByRole("region", { name: "Ficha da pessoa" });
    const next = await credentials(page, "/access/reset", () =>
      target
        .getByRole("button", {
          name: "Gerar novo código de primeiro acesso",
          exact: true,
        })
        .click(),
    );
    expect(next.temporary_code).not.toBe(issued.temporary_code);
    expect((await verify(page, issued)).status()).toBe(400);
    const after: any = await call(
      page,
      company ? "access_team" : "people_directory",
      company ? { p_org: org } : {},
    );
    expect((company ? after.accounts : after).map((p: any) => p.id)).toEqual(
      (company ? before.accounts : before).map((p: any) => p.id),
    );
    const consumer = await context.browser()!.newContext();
    const owner = await consumer.newPage();
    // Old link cannot be paired with the new code after reissue.
    await owner.goto(link);
    await owner
      .getByLabel("Código temporário", { exact: true })
      .fill(next.temporary_code);
    await owner.getByRole("button", { name: "Validar código" }).click();
    await expect(owner.getByRole("alert")).toContainText(
      "Não foi possível validar",
    );
    await owner.goto("/ativar-acesso#access=" + next.activation_link);
    await owner.reload();
    expect(new URL(owner.url()).hash).toBe("#access=" + next.activation_link);
    await expect(owner.locator("form input")).toHaveCount(1);
    await expect(owner.getByLabel("Usuário", { exact: true })).toHaveCount(0);
    await expect(
      owner.getByLabel("Código de acesso (empresa ou SYZIA)", { exact: true }),
    ).toHaveCount(0);
    await owner.screenshot({
      path: `reports/syzia-036/ativar-${company ? "empresa" : "pessoal"}.png`,
    });
    await owner
      .getByLabel("Código temporário", { exact: true })
      .fill(next.temporary_code);
    await owner.getByRole("button", { name: "Validar código" }).click();
    await owner
      .getByLabel("Nova senha", { exact: true })
      .fill("Fictitious036Password!");
    await owner
      .getByLabel("Confirmar nova senha", { exact: true })
      .fill("Fictitious036Password!");
    await owner.getByRole("button", { name: "Ativar minha conta" }).click();
    await expect(
      owner.getByRole("heading", { name: "Senha definida" }),
    ).toBeVisible();
    expect(new URL(owner.url()).hash).toBe("");
    await owner.getByRole("link", { name: "Entrar", exact: true }).click();
    await owner.getByLabel("E-mail ou usuário", { exact: true }).fill(username);
    await owner
      .getByLabel("Senha", { exact: true })
      .fill("Fictitious036Password!");
    await owner.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(owner).toHaveURL(company ? /\/painel\// : /\/app/);
    expect((await verify(page, next)).status()).toBe(400);
    await consumer.close();
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Instruções de acesso" }),
    ).toHaveCount(0);
  });

test("Login mostra somente identidade/senha e encaminha uma empresa, múltiplas, equipe global e Super Admin", async ({
  page,
  context,
}) => {
  for (const [identifier, destination] of [
    ["admin@example.invalid", "company"],
    ["own@example.invalid", "multiple"],
    ["shared@example.invalid", "global"],
    ["root@example.invalid", "root"],
  ] as const) {
    const fresh = await context.browser()!.newContext();
    const login = await fresh.newPage();
    await login.goto("/entrar");
    await expect(
      login.getByRole("heading", { name: "Entrar na SYZIA" }),
    ).toBeVisible();
    await expect(login.locator("form input")).toHaveCount(2);
    await expect(
      login.getByText(/Código de acesso|Usar código da empresa/),
    ).toHaveCount(0);
    await login
      .getByLabel("E-mail ou usuário", { exact: true })
      .fill(identifier);
    await login
      .getByLabel("Senha", { exact: true })
      .fill("FictitiousPassword123!");
    await login.getByRole("button", { name: "Entrar", exact: true }).click();
    if (destination === "multiple") {
      await expect(
        login.getByRole("heading", { name: "Escolha seu ambiente" }),
      ).toBeVisible();
      await login.screenshot({ path: "reports/syzia-036/contextos.png" });
      await login.getByRole("button", { name: /MS Auto/ }).click();
    }
    await expect(login).toHaveURL(
      destination === "root"
        ? /\/admin\/empresas/
        : destination === "global"
          ? /\/operacao-syzia/
          : /\/painel\//,
    );
    await fresh.close();
  }
});

test("Primeiro acesso sem link orienta recuperação; login e ativação cabem no celular", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ativar-acesso");
  await expect(
    page.getByText(/Abra o link de primeiro acesso recebido/),
  ).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);
  await page.goto("/ativar-acesso#access=" + "a".repeat(43));
  await expect(page.locator("form input")).toHaveCount(1);
  await page.screenshot({
    path: "reports/syzia-036/ativar-celular.png",
    fullPage: true,
  });
  await page.goto("/entrar");
  await expect(page.locator("form input")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "reports/syzia-036/login-celular.png",
    fullPage: true,
  });
});
