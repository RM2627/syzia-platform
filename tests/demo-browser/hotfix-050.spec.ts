// Presentation preview only. These responses do NOT publish legal versions,
// register an acceptance or replace data in the real or local database.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const copy = (name: string) => readFileSync("docs/hotfix-050/" + name, "utf8")
  .replace(/^# .*\n+/m, "").replace(/^## /gm, "");
const docs = [
  { kind: "terms", title: "Termos de Uso", body: copy("TERMOS-DE-USO-REVISADOS.md") },
  { kind: "privacy", title: "Política de Privacidade", body: copy("POLITICA-DE-PRIVACIDADE-REVISADA.md") },
].map(d => ({ ...d, version: "2026-10-13", acceptance_version: "preview-only-not-published", current: true, is_draft: false }));
for (const width of [1440, 768, 390, 320]) {
  test(`050-L01 preview of reviewed text, links and no overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/rest/v1/legal_documents?**", route => route.fulfill({ json: docs }));
    for (const [kind, path] of [["terms", "/termos"], ["privacy", "/privacidade"]]) {
      await page.goto(path);
      const d = docs.find(d => d.kind === kind)!;
      await expect(page.getByRole("heading", { name: d.title, exact: true })).toBeVisible();
      await expect(page.getByText(d.body, { exact: true })).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/MP-01|homologação|Webhooks|Supabase|migration/i);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole("link", { name: "Voltar", exact: true }).click();
      await expect(page).toHaveURL(/\/entrar$/);
      await expect(page.getByRole("link", { name: "Termos de Uso", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Política de Privacidade", exact: true })).toBeVisible();
    }
  });
}
test("050-L02 database document is rendered as text, not executable markup or an invented version", async ({ page }) => {
  await page.route("**/rest/v1/legal_documents?**", route => route.fulfill({ json: [{ ...docs[0], version: "authoritative-fixture", body: "<script>window.legalInjected=true</script>\nTexto autorizado pelo banco." }] }));
  await page.goto("/termos");
  await expect(page.getByText("Versão authoritative-fixture", { exact: true })).toBeVisible();
  await expect(page.getByText(/Texto autorizado pelo banco/)).toBeVisible();
  expect(await page.evaluate(() => (window as any).legalInjected)).toBeUndefined();
});
test("050-L03 public navigation handles database failure without secret or contract fallback", async ({ page }) => {
  await page.route("**/rest/v1/legal_documents?**", route => route.fulfill({ status: 500, json: { message: "private-backend-canary" } }));
  await page.goto("/privacidade");
  await expect(page.getByRole("status")).toHaveText("Não foi possível carregar o documento. Tente novamente.");
  await expect(page.locator("body")).not.toContainText("private-backend-canary");
  await expect(page.getByRole("link", { name: "Voltar", exact: true })).toBeVisible();
});
