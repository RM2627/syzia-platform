import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test("056 browser: minimal contact → automatic invitation row → selection, authorization, batch, activation login return", async ({
  page,
  browser,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await mkdir("reports/syzia-056/ui", { recursive: true });
  await page.goto("/entrar");
  await page
    .getByLabel("E-mail ou usuário", { exact: true })
    .fill("root@example.invalid");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("FictitiousPassword123!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/admin/);
  await page.goto("/admin/comercial/interessados");
  await page
    .getByRole("button", { name: "Cadastrar interessado", exact: true })
    .click();
  await page
    .getByLabel("Nome do interessado ou da empresa")
    .fill("Estúdio Horizonte");
  await expect(page.getByLabel("E-mail (opcional)")).not.toHaveAttribute(
    "required",
  );
  await expect(page.getByLabel("Evidência da autorização")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Salvar cadastro", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Estúdio Horizonte", exact: true }),
  ).toBeVisible();
  await page.goto("/admin/comercial/demonstracoes");
  await page
    .getByLabel("Interessado para vincular ou convidar")
    .selectOption({ label: "Estúdio Horizonte" });
  await expect(page.getByText("1 interessado(s) vinculado(s)")).toBeVisible();
  await page.goto("/admin/comercial/convites");
  let row = page.getByRole("article", {
    name: "Ateliê Aurora · Estúdio Horizonte",
    exact: true,
  });
  await expect(row).toBeVisible();
  await expect(row.getByText("E-mail ainda não informado")).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Gerar link individual" }),
  ).toBeDisabled();
  await expect(
    page.locator("h2").filter({ hasText: "Convites emitidos" }),
  ).toBeVisible();
  await row.locator("summary").click();
  await row.getByLabel("E-mail do destinatário").fill("admin@example.invalid");
  await row.getByRole("button", { name: "Salvar e-mail" }).click();
  await expect(
    row.getByText("admin@example.invalid", { exact: true }),
  ).toBeVisible();
  await row.locator("summary").click();
  await row.getByLabel("Versão do aviso informado").fill("local-v1");
  await row
    .getByLabel("Evidência da autorização")
    .fill("Autorização fictícia fornecida apenas neste teste local.");
  await row.getByLabel("Válida até").fill("2099-01-01T12:00");
  await row
    .getByRole("checkbox", { name: "O contato autorizou esta finalidade." })
    .check();
  await row.getByRole("button", { name: "Registrar autorização" }).click();
  await expect(
    row.getByRole("button", { name: "Gerar link individual" }),
  ).toBeEnabled();
  // Add one other authorized fictional recipient using the same local RPC contracts.
  await page.evaluate(async () => {
    const { rpc } = await import("/src/api.ts");
    const ctx: any = await rpc("commercial_management");
    const q: any = await rpc("commercial_contact_save", {
      p_id: null,
      p_revision: 0,
      p_key: crypto.randomUUID(),
      p_data: { name: "Casa Serena", email: "backup@example.invalid" },
    });
    await rpc("commercial_demo_link", {
      p_demo: ctx.demos[0].id,
      p_lead: q.id,
    });
    await rpc("commercial_contact_authorize", {
      p_id: q.id,
      p_purpose: "demonstration",
      p_authorized: true,
      p_notice: "local-v1",
      p_evidence: "Autorização fictícia para teste local isolado.",
      p_expires: "2099-01-01T00:00:00Z",
    });
  });
  await page.reload();
  row = page.getByRole("article", {
    name: "Ateliê Aurora · Estúdio Horizonte",
    exact: true,
  });
  await page
    .getByRole("button", {
      name: "Selecionar todos os elegíveis desta lista (2)",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Revisar 2 destinatários", exact: true }),
  ).toBeEnabled();
  await row.getByRole("checkbox").first().uncheck();
  await expect(
    page.getByRole("button", { name: "Revisar 1 destinatários", exact: true }),
  ).toBeEnabled();
  await row.getByRole("checkbox").first().check();
  await page
    .getByRole("button", { name: "Revisar 2 destinatários", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirme 2 destinatário(s)" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remover", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirme 1 destinatário(s)" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancelar envio", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Revisar 2 destinatários", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar e enviar convites" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "2 envio(s) autorizado(s)" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Atualizar resultados", exact: true })
    .click();
  await expect(
    page.getByRole("cell", {
      name: "Aceito pelo serviço de e-mail",
      exact: true,
    }),
  ).toHaveCount(2);
  for (const width of [1440, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: `reports/syzia-056/ui/convites-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("combobox", { name: /Finalidade/ })
    .selectOption("activation");
  await row.locator("summary").click();
  await row
    .getByRole("checkbox", {
      name: "O interessado manifestou que deseja testar a SYZIA.",
    })
    .check();
  await row
    .getByRole("button", { name: "Registrar interesse em testar" })
    .click();
  await row.locator("summary").click();
  await row.getByLabel("Versão do aviso informado").fill("local-v1");
  await row
    .getByLabel("Evidência da autorização")
    .fill("Autorização fictícia para receber convite de ativação.");
  await row.getByLabel("Válida até").fill("2099-01-01T12:00");
  await row
    .getByRole("checkbox", { name: "O contato autorizou esta finalidade." })
    .check();
  await row.getByRole("button", { name: "Registrar autorização" }).click();
  await row.getByRole("button", { name: "Gerar link individual" }).click();
  const href = await page
    .getByRole("link", { name: "Abrir em outra aba" })
    .getAttribute("href");
  expect(href).toContain("/ativar-empresa#convite=");
  // Separate browser identity: no administrative session leaks into the recipient.
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(href!);
  await expect(
    visitor.getByRole("heading", {
      name: "Identifique-se para solicitar a ativação",
    }),
  ).toBeVisible();
  await visitor.getByRole("link", { name: "Já tenho conta · Entrar" }).click();
  await visitor
    .getByLabel("E-mail ou usuário", { exact: true })
    .fill("admin@example.invalid");
  await visitor
    .getByLabel("Senha", { exact: true })
    .fill("FictitiousPassword123!");
  await visitor.getByRole("button", { name: "Entrar", exact: true }).click();
  await visitor.waitForURL(/\/ativar-empresa$/);
  await expect(
    visitor.getByRole("heading", { name: "Comprove seu vínculo" }),
  ).toBeVisible();
  await expect(
    visitor.getByRole("heading", { name: "Preparação de Ateliê Aurora" }),
  ).toBeVisible();
  await visitor
    .getByLabel(
      "Informe sua relação com a empresa e como ela pode ser confirmada",
    )
    .fill(
      "Sou responsável pelo Estúdio Horizonte e solicitei esta preparação local.",
    );
  await visitor
    .getByRole("button", { name: "Solicitar análise do vínculo" })
    .click();
  await expect(
    visitor.getByRole("heading", { name: "Solicitação em análise" }),
  ).toBeVisible();
  await visitor.reload();
  await expect(
    visitor.getByRole("heading", { name: "Solicitação em análise" }),
  ).toBeVisible();
  await visitor.screenshot({
    path: "reports/syzia-056/ui/ativacao-retomada.png",
    fullPage: true,
  });
  await visitorContext.close();
  expect(failures).toEqual([]);
});
