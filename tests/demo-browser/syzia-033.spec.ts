import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
async function rpc(page: any, name: string, args: any = {}) {
  return page.evaluate(
    async ({ name, args }: any) => {
      const api = await import("/src/api.ts");
      return api.rpc(name, args);
    },
    { name, args },
  );
}
async function fit(page: any) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
}
test("Site → plano → identidade → retomada → pagamento fictício → consentimento → onboarding existente", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page).toHaveTitle("SYZIA — Onde tudo se alinha.");
  await expect(
    page.getByRole("heading", { name: /Sua empresa pode crescer/ }),
  ).toBeVisible();
  await fit(page);
  await page.screenshot({
    path: "reports/syzia-033/site-desktop.png",
    fullPage: true,
  });
  await page.goto("/planos");
  await page.getByRole("link", { name: "Escolher plano" }).first().click();
  await page.getByLabel("Nome completo", { exact: true }).fill("João da Silva");
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(
    "joao.silva",
  );
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("cadastro033@example.invalid");
  await page
    .getByLabel("Sua senha", { exact: true })
    .fill("FictitiousPassword033!");
  await page
    .getByLabel("Confirmar senha", { exact: true })
    .fill("FictitiousPassword033!");
  await page
    .getByRole("button", { name: "Criar identidade", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Empresa e plano", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Nome da empresa", { exact: true })
    .fill("Casa Aurora Fictícia");
  await page.getByLabel("Telefone", { exact: true }).fill("11999999999");
  await page.getByLabel("Documento", { exact: true }).fill("52998224725");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Confirme as condições" }),
  ).toBeVisible();
  const first = await rpc(page, "selfservice_context");
  await page.reload();
  await expect(
    page.getByText("Casa Aurora Fictícia", { exact: true }),
  ).toBeVisible();
  expect((await rpc(page, "selfservice_context")).id).toBe(first.id);
  await expect(page.getByText(/Grátis até/)).toBeVisible();
  await page.getByRole("button", { name: "Continuar para pagamento" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Forma de pagamento fictícia" }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.screenshot({
    path: "reports/syzia-033/consentimento-local.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Confirmar e preparar minha empresa" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Empresa preparada." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Abrir configuração da empresa" })
    .click();
  await page
    .getByRole("checkbox", { name: "Li e aceito os Termos de Uso" })
    .check();
  await page
    .getByRole("checkbox", {
      name: "Li e estou ciente da Política de Privacidade",
    })
    .check();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Vamos preparar sua empresa" }),
  ).toBeVisible();
  await page.screenshot({
    path: "reports/syzia-033/onboarding-existente.png",
    fullPage: true,
  });
});
test("Contato cria lead e Aquisição fica no ambiente global; sidebar integrada e username editável", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/contato");
  await page.getByLabel("Nome", { exact: true }).fill("Contato Fictício");
  await page.getByLabel("Empresa", { exact: true }).fill("Ateliê Fictício");
  await page.getByLabel("Telefone / WhatsApp").fill("11999999999");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("lead033@example.invalid");
  await page.getByLabel("Interesse").fill("Organizar atendimento e retornos.");
  await fit(page);
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(
    page.getByRole("heading", { name: "Mensagem recebida." }),
  ).toBeVisible();
  await page.goto("/entrar");
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Acesso da operação SYZIA" }),
  ).toHaveCount(0);
  await fit(page);
  await page.screenshot({
    path: "reports/syzia-033/login-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await demoLogin(page, "root@example.invalid");
  await page.goto("/admin/aquisicao");
  await expect(
    page.getByText("Ateliê Fictício", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "reports/syzia-033/aquisicao.png",
    fullPage: true,
  });
  for (const path of ["/perfil", "/admin/equipe"]) {
    await page.goto(path);
    await expect(
      page.getByRole("button", { name: "Sair", exact: true }),
    ).toBeVisible();
    const box = await page
      .getByRole("button", { name: "Sair", exact: true })
      .boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    await fit(page);
  }
  await page.getByRole("button", { name: "Nova pessoa", exact: true }).click();
  await page.getByLabel("Nome completo", { exact: true }).fill("João da Silva");
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(
    "joao.silva",
  );
  await page.getByLabel("Username", { exact: true }).fill("joao.silva2");
  await page
    .getByLabel("Nome completo", { exact: true })
    .fill("João Carlos da Silva");
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(
    "joao.silva2",
  );
  await page.screenshot({
    path: "reports/syzia-033/equipe-sidebar.png",
    fullPage: true,
  });
  await page
    .getByLabel("E-mail de contato", { exact: true })
    .fill("administrativo033@example.invalid");
  const sent = page.waitForResponse((r) => r.url().endsWith("/access/person"));
  await page.getByRole("button", { name: "Criar pessoa", exact: true }).click();
  const credentials = await (await sent).json();
  expect(credentials.temporary_code).toBeTruthy();
  const context = await page.context().browser()!.newContext();
  const owner = await context.newPage();
  await owner.goto("http://127.0.0.1:5173/ativar-acesso");
  await owner
    .getByLabel("Código de acesso (empresa ou SYZIA)", { exact: true })
    .fill(credentials.company_code);
  await owner.getByLabel("Usuário", { exact: true }).fill(credentials.username);
  await owner
    .getByLabel("Código temporário", { exact: true })
    .fill(credentials.temporary_code);
  await owner.getByRole("button", { name: "Validar código" }).click();
  await owner
    .getByLabel("Nova senha", { exact: true })
    .fill("FictitiousOwner033!");
  await owner
    .getByLabel("Confirmar nova senha", { exact: true })
    .fill("FictitiousOwner033!");
  await owner.getByRole("button", { name: "Ativar minha conta" }).click();
  await expect(
    owner.getByRole("heading", { name: "Minhas empresas" }),
  ).toBeVisible();
  const rejected = await owner.request.post(
    "http://127.0.0.1:54321/access/verify",
    {
      headers: { Origin: "http://127.0.0.1:5173" },
      data: {
        company_code: credentials.company_code,
        username: credentials.username,
        code: credentials.temporary_code,
      },
    },
  );
  expect(rejected.ok()).toBeFalsy();
  await context.close();
});
test("Recorrência R$700 prevista, confirmação paga e recarga preservada", async ({
  page,
}) => {
  await demoLogin(page);
  await page
    .getByRole("link", { name: /MS Auto/ })
    .first()
    .click();
  await page.waitForURL(/\/painel\//);
  const org = new URL(page.url()).pathname.split("/")[2];
  await page.goto("/painel/" + org + "/financeiro");
  await page.getByRole("button", { name: "Despesas", exact: true }).click();
  await page.getByRole("button", { name: "Nova recorrência" }).click();
  await page
    .getByRole("group", { name: "Despesa recorrente", exact: true })
    .getByLabel("Descrição", { exact: true })
    .fill("Aluguel fictício 033");
  await page.getByLabel("Valor por ocorrência (R$)").fill("700");
  await page.getByRole("button", { name: "Salvar recorrência" }).click();
  await expect(
    page.getByText("Prevista / pendente", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "reports/syzia-033/recorrencia-prevista.png",
    fullPage: false,
  });
  await page.getByText("Confirmar pagamento", { exact: true }).click();
  await page.getByRole("button", { name: "Marcar como paga" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Pagamento registrado" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Despesas", exact: true }).click();
  await expect(page.getByText(/Vencimento:.*Paga/)).toBeVisible();
  await page.screenshot({
    path: "reports/syzia-033/recorrencia-paga.png",
    fullPage: false,
  });
});
test("Vermelho/amarelo/azul/magenta × claro/escuro: conteúdo neutro, interação com destaque", async ({
  page,
}) => {
  await demoLogin(page);
  await page
    .getByRole("link", { name: /MS Auto/ })
    .first()
    .click();
  await page.waitForURL(/\/painel\//);
  const org = new URL(page.url()).pathname.split("/")[2];
  await page.goto("/painel/" + org + "/pagina");
  const neutral: Record<string, string[]> = {};
  const publicPage = await page.context().newPage();
  for (const [label, color] of [
    ["vermelho", "#E10909"],
    ["amarelo", "#FFD500"],
    ["azul", "#125CF5"],
    ["magenta", "#E0008F"],
  ])
    for (const theme of ["light", "dark"]) {
      await page.getByLabel("HEX (opcional)").fill(color);
      await page.getByLabel("Aparência da página pública").selectOption(theme);
      await page
        .getByRole("button", { name: "Salvar identidade visual" })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: /Rascunho salvo/ }),
      ).toBeVisible();
      await page
        .locator("#previa")
        .getByRole("button", { name: "Visualizar como cliente", exact: true })
        .click();
      const preview = page
        .getByLabel("Prévia do rascunho")
        .locator(".c-custom-brand");
      await expect(preview).toHaveCSS("color-scheme", theme);
      const report = await preview.evaluate((el) => ({
        paragraphs: [...el.querySelectorAll("p,address")]
          .filter((e) => e.textContent?.trim())
          .map((e) => ({
            color: getComputedStyle(e).color,
            text: e.textContent?.slice(0, 70),
          })),
        brand: getComputedStyle(el).getPropertyValue("--brand-text").trim(),
      }));
      expect(report.paragraphs.length).toBeGreaterThan(5);
      const distinct = [...new Set(report.paragraphs.map((x) => x.color))];
      expect(distinct.length).toBeLessThanOrEqual(4);
      const colors = report.paragraphs.map((x) => x.color);
      if (neutral[theme]) expect(colors).toEqual(neutral[theme]);
      else neutral[theme] = colors;
      await page
        .getByRole("button", { name: "Publicar alterações", exact: true })
        .click();
      await publicPage.goto("/empresa/ms-auto-ficticia");
      await expect
        .poll(() =>
          publicPage
            .locator(".c-custom-brand")
            .evaluate((el) =>
              (el as HTMLElement).style.getPropertyValue("--brand"),
            ),
        )
        .toBe(color);
      await expect(publicPage.locator(".c-custom-brand")).toHaveCSS(
        "color-scheme",
        theme,
      );
      const contrast = await publicPage.evaluate(() => {
        const rgb = (value: string) => value.match(/[\d.]+/g)!.map(Number);
        const lum = (values: number[]) =>
          values
            .slice(0, 3)
            .map((v) => {
              v /= 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            })
            .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        return [
          ...document.querySelectorAll(
            ".c-card-actions .c-button, .c-how, .c-business, .c-duration, .c-business p, .c-how p, .c-facts small, .c-portfolio-images figcaption",
          ),
        ].map((el) => {
          let parent: Element | null = el,
            bg: number[] = [255, 255, 255];
          while (parent) {
            const value = rgb(getComputedStyle(parent).backgroundColor);
            if (value.length === 3 || value[3] === 1) {
              bg = value;
              break;
            }
            parent = parent.parentElement;
          }
          const fg = lum(rgb(getComputedStyle(el).color)),
            back = lum(bg);
          return {
            element: el.className || el.tagName,
            ratio: (Math.max(fg, back) + 0.05) / (Math.min(fg, back) + 0.05),
          };
        });
      });
      expect(contrast.length).toBeGreaterThan(8);
      for (const sample of contrast)
        expect(
          sample.ratio,
          sample.element + " " + label + " " + theme,
        ).toBeGreaterThanOrEqual(4.5);
      await publicPage.screenshot({
        path: `reports/syzia-033/cor-${label}-${theme}.png`,
        fullPage: true,
      });
    }
});
test("Login por identidade: uma empresa entra, múltiplos vínculos escolhem o contexto", async ({
  page,
}) => {
  for (const [identifier, multiple] of [
    ["admin@example.invalid", false],
    ["own@example.invalid", true],
  ] as const) {
    await page.goto("/entrar");
    await page
      .getByLabel("E-mail ou usuário", { exact: true })
      .fill(identifier);
    await page
      .getByLabel("Senha", { exact: true })
      .fill("FictitiousPassword123!");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    if (multiple) {
      await expect(
        page.getByRole("heading", { name: "Escolha seu ambiente" }),
      ).toBeVisible();
      await page.screenshot({ path: "reports/syzia-033/escolha-contexto.png" });
      await page.getByRole("button", { name: /MS Auto/ }).click();
    }
    await page.waitForURL(/\/painel\//);
    await expect(
      page.getByRole("heading", {
        name: multiple ? "Agenda" : "O que precisa ser feito hoje?",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await page.waitForURL(/\/entrar/);
  }
});
test("Username em colisão permanece editável e retoma a mesma identidade no self-service", async ({
  page,
}) => {
  const base = "http://127.0.0.1:54321",
    headers = { Origin: "http://127.0.0.1:5173" };
  const created = await page.request.post(base + "/access/signup", {
    headers,
    data: {
      name: "Colisão Identidade",
      username: "colisao.identidade",
      email: "colisao-base@example.invalid",
      password: "FictitiousPassword033!",
      confirmation: "FictitiousPassword033!",
    },
  });
  const first = await created.json();
  expect(created.ok()).toBeTruthy();
  const registered = await page.request.post(
    base + "/access/selfservice-register",
    {
      headers: {
        ...headers,
        Authorization: "Bearer " + first.session.access_token,
      },
      data: { name: "Colisão Identidade", username: "colisao.identidade" },
    },
  );
  expect(registered.ok()).toBeTruthy();
  await page.goto("/cadastrar");
  await page
    .getByLabel("Nome completo", { exact: true })
    .fill("Colisão Identidade");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("colisao033@example.invalid");
  await page
    .getByLabel("Sua senha", { exact: true })
    .fill("FictitiousPassword033!");
  await page
    .getByLabel("Confirmar senha", { exact: true })
    .fill("FictitiousPassword033!");
  await page
    .getByRole("button", { name: "Criar identidade", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Complete sua identidade" }),
  ).toBeVisible();
  await page
    .getByLabel("Username", { exact: true })
    .fill("colisao.identidade2");
  await page
    .getByRole("button", { name: "Salvar identidade", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Empresa e plano", exact: true }),
  ).toBeVisible();
});
