import { test, expect } from "@playwright/test";
import { setupConsumer } from "../support/consumer-browser";
import { users } from "../support/consumer-db.mjs";
import { randomUUID } from "node:crypto";
async function login(page: any, email = "agenta@example.invalid") {
  await page.goto("/entrar");
      await page.getByRole("button",{name:"Acesso da operação VIRELOQ"}).click();
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page
    .getByLabel("Senha", { exact: true })
    .fill("FictitiousPassword123!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("http://127.0.0.1:4173/");
}
const code = (c: any, k = "A") => c.central.opportunities[k];
async function open(page: any, c: any, email?: string) {
  await login(page, email);
  await page.goto("/comercial/" + code(c));
  await expect(page.locator(".co-detail h2")).toHaveText("Ana • Fictícia");
}
async function start(page: any) {
  await page
    .getByRole("button", { name: "Assumir tarefa", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Iniciar tentativa", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Iniciar tentativa", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Salvar resultado", exact: true }),
  ).toBeEnabled();
}
test("Comercial: assumir, executar e programar segunda tentativa com histórico", async ({
  page,
}) => {
  const c = await setupConsumer(page, { commercial: true });
  try {
    await open(page, c);
    await start(page);
    await page
      .getByLabel("Observação interna curta")
      .fill("Retorno fictício sem resposta");
    await page
      .getByRole("button", { name: "Salvar resultado", exact: true })
      .click();
    await expect(page.locator(".co-next")).toContainText("Tentativa 2 de 2");
    await page
      .getByText("Histórico de tentativas · 1", { exact: true })
      .click();
    await expect(page.locator(".co-history").first()).toContainText(
      "Retorno fictício",
    );
    await expect(
      page.getByRole("link", { name: "Abrir atendimento e orçamento ↗" }),
    ).toHaveAttribute("href", "/central/" + c.central!.codes.A);
  } finally {
    await c.close();
  }
});
test("Comercial: empresa configura intervalo personalizado e limite", async ({
  page,
}) => {
  const c = await setupConsumer(page, { commercial: true });
  try {
    await login(page, "admin@example.invalid");
    await page.goto("/painel/" + c.orgs.A + "/comercial");
    await page
      .getByRole("button", { name: "Configurar recuperação", exact: true })
      .click();
    await page
      .getByLabel("Intervalo da empresa (minutos)", { exact: true })
      .fill("375");
    await page.getByLabel("Máximo de tentativas", { exact: true }).fill("3");
    await page
      .getByRole("button", { name: "Salvar configuração comercial" })
      .click();
    await expect(
      page.getByText(
        "Configuração comercial salva. Históricos realizados foram preservados.",
      ),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "Configurar recuperação", exact: true })
      .click();
    await expect(
      page.getByLabel("Intervalo da empresa (minutos)", { exact: true }),
    ).toHaveValue("375");
    await expect(
      page.getByLabel("Máximo de tentativas", { exact: true }),
    ).toHaveValue("3");
  } finally {
    await c.close();
  }
});
test("Comercial: desktop, tablet e celular sem overflow", async ({ page }) => {
  const c = await setupConsumer(page, { commercial: true });
  try {
    await open(page, c);
    await start(page);
    for (const [name, width, height] of [
      ["desktop", 1600, 1000],
      ["tablet", 1024, 1366],
      ["mobile", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBeTruthy();
      await page.screenshot({
        path: `reports/visual-phase6/${name}.png`,
        fullPage: true,
      });
    }
  } finally {
    await c.close();
  }
});
test("Comercial: trocar empresa elimina nota em edição e contexto anterior", async ({
  page,
}) => {
  const c = await setupConsumer(page, { commercial: true });
  try {
    await open(page, c, "shared@example.invalid");
    await page.getByLabel("Observação interna curta").fill("RASCUNHO A");
    await page.goto("/comercial/" + code(c, "B"));
    await expect(page.locator(".co-detail h2")).toHaveText("Bruno • Fictício");
    await expect(page.getByLabel("Observação interna curta")).toHaveValue("");
    await expect(page.locator(".co-detail")).not.toContainText("MS Auto");
  } finally {
    await c.close();
  }
});
test("Comercial: link de outra empresa não concede acesso", async ({
  page,
}) => {
  const c = await setupConsumer(page, { commercial: true });
  try {
    await login(page);
    await page.goto("/comercial/" + code(c, "B"));
    await expect(page.locator(".co-detail").getByRole("alert")).toContainText(
      "Ação não autorizada",
    );
    await expect(page.locator(".commercial")).not.toContainText("Bruno");
  } finally {
    await c.close();
  }
});
test("Comercial: revogação em sessão aberta bloqueia nova operação", async ({
  page,
}) => {
  const c = await setupConsumer(page, { commercial: true });
  try {
    await open(page, c);
    await start(page);
    await c.asAdmin(async (x: any) => {
      await x.as("root");
      await x.scalar(
        "select foundation_set_attendant($1,$2,'primary','suspended')",
        [x.orgs.A, users.agentA],
      );
    });
    await page
      .getByRole("button", { name: "Salvar resultado", exact: true })
      .click();
    await expect(page.locator(".co-detail").getByRole("alert")).toContainText(
      "Ação não autorizada",
    );
    await expect(page.getByLabel("Observação interna curta")).toHaveCount(0);
  } finally {
    await c.close();
  }
});
test("Comercial: resposta do consumidor interrompe retorno já aberto", async ({
  page,
}) => {
  const c = await setupConsumer(page, { commercial: true });
  try {
    await open(page, c);
    await start(page);
    await c.asAdmin(async (x: any) => {
      await x.as("alice");
      await x.rpc("central_consumer_send", {
        p_request: c.central!.requests.A,
        p_body: "Já respondi",
        p_key: randomUUID(),
      });
    });
    await page
      .getByRole("button", { name: "Salvar resultado", exact: true })
      .click();
    await expect(page.locator(".co-next")).toContainText(
      "Nenhuma tarefa ativa",
    );
    await expect(page.locator(".co-detail header")).toContainText(
      "Cliente respondeu",
    );
  } finally {
    await c.close();
  }
});
test("Comercial: confirmação perdida recupera resultado sem duplicação", async ({
  page,
}) => {
  const c = await setupConsumer(page, { commercial: true });
  try {
    await open(page, c);
    await start(page);
    let lost = false;
    await page.route("**/rest/v1/rpc/commercial_task_act", async (route) => {
      const args = route.request().postDataJSON();
      if (!lost && args.p_action === "result") {
        lost = true;
        await c.asAdmin(async (x: any) => {
          await x.as("agentA");
          await x.rpc("commercial_task_act", args);
        });
        await route.abort("connectionreset");
      } else await route.fallback();
    });
    await page
      .getByRole("button", { name: "Salvar resultado", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Confirmar resultado anterior",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Confirmar resultado anterior",
        exact: true,
      }),
    ).toHaveCount(0);
    await c.asAdmin(async (x: any) => {
      await x.as("agentA");
      expect(
        (await x.rpc("commercial_context", { p_code: code(c) })).attempts,
      ).toHaveLength(1);
    });
  } finally {
    await c.close();
  }
});
