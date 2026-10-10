import { expect } from "@playwright/test";
export async function verifyRegistration(page: any) {
  await expect(
    page.getByRole("heading", { name: "Confira o cadastro da empresa" }),
  ).toBeVisible();
  await page.getByLabel("CPF", { exact: true }).fill("11111111111");
  await page.getByRole("button", { name: "Verificar e continuar" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Minhas empresas", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("CPF", { exact: true }).fill("52998224725");
  await page.getByRole("button", { name: "Verificar e continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Minhas empresas", exact: true }),
  ).toBeVisible();
}
