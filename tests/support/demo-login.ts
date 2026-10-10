import { expect } from "@playwright/test";
export async function demoLogin(page: any, email = "admin@example.invalid") {
  await page.goto("/entrar");
  await page.getByLabel("E-mail ou usuário", { exact: true }).fill(email);
  await page
    .getByLabel("Senha", { exact: true })
    .fill("FictitiousPassword123!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/(app|admin|painel|operacao-syzia)/);
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Minhas empresas" }),
  ).toBeVisible();
}
