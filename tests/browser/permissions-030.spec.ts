import { test, expect } from "@playwright/test";
import { setupConsumer } from "../support/consumer-browser";
import { users } from "../support/consumer-db.mjs";
import { randomUUID } from "node:crypto";
test.setTimeout(60000);
async function login(page: any, email: string) {
  await page.goto("/entrar");
  await page
    .getByRole("button", { name: "Acesso da operação VIRELOQ" })
    .click();
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page
    .getByLabel("Senha", { exact: true })
    .fill("FictitiousPassword123!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("http://127.0.0.1:4173/");
}
async function grant(
  c: any,
  user: string,
  actions: string[],
  scope = "organization",
) {
  await c.asAdmin(async (x: any) => {
    const t = await x.rpc("permissions_team", { p_org: x.orgs.A });
    const m = t.members.find((m: any) => m.user_id === users[user]);
    await x.rpc("permissions_save", {
      p_org: x.orgs.A,
      p_user: users[user],
      p_revision: m.revision,
      p_grants: actions.map((action) => ({ action, granted: true, scope })),
      p_key: randomUUID(),
    });
  });
}
test("030 cobrança individual 170/50/120 sem consolidados; revogação em tela aberta", async ({
  page,
}) => {
  const c = await setupConsumer(page, { central: true });
  try {
    let id = "";
    await c.asAdmin(async (x: any) => {
      const a = await x.rpc("financial_account_save", {
        p_org: x.orgs.A,
        p_id: null,
        p_revision: 0,
        p_data: {
          description: "Serviço individual fictício",
          total_cents: 17000,
          assigned_to: users.agentA,
        },
        p_key: randomUUID(),
      });
      id = a.id;
      await x.rpc("financial_receipt_record", {
        p_org: x.orgs.A,
        p_account: id,
        p_amount: 5000,
        p_date: new Date().toISOString().slice(0, 10),
        p_method: "pix",
        p_note: "Demonstração",
        p_key: randomUUID(),
      });
    });
    await grant(
      c,
      "agentA",
      [
        "finance.accounts.read",
        "finance.receipts.record",
        "finance.history.read",
      ],
      "assigned",
    );
    await login(page, "agenta@example.invalid");
    await page.goto("/painel/" + c.orgs.A + "/financeiro?conta=" + id);
    await expect(page.locator(".finance-values")).toContainText("170,00");
    await expect(page.locator(".finance-values")).toContainText("50,00");
    await expect(page.locator(".finance-values")).toContainText("120,00");
    for (const name of ["Caixa", "Despesas", "Visão geral", "Recebimentos"])
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
        0,
      );
    await page.getByLabel("Valor recebido (R$)").fill("120");
    await page
      .getByRole("button", { name: "Confirmar registro de recebimento" })
      .click();
    await expect(page.getByLabel("Valor recebido (R$)")).toHaveCount(0);
    expect(c.calls).not.toContain("financial_summary");
    expect(c.calls).not.toContain("financial_expenses");
    await grant(c, "agentA", []);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByRole("heading", { name: "Acesso não disponível" }),
    ).toBeVisible();
    await expect(page.locator(".finance-values")).toHaveCount(0);
  } finally {
    await c.close();
  }
});
test("030 leitura da página não oferece publicação nem dados operacionais", async ({
  page,
}) => {
  const c = await setupConsumer(page, { central: true });
  try {
    await grant(c, "worker", ["page.read"]);
    await login(page, "worker@example.invalid");
    await page.goto("/painel/" + c.orgs.A + "/pagina");
    await expect(
      page.getByRole("heading", { name: "Página da empresa", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publicar dados aprovados" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Salvar identidade visual" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: "Portfólio", exact: true }),
    ).toHaveCount(0);
    await page.goto("/painel/" + c.orgs.A + "/financeiro");
    await expect(
      page.getByRole("heading", { name: "Acesso não disponível" }),
    ).toBeVisible();
  } finally {
    await c.close();
  }
});
