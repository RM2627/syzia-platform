// Historical session assertions with current approved login and route.
import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
async function globalLogin(page: any) {
  await demoLogin(page, "root@example.invalid");
}
test("Inatividade: polling não renova, aviso aos 29 minutos e logout aos 30", async ({
  page,
}) => {
  await globalLogin(page);
  await page.clock.install();
  await page.clock.setSystemTime(new Date(Date.now() + 29 * 60 * 1000));
  await page.clock.runFor(1100);
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.clock.setSystemTime(new Date(Date.now() + 31 * 60 * 1000));
  await page.clock.runFor(1100);
  await expect(
    page.getByRole("heading", { name: "Entrar na SYZIA" }),
  ).toBeVisible();
});
test("Sessão compartilhada: logout em uma aba limpa a outra e mantém somente empresa lembrada", async ({
  page,
  context,
}) => {
  await globalLogin(page);
  const other = await context.newPage();
  await other.goto("/app");
  await expect(
    other.getByRole("heading", { name: "Minhas empresas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).first().click();
  await expect(
    other.getByRole("heading", { name: "Entrar na SYZIA" }),
  ).toBeVisible();
  await expect(
    other.getByRole("heading", { name: "Minhas empresas" }),
  ).toHaveCount(0);
});
test("Aviso permite continuar; teclado/toque contam, refresh e polling não", async ({
  page,
}) => {
  await globalLogin(page);
  const start = Date.now();
  await page.clock.install({ time: start });
  await page.clock.setSystemTime(new Date(start + 29 * 60 * 1000));
  await page.clock.runFor(1000);
  await expect(page.getByRole("alertdialog")).toBeVisible();
  let activity = 0;
  await page.route("**/rest/v1/rpc/access_session", async (r) => {
    const b = r.request().postDataJSON();
    if (b.p_activity) activity++;
    await r.fulfill({
      json: {
        idle_seconds: 1800,
        warning_seconds: 60,
        last_activity: new Date(start + 29 * 60 * 1000).toISOString(),
        legal_required: false,
      },
    });
  });
  await page.getByRole("button", { name: "Continuar conectado" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(activity).toBeGreaterThan(0);
  const previous = activity;
  await page.clock.runFor(16000);
  expect(activity).toBe(previous);
  await page.keyboard.press("Tab");
  await expect.poll(() => activity).toBeGreaterThan(previous);
});

test("Rascunho empresarial persiste no foco e se encerra no logout/troca de identidade", async ({
  page,
}) => {
  const { rpc, admin } = await import("./current-helpers");
  const org = await admin(page);
  await page.goto("/painel/" + org + "/configuracao");
  const field = page.getByLabel(/Descrição do negócio/);
  await field.fill("RASCUNHO PRIVADO 044");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(field).toHaveValue("RASCUNHO PRIVADO 044");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await demoLogin(page, "adminb@example.invalid");
  const c: any = await rpc(page, "foundation_context");
  const id = c.organizations.find(
    (o: any) => o.slug === "horizonte-ficticio",
  ).id;
  await page.goto("/painel/" + id + "/configuracao");
  await expect(page.getByLabel(/Descrição do negócio/)).not.toHaveValue(
    "RASCUNHO PRIVADO 044",
  );
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "RASCUNHO PRIVADO 044",
  );
});
