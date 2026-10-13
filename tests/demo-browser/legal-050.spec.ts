import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
for (const width of [1440, 390, 320])
  test(`L050-B01 current database versions and navigation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, title, last] of [
      ["/termos", "Termos de Uso", "sem impor renúncia"],
      ["/privacidade", "Política de Privacidade", "autorização irrestrita"],
    ]) {
      const response = page.waitForResponse((r) =>
        r.url().includes("/rest/v1/legal_documents?"),
      );
      await page.goto(path);
      const docs = await (await response).json();
      const doc = docs.find((d: any) => d.title === title);
      expect(doc.current).toBe(true);
      expect(doc.is_draft).toBe(false);
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      await expect(page.getByText(doc.body, { exact: true })).toBeVisible();
      await expect(page.locator("body")).toContainText(last);
      await expect(page.locator("body")).not.toContainText(
        /MP-01|homologação|Supabase|migration|MINUTA/,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.getByRole("link", { name: "Voltar", exact: true }).click();
      await expect(page).toHaveURL(/\/entrar$/);
    }
  });
for (const width of [1440, 390])
  test(`L050-B02 stale version reload and new acceptance through existing RPC at ${width}px`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(60000);
    await demoLogin(page, "root@example.invalid");
    const suffix = String(Date.now());
    const issued = await page.evaluate(async (suffix) => {
      const { supabase } = await import("/src/api.ts");
      const { data } = await supabase!.auth.getSession();
      const r = await fetch("http://127.0.0.1:54321/access/provision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + data.session!.access_token,
        },
        body: JSON.stringify({
          company_name: "Empresa Ensaio Jurídico " + suffix,
          slug: "juridico-" + suffix,
          name: "Administrador",
          surname: "Ensaio",
          username: "juridico." + suffix,
          email: "juridico" + suffix + "@example.invalid",
          phone: "",
          request_key: crypto.randomUUID(),
        }),
      });
      return r.json();
    }, suffix);
    expect(issued.error).toBeUndefined();
    expect(issued.activation_link).toBeTruthy();
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const owner = await ctx.newPage();
    try {
      await owner.goto("/ativar-acesso#access=" + issued.activation_link);
      await owner
        .getByLabel("Código temporário", { exact: true })
        .fill(issued.temporary_code);
      await owner.getByRole("button", { name: "Validar código" }).click();
      await owner
        .getByLabel("Nova senha", { exact: true })
        .fill("FictitiousLegal050Password!");
      await owner
        .getByLabel("Confirmar nova senha", { exact: true })
        .fill("FictitiousLegal050Password!");
      await owner.getByRole("button", { name: "Ativar minha conta" }).click();
      await expect(
        owner.getByRole("heading", { name: "Senha definida" }),
      ).toBeVisible();
      await owner.getByRole("link", { name: "Entrar", exact: true }).click();
      await owner
        .getByLabel("E-mail ou usuário", { exact: true })
        .fill("juridico." + suffix);
      await owner
        .getByLabel("Senha", { exact: true })
        .fill("FictitiousLegal050Password!");
      await owner.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(
        owner.getByRole("heading", { name: "Antes de começar" }),
      ).toBeVisible();
      await expect(owner.locator("details")).toHaveCount(2);
      await owner.getByLabel("Li e aceito os Termos de Uso").check();
      await owner
        .getByLabel("Li e estou ciente da Política de Privacidade")
        .check();
      const next = await page.request.post(
        "http://127.0.0.1:54321/__test/legal-050/publish",
      );
      expect(next.ok()).toBe(true);
      const { version } = await next.json();
      await owner
        .getByRole("button", { name: "Continuar", exact: true })
        .click();
      await expect(owner.getByRole("alert")).toContainText(
        "Os documentos foram atualizados",
      );
      await expect(
        owner.getByRole("button", { name: "Continuar", exact: true }),
      ).toBeDisabled();
      await owner
        .getByRole("button", { name: "Carregar documentos atualizados" })
        .click();
      await expect(owner.locator("summary").first()).toContainText(version);
      await expect(
        owner.getByLabel("Li e aceito os Termos de Uso"),
      ).not.toBeChecked();
      await expect(
        owner.getByLabel("Li e estou ciente da Política de Privacidade"),
      ).not.toBeChecked();
      await owner.getByLabel("Li e aceito os Termos de Uso").check();
      await owner
        .getByLabel("Li e estou ciente da Política de Privacidade")
        .check();
      const response = owner.waitForResponse((r) =>
        r.url().endsWith("/rpc/access_legal_accept"),
      );
      await owner
        .getByRole("button", { name: "Continuar", exact: true })
        .click();
      const accepted = await response;
      expect(accepted.ok()).toBe(true);
      expect(accepted.request().postDataJSON()).toEqual({
        p_terms: version,
        p_privacy: version,
      });
      await expect(
        owner.getByRole("heading", { name: "Antes de começar" }),
      ).toHaveCount(0);
      expect(
        await owner.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    } finally {
      await ctx.close();
    }
  });
test("L050-B03 historical body is not silently rebranded", async ({ page }) => {
  await page.route("**/rest/v1/legal_documents?**", (route) =>
    route.fulfill({
      json: [
        {
          kind: "terms",
          version: "historic-local",
          title: "Termos VIRELOQ",
          body: "Texto histórico VIRELOQ preservado.",
          current: true,
          is_draft: false,
        },
      ],
    }),
  );
  await page.goto("/termos");
  await expect(
    page.getByText("Texto histórico VIRELOQ preservado.", { exact: true }),
  ).toBeVisible();
});
