import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test("056-HF01 browser: compact invitations, authorization blocks, batch and activation preserved", async ({
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
  await expect(row.getByLabel("E-mail do destinatário")).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Gerar link individual" }),
  ).toBeDisabled();
  await expect(
    page.locator("summary").filter({ hasText: "Convites emitidos (0)" }),
  ).toBeVisible();
  await row.getByLabel("E-mail do destinatário").fill("admin@example.invalid");
  await row.getByRole("button", { name: "Adicionar e-mail" }).click();
  await expect(
    row.getByText("admin@example.invalid", { exact: true }),
  ).toBeVisible();
  // Filling an address must not create consent, permit a link, or open legal forms.
  await expect(row.getByLabel("E-mail do destinatário")).toHaveCount(0);
  for (const label of [
    "Versão do aviso informado",
    "Evidência da autorização",
    "Válida até",
  ])
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  await expect(
    row.getByRole("button", { name: "Gerar link individual" }),
  ).toBeDisabled();
  await expect(
    row.getByRole("button", { name: "Enviar por e-mail" }),
  ).toBeDisabled();
  await expect(
    row.getByText(/Sem autorização vigente registrada/),
  ).toBeVisible();
  const blocked = await page.evaluate(async () => {
    const { rpc } = await import("/src/api.ts");
    const { commercialApi } = await import("/src/platform-commercial/api.ts");
    const ctx: any = await rpc("commercial_management"),
      lead = ctx.contacts.find((x: any) => x.name === "Estúdio Horizonte"),
      demo = ctx.demos[0];
    if (
      lead.authorizations.length ||
      ctx.invites.length ||
      ctx.deliveries.length
    )
      throw Error("unexpected consent or invitation");
    const reasons = [];
    for (const [action, body] of [
      ["invite", { id: demo.id, lead_id: lead.id, purpose: "demonstration" }],
      [
        "preview",
        {
          recipients: [{ demo_id: demo.id, lead_id: lead.id }],
          purpose: "demonstration",
        },
      ],
    ] as const) {
      try {
        await commercialApi(action, body);
        reasons.push("unexpected success");
      } catch (e) {
        reasons.push((e as Error).message);
      }
    }
    return reasons;
  });
  expect(blocked).toEqual([
    "commercial_contact_not_authorized",
    "commercial_contact_not_authorized",
  ]);
  // Explicit LOCAL fixture: authorization was obtained outside this screen. Never an application fallback.
  await page.evaluate(async () => {
    const { rpc } = await import("/src/api.ts");
    const ctx: any = await rpc("commercial_management");
    await rpc("commercial_contact_authorize", {
      p_id: ctx.contacts.find((x: any) => x.name === "Estúdio Horizonte").id,
      p_purpose: "demonstration",
      p_authorized: true,
      p_notice: "local-v1",
      p_evidence: "Autorização fictícia restrita ao teste local isolado.",
      p_expires: "2099-01-01T00:00:00Z",
    });
  });
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
    page.getByRole("button", { name: "Enviar selecionados (2)", exact: true }),
  ).toBeEnabled();
  await row.getByRole("checkbox").first().uncheck();
  await expect(
    page.getByRole("button", { name: "Enviar selecionados (1)", exact: true }),
  ).toBeEnabled();
  await row.getByRole("checkbox").first().check();
  await page
    .getByRole("button", { name: "Enviar selecionados (2)", exact: true })
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
    .getByRole("button", { name: "Enviar selecionados (2)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar e enviar convites" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "2 envio(s) autorizado(s)" }),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: "Histórico de envios (2)" })
    .click();
  await page
    .getByRole("button", { name: "Atualizar resultados", exact: true })
    .click();
  await expect(
    page.getByRole("cell", {
      name: "Aceito pelo serviço de e-mail",
      exact: true,
    }),
  ).toHaveCount(2);
  const generated: string[] = [];
  for (const name of ["Estúdio Horizonte", "Casa Serena"]) {
    const card = page.getByRole("article", {
      name: `Ateliê Aurora · ${name}`,
      exact: true,
    });
    await card.getByRole("button", { name: "Gerar link individual" }).click();
    generated.push(
      (await page
        .getByRole("link", { name: "Abrir em outra aba" })
        .getAttribute("href"))!,
    );
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
  }
  expect(generated[0]).not.toBe(generated[1]);
  expect(
    generated.every((x) => x.includes("/atelie-aurora#convite=")),
  ).toBeTruthy();
  await page
    .locator("summary")
    .filter({ hasText: /^Convites emitidos/ })
    .click();
  await page
    .getByRole("button", { name: "Revogar convite", exact: true })
    .first()
    .click();
  await expect(page.getByText(/· Revogado/).first()).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: /^Convites emitidos/ })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: /^Histórico de envios/ })
    .click();
  await page.getByRole("combobox", { name: /Finalidade/ }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Filtrar lista")).toBeFocused();
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
  await expect(
    row.getByRole("button", { name: "Gerar link individual" }),
  ).toBeDisabled();
  // Explicit local fixture: interest and activation-specific permission are independently recorded.
  await page.evaluate(async () => {
    const { rpc } = await import("/src/api.ts");
    const ctx: any = await rpc("commercial_management"),
      c = ctx.contacts.find((x: any) => x.name === "Estúdio Horizonte");
    await rpc("commercial_contact_save", {
      p_id: c.id,
      p_revision: c.revision,
      p_key: crypto.randomUUID(),
      p_data: { stage: "wants_trial" },
    });
    await rpc("commercial_contact_authorize", {
      p_id: c.id,
      p_purpose: "activation",
      p_authorized: true,
      p_notice: "local-v1",
      p_evidence:
        "Autorização fictícia específica de ativação para teste local.",
      p_expires: "2099-01-01T00:00:00Z",
    });
  });
  await page.reload();
  await page
    .getByRole("combobox", { name: /Finalidade/ })
    .selectOption("activation");
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
