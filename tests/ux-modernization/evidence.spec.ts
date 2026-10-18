import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
import { mkdir } from "node:fs/promises";
test("UX evidence — real local application at six widths", async ({ page }) => {
  const dir = "reports/ux-modernization/" + (process.env.UX_PHASE || "after");
  await mkdir(dir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/entrar");
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: dir + "/login.png" });
  await demoLogin(page);
  await page.screenshot({ path: dir + "/minhas-empresas.png", fullPage: true });
  const access = (await page.evaluate(
    async () => await (await import("/src/api.ts")).rpc("foundation_context"),
  )) as any;
  const org = access.organizations.find(
    (o: any) => o.slug === "ms-auto-ficticia",
  ).id;
  await page.goto("/painel/" + org);
  await expect(
    page.getByRole("heading", { name: "O que fazer hoje?" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Agenda de hoje" })
      .getByText("Abrir Agenda completa →"),
  ).toBeVisible();
  await page.screenshot({ path: dir + "/home-1440.png", fullPage: true });
  for (const width of [1440, 1280, 768, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/painel/" + org + "/agenda");
    await expect(
      page.getByRole("heading", { name: "Agenda", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Dia", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: dir + "/agenda-" + width + ".png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
    if (process.env.UX_PHASE !== "before" && width < 850) {
      await page
        .getByRole("button", { name: "Abrir menu", exact: true })
        .click();
      await page.screenshot({ path: dir + "/menu-" + width + ".png" });
      await page.keyboard.press("Escape");
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/painel/" + org);
  await expect(
    page.getByRole("heading", { name: "O que fazer hoje?" }),
  ).toBeVisible();
  await page.screenshot({ path: dir + "/home-390.png", fullPage: true });
  await page.route("**/rpc/foundation_context", async (route) => {
    await new Promise((r) => setTimeout(r, 1000));
    await route.continue();
  });
  await page.reload();
  await expect(
    page.getByText("Verificando seu acesso…", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: dir + "/loading-390.png" });
});
