import { expect, type Page } from "@playwright/test";
export const companyNavigation = (p: Page) =>
  p.locator(".ux-sidebar").getByRole("navigation", {
    name: "Navegação da empresa",
    includeHidden: true,
  });
export async function openWorkspaceMenu(p: Page) {
  await expect(p.locator(".ux-workspace")).toBeVisible();
  const b = p.getByRole("button", { name: "Abrir menu", exact: true });
  if (await b.isVisible()) {
    await b.click();
    return true;
  }
  return false;
}
export async function expectCompanyNavigation(p: Page) {
  const mobile = await openWorkspaceMenu(p);
  await expect(companyNavigation(p)).toBeVisible();
  if (mobile)
    await p.getByRole("button", { name: "Fechar menu", exact: true }).click();
}
export async function clickCompanyNavigation(p: Page, name: string) {
  await openWorkspaceMenu(p);
  const link = companyNavigation(p).getByRole("link", {
    name,
    exact: true,
    includeHidden: true,
  });
  const group = link.locator(
    'xpath=ancestor::section[contains(@class,"ux-nav-group")]',
  );
  if (await group.count()) {
    const toggle = group.getByRole("button").first();
    if ((await toggle.getAttribute("aria-expanded")) === "false")
      await toggle.click();
  }
  await link.click();
}
