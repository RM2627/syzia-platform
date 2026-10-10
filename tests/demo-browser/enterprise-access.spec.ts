import { verifyRegistration } from "../support/verify-registration";
import { test, expect } from "../support/demo-test";
test.setTimeout(45000);
async function globalLogin(page: any) {
  await page.goto("/entrar");
  await page
    .getByRole("button", { name: "Acesso da operação VIRELOQ" })
    .click();
  await page.getByLabel("E-mail", { exact: true }).fill("root@example.invalid");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("FictitiousPassword123!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Minhas empresas" }),
  ).toBeVisible();
}
for (const mobile of [false, true])
  test(
    "Provisionamento, ativação, legal, equipe e recuperação " +
      (mobile ? "mobile" : "desktop"),
    async ({ page, browser }) => {
      if (mobile) await page.setViewportSize({ width: 390, height: 844 });
      await globalLogin(page);
      await page.goto("/admin/empresas");
      const suffix = Date.now().toString();
      await page
        .getByLabel("Nome da empresa", { exact: true })
        .fill("Empresa Fictícia " + suffix);
      await page
        .getByLabel("Identificador no endereço")
        .fill("ficticia-" + suffix);
      await page.getByLabel("Nome", { exact: true }).fill("Rodrigo");
      await page.getByLabel("Sobrenome", { exact: true }).fill("Santos");
      await expect(page.getByLabel("Username", { exact: true })).toHaveValue(
        "rodrigo.santos",
      );
      await page
        .getByLabel("E-mail do administrador")
        .fill("gestor" + suffix + "@example.invalid");
      const sent = page.waitForResponse((r) =>
        r.url().endsWith("/access/provision"),
      );
      await page
        .getByRole("button", { name: "Criar e ativar empresa" })
        .click();
      const credentials = await (await sent).json();
      expect(credentials.temporary_code).toBeTruthy();
      await expect(
        page.getByRole("heading", { name: "Acesso preparado" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const ctx = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1440, height: 900 },
      });
      const p = await ctx.newPage();
      await p.goto("/ativar-acesso");
      await p
        .getByLabel("Código da empresa", { exact: true })
        .fill(credentials.company_code);
      await p.getByLabel("Usuário", { exact: true }).fill(credentials.username);
      await p
        .getByLabel("Código temporário", { exact: true })
        .fill(credentials.temporary_code);
      await p.getByRole("button", { name: "Validar código" }).click();
      await p
        .getByLabel("Nova senha", { exact: true })
        .fill("FictitiousPassword123!");
      await p.getByLabel("Confirmar nova senha").fill("FictitiousPassword123!");
      await p.getByRole("button", { name: "Ativar minha conta" }).click();
      await expect(
        p.getByRole("heading", { name: "Antes de começar" }),
      ).toBeVisible();
      await p.screenshot({
        path:
          "reports/access/aceite-" + (mobile ? "mobile" : "desktop") + ".png",
        fullPage: true,
      });
      await p.getByLabel("Li e aceito os Termos de Uso").check();
      await p
        .getByLabel("Li e estou ciente da Política de Privacidade")
        .check();
      await p.getByRole("button", { name: "Continuar", exact: true }).click();
      await verifyRegistration(p);
      await expect(
        p.getByRole("heading", { name: "Minhas empresas" }),
      ).toBeVisible();
      await p
        .getByRole("link", { name: new RegExp("Empresa Fictícia " + suffix) })
        .first()
        .click();
      await p
        .getByRole("link", { name: "Pessoas e acessos", exact: true })
        .first()
        .click();
      await p
        .locator("form")
        .filter({
          has: p.getByRole("button", { name: "Criar usuário", exact: true }),
        })
        .getByLabel("Nome", { exact: true })
        .fill("Ana");
      await p.getByLabel("Sobrenome", { exact: true }).fill("Lima");
      const staffSent = p.waitForResponse((r) =>
        r.url().endsWith("/access/provision"),
      );
      await p
        .getByRole("button", { name: "Criar usuário", exact: true })
        .click();
      const staff = await (await staffSent).json();
      expect(staff.temporary_code).toBeTruthy();
      await expect(
        p.getByText("ana.lima", { exact: false }).first(),
      ).toBeVisible();
      await p.screenshot({
        path:
          "reports/access/equipe-" + (mobile ? "mobile" : "desktop") + ".png",
        fullPage: true,
      });
      p.on("dialog", (d) => d.accept());
      const row = p.locator("article").filter({ hasText: "Ana Lima" });
      const reset = p.waitForResponse((r) => r.url().endsWith("/access/reset"));
      await row.getByRole("button", { name: "Redefinir acesso" }).click();
      const renewed = await (await reset).json();
      expect(renewed.temporary_code).not.toBe(staff.temporary_code);
      const staffContext = await browser.newContext();
      const employee = await staffContext.newPage();
      await employee.goto("/ativar-acesso");
      await employee
        .getByLabel("Código da empresa", { exact: true })
        .fill(renewed.company_code);
      await employee
        .getByLabel("Usuário", { exact: true })
        .fill(renewed.username);
      await employee
        .getByLabel("Código temporário", { exact: true })
        .fill(staff.temporary_code);
      await employee.getByRole("button", { name: "Validar código" }).click();
      await expect(employee.getByRole("alert")).toContainText(
        "Código inválido",
      );
      await employee
        .getByLabel("Código temporário", { exact: true })
        .fill(renewed.temporary_code);
      await employee.getByRole("button", { name: "Validar código" }).click();
      await employee
        .getByLabel("Nova senha", { exact: true })
        .fill("StaffPassword123!");
      await employee
        .getByLabel("Confirmar nova senha")
        .fill("StaffPassword123!");
      await employee
        .getByRole("button", { name: "Ativar minha conta" })
        .click();
      await expect(
        employee.getByRole("heading", { name: "Minhas empresas" }),
      ).toBeVisible();
      await expect(
        employee.getByRole("heading", { name: "Antes de começar" }),
      ).toHaveCount(0);
      await staffContext.close();
      await ctx.close();
    },
  );
test("Login genérico, empresa lembrada, logout e páginas legais", async ({
  page,
}) => {
  await page.goto("/entrar");
  await page
    .getByLabel("Código da empresa", { exact: true })
    .fill("A1B2C3D4E5F6");
  await page.getByLabel("Usuário", { exact: true }).fill("inexistente.usuario");
  await page
    .getByLabel("Senha ou código de primeiro acesso", { exact: true })
    .fill("senhaerrada");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível entrar com os dados informados.",
  );
  await page.getByLabel("Usuário", { exact: true }).fill("marina.costa");
  await page
    .getByLabel("Senha ou código de primeiro acesso", { exact: true })
    .fill("FictitiousPassword123!");
  await page.getByLabel("Lembrar esta empresa neste dispositivo").check();
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Minhas empresas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).first().click();
  await page.goto("/entrar");
  await expect(
    page.getByRole("button", { name: "Trocar empresa" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Código da empresa", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Trocar empresa" }).click();
  await expect(
    page.getByLabel("Código da empresa", { exact: true }),
  ).toBeVisible();
  await page.goto("/termos");
  await expect(page.getByText(/MINUTA PARA REVISÃO/)).toBeVisible();
  await page.goto("/privacidade");
  await expect(
    page.getByRole("heading", { name: "Política de Privacidade" }),
  ).toBeVisible();
});
test("Inatividade: polling não renova, aviso aos 29 minutos e logout aos 30", async ({
  page,
}) => {
  await globalLogin(page);
  await page.clock.install();
  await page.clock.setSystemTime(new Date(Date.now() + 29 * 60 * 1000));
  await page.clock.runFor(1100);
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.clock.setSystemTime(new Date(Date.now() + 31 * 60 * 1000));
  await page.clock.runFor(1100);
  await expect(
    page.getByRole("heading", { name: "Entre na VIRELOQ" }),
  ).toBeVisible();
});
test("Sessão compartilhada: logout em uma aba limpa a outra e mantém somente empresa lembrada", async ({
  page,
  context,
}) => {
  await globalLogin(page);
  const other = await context.newPage();
  await other.goto("/");
  await expect(
    other.getByRole("heading", { name: "Minhas empresas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).first().click();
  await expect(
    other.getByRole("heading", { name: "Entre na VIRELOQ" }),
  ).toBeVisible();
  await expect(
    other.getByRole("heading", { name: "Minhas empresas" }),
  ).toHaveCount(0);
});
test("Aviso permite continuar; teclado/toque contam, refresh e polling não", async ({
  page,
}) => {
  await globalLogin(page);
  const start = Date.now();
  await page.clock.install({ time: start });
  await page.clock.setSystemTime(new Date(start + 29 * 60 * 1000));
  await page.clock.runFor(1000);
  await expect(page.getByRole("alertdialog")).toBeVisible();
  let activity = 0;
  await page.route("**/rest/v1/rpc/access_session", async (r) => {
    const b = r.request().postDataJSON();
    if (b.p_activity) activity++;
    await r.fulfill({
      json: {
        idle_seconds: 1800,
        warning_seconds: 60,
        last_activity: new Date(start + 29 * 60 * 1000).toISOString(),
        legal_required: false,
      },
    });
  });
  await page.getByRole("button", { name: "Continuar conectado" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(activity).toBeGreaterThan(0);
  const previous = activity;
  await page.clock.runFor(16000);
  expect(activity).toBe(previous);
  await page.keyboard.press("Tab");
  await expect.poll(() => activity).toBeGreaterThan(previous);
});
test("Links legados não oferecem formulário de senha nem envio por email", async ({
  page,
}) => {
  await page.goto(
    "/aceitar-convite?error=access_denied&error_code=otp_expired",
  );
  await expect(
    page.getByRole("heading", { name: "Acesso por convite descontinuado" }),
  ).toBeVisible();
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  await page.goto("/recuperar-acesso");
  await expect(page.getByText(/Peça ao administrador/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar instruções" }),
  ).toHaveCount(0);
});

test("Logout e outra identidade não recuperam rascunho empresarial anterior", async ({
  page,
}) => {
  const { demoLogin } = await import("../support/demo-login");
  await demoLogin(page);
  await page
    .getByRole("link", { name: /MS Auto Details/ })
    .first()
    .click();
  const a = page.url();
  await page.goto(a + "/configuracao");
  await page
    .getByLabel("Descrição do negócio", { exact: true })
    .fill("RASCUNHO PRIVADO DA EMPRESA A");
  await page.getByRole("button", { name: "Sair", exact: true }).first().click();
  await demoLogin(page, "adminb@example.invalid");
  await page
    .getByRole("link", { name: /Estúdio Horizonte/ })
    .first()
    .click();
  await page.goto(page.url() + "/configuracao");
  await expect(
    page.getByLabel("Descrição do negócio", { exact: true }),
  ).not.toHaveValue("RASCUNHO PRIVADO DA EMPRESA A");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "RASCUNHO PRIVADO",
  );
});
