import { test, expect } from "@playwright/test";
import { setupConsumer } from "../support/consumer-browser";
import { users } from "../support/consumer-db.mjs";
async function login(p: any) {
  await p.goto("/entrar");
      await p.getByRole("button",{name:"Acesso da operação VIRELOQ"}).click();
  await p.getByLabel("E-mail", { exact: true }).fill("admin@example.invalid");
  await p.getByLabel("Senha", { exact: true }).fill("FictitiousPassword123!");
  await p.getByRole("button", { name: "Entrar", exact: true }).click();
  await p.waitForURL("http://127.0.0.1:4173/");
}
test("Analytics: revogação elimina indicadores na próxima consulta", async ({
  page: p,
}) => {
  const c = await setupConsumer(p, { commercial: true });
  try {
    await login(p);
    await p.goto("/painel/" + c.orgs.A + "/metricas");
    await expect(p.getByText("Do interesse à conversão")).toBeVisible();
    await c.asAdmin(async ({ db }: any) => {
      await db.exec("reset role");
      await db.query(
        "update organization_members set status='suspended' where organization_id=$1 and user_id=$2",
        [c.orgs.A, users.adminA],
      );
    });
    await p.getByRole("button", { name: "Atualizar indicadores ↻" }).click();
    await expect(p.getByRole("alert")).toBeVisible();
    await expect(p.locator(".ds-metric")).toHaveCount(0);
  } finally {
    await c.close();
  }
});
test("Analytics: filtro vazio e datas inválidas sem dados antigos", async ({
  page: p,
}) => {
  const c = await setupConsumer(p, { commercial: true });
  try {
    await login(p);
    await p.goto("/painel/" + c.orgs.A + "/metricas");
    await expect(p.getByText("Do interesse à conversão")).toBeVisible();
    await p.getByLabel("Origem", { exact: true }).selectOption("instagram");
    await expect(
      p.getByText("Um novo período, novas possibilidades"),
    ).toBeVisible();
    await expect(
      p
        .locator(".ds-metric")
        .filter({ hasText: "Oportunidades" })
        .first()
        .locator("strong"),
    ).toHaveText("0");
    await p.getByLabel("Data inicial").fill("2099-01-01");
    await expect(p.getByRole("alert")).toContainText(
      "Escolha um período válido",
    );
    await expect(p.locator(".ds-metric")).toHaveCount(0);
  } finally {
    await c.close();
  }
});
test("Analytics: alteração de URL não concede acesso a B", async ({
  page: p,
}) => {
  const c = await setupConsumer(p, { commercial: true });
  try {
    await login(p);
    await p.goto("/painel/" + c.orgs.A + "/metricas");
    await expect(p.getByText("Do interesse à conversão")).toBeVisible();
    await p.goto("/painel/" + c.orgs.B + "/metricas");
    await expect(
      p.getByRole("heading", { name: "Empresa indisponível" }),
    ).toBeVisible();
    await expect(p.locator(".ds-metric")).toHaveCount(0);
  } finally {
    await c.close();
  }
});
