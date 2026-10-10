import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
import type { Page, Locator } from "@playwright/test";
const panelOf = (page: Page) =>
  page.getByRole("region", { name: "Instruções de acesso" });
const rowOf = (page: Page, username: string) =>
  page.getByRole("row").filter({ hasText: username });
async function directory(page: Page): Promise<any[]> {
  return page.evaluate(async () =>
    (await import("/src/api.ts")).rpc("people_directory"),
  );
}
async function capture(page: Page, path: string, action: () => Promise<void>) {
  const pending = page.waitForResponse((r) => r.url().endsWith(path));
  await action();
  const r = await pending;
  expect(r.ok()).toBeTruthy();
  return r.json();
}
async function create(page: Page, username: string, name: string) {
  await page.getByRole("button", { name: "Nova pessoa", exact: true }).click();
  await page.getByLabel("Nome completo", { exact: true }).fill(name);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("E-mail de contato", { exact: true })
    .fill(username + "@example.invalid");
  return capture(page, "/access/person", () =>
    page.getByRole("button", { name: "Criar pessoa", exact: true }).click(),
  );
}
async function focus(panel: Locator) {
  await expect(panel).toBeFocused();
  await expect(panel).toBeInViewport();
  await expect
    .poll(() =>
      panel.evaluate((el) => Math.round(el.getBoundingClientRect().top)),
    )
    .toBeGreaterThanOrEqual(0);
  expect(
    await panel.evaluate((el) => el.getBoundingClientRect().top),
  ).toBeLessThan(45);
}
async function copyAll(page: Page, issued: any, reissued = false) {
  const panel = panelOf(page);
  await expect(panel.locator("dd").first()).toHaveText(issued.name);
  await panel
    .getByRole("button", { name: "Copiar código", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    issued.temporary_code,
  );
  await expect(panel.getByRole("status")).toHaveText("Código copiado.");
  await panel.getByRole("button", { name: "Copiar link", exact: true }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).hash).toBe("#access=" + issued.activation_link);
  await expect(panel.getByRole("status")).toHaveText("Link copiado.");
  await panel
    .getByRole("button", { name: "Copiar instruções de acesso", exact: true })
    .click();
  const message = await page.evaluate(() => navigator.clipboard.readText());
  expect(message).toContain(link);
  expect(message).toContain(issued.temporary_code);
  expect(message).toContain(issued.username);
  expect(message).not.toContain("Código da empresa");
  expect(message).not.toContain("undefined");
  if (reissued) {
    expect(message).toContain("Seu acesso à SYZIA foi atualizado.");
    expect(message).toContain(
      "O código e o link anteriores não são mais válidos.",
    );
  }
  await expect(panel.getByRole("status")).toHaveText("Instruções copiadas.");
  return link;
}
async function verify(page: Page, issued: any) {
  return page.request.post("http://127.0.0.1:54321/access/verify", {
    headers: { Origin: "http://127.0.0.1:5173" },
    data: {
      activation_link: issued.activation_link,
      code: issued.temporary_code,
    },
  });
}
async function openPerson(page: Page, username: string) {
  await rowOf(page, username)
    .getByRole("button", { name: "Abrir ficha" })
    .click();
}
async function reset(page: Page) {
  return capture(page, "/access/reset", () =>
    page
      .getByRole("region", { name: "Ficha da pessoa" })
      .getByRole("button", {
        name: "Gerar novo código de primeiro acesso",
        exact: true,
      })
      .click(),
  );
}
for (const [device, width, height] of [
  ["desktop", 1440, 1000],
  ["celular", 390, 844],
] as const)
  test(`037 ${device}: emissão, reemissão, foco, três cópias, isolamento, reload e ativação`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    page.on("dialog", (d) => d.accept());
    await demoLogin(page, "root@example.invalid");
    await page.goto("/admin/equipe");
    const username = "pessoa." + device + "037",
      other = "outra." + device + "037";
    const first = await create(
      page,
      username,
      "Pessoa " + device + " Fictícia",
    );
    await focus(panelOf(page));
    await copyAll(page, first);
    await panelOf(page)
      .getByRole("button", { name: "Fechar instruções" })
      .click();
    await create(page, other, "Outra " + device + " Fictícia");
    await panelOf(page)
      .getByRole("button", { name: "Fechar instruções" })
      .click();
    const before = await directory(page),
      beforeA = before.find((p) => p.username === username),
      beforeB = before.find((p) => p.username === other);
    await openPerson(page, username);
    const issued = await reset(page);
    await expect(
      panelOf(page).getByRole("heading", {
        name: "Novo acesso gerado",
        exact: true,
      }),
    ).toBeVisible();
    await focus(panelOf(page));
    await expect(
      page.getByText("Alteração salva.", { exact: true }),
    ).toHaveCount(0);
    await expect(panelOf(page)).toContainText(
      "O código e o link anteriores não são mais válidos. Compartilhe estas novas instruções com a pessoa.",
    );
    expect(issued.activation_link).not.toBe(first.activation_link);
    expect(issued.temporary_code).not.toBe(first.temporary_code);
    const after = await directory(page),
      afterA = after.find((p) => p.username === username);
    expect(after.length).toBe(before.length);
    expect(after.find((p) => p.username === other)).toEqual(beforeB);
    for (const key of [
      "id",
      "account_id",
      "username",
      "email",
      "kind",
      "roles",
      "links",
      "status",
    ])
      expect(afterA[key]).toEqual(beforeA[key]);
    expect(afterA.state).toBe("pending");
    await expect(rowOf(page, username)).toContainText(
      "Aguardando primeiro acesso",
    );
    await page.screenshot({
      path: `reports/syzia-037/reemissao-${device}.png`,
      fullPage: true,
    });
    const link = await copyAll(page, issued, true);
    expect((await verify(page, first)).status()).toBe(400);
    expect((await verify(page, issued)).status()).toBe(200);
    for (const secret of [issued.temporary_code, issued.activation_link])
      expect(JSON.stringify(after)).not.toContain(secret);
    await page.reload();
    await expect(panelOf(page)).toHaveCount(0);
    await expect(rowOf(page, username)).toContainText(
      "Aguardando primeiro acesso",
    );
    const stored = await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    );
    for (const secret of [issued.temporary_code, issued.activation_link])
      expect(stored).not.toContain(secret);
    await openPerson(page, username);
    const latest = await reset(page);
    await focus(panelOf(page));
    const latestLink = await copyAll(page, latest, true);
    expect(latestLink).not.toBe(link);
    expect((await verify(page, issued)).status()).toBe(400);
    const recipient = await context
      .browser()!
      .newContext({ viewport: { width, height } });
    const owner = await recipient.newPage();
    await owner.goto(latestLink);
    await expect(owner.locator("form input")).toHaveCount(1);
    await expect(
      owner.getByText("Código de acesso (empresa ou SYZIA)", { exact: true }),
    ).toHaveCount(0);
    await owner
      .getByLabel("Código temporário", { exact: true })
      .fill(latest.temporary_code);
    await owner.getByRole("button", { name: "Validar código" }).click();
    await owner
      .getByLabel("Nova senha", { exact: true })
      .fill("Fictitious037Password!");
    await owner
      .getByLabel("Confirmar nova senha", { exact: true })
      .fill("Fictitious037Password!");
    await owner.getByRole("button", { name: "Ativar minha conta" }).click();
    await expect(
      owner.getByRole("heading", { name: "Senha definida" }),
    ).toBeVisible();
    expect((await verify(page, latest)).status()).toBe(400);
    await recipient.close();
    await panelOf(page)
      .getByRole("button", { name: "Fechar instruções" })
      .click();
    await expect(panelOf(page)).toHaveCount(0);
  });

test("037: falha na reemissão remove a apresentação anterior e não mostra sucesso nem novo segredo", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await demoLogin(page, "root@example.invalid");
  await page.goto("/admin/equipe");
  const first = await create(
    page,
    "falha.reemissao037",
    "Pessoa Falha Fictícia",
  );
  await expect(panelOf(page)).toBeVisible();
  await openPerson(page, first.username);
  const before = await directory(page);
  await page.route(
    "**/access/reset",
    (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "access_change_unavailable" }),
      }),
    { times: 1 },
  );
  await page
    .getByRole("region", { name: "Ficha da pessoa" })
    .getByRole("button", {
      name: "Gerar novo código de primeiro acesso",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Esta alteração não está disponível",
  );
  await expect(panelOf(page)).toHaveCount(0);
  await expect(page.getByText("Alteração salva.", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "Novo acesso gerado" }),
  ).toHaveCount(0);
  expect(await directory(page)).toEqual(before);
  expect((await verify(page, first)).status()).toBe(200);
  await reset(page);
  await focus(panelOf(page));
  await expect(page.getByRole("alert")).toHaveCount(0);
});
