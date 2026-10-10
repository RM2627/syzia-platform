import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
import sharp from "sharp";
import { createHash } from "node:crypto";
import type { Locator } from "@playwright/test";

async function ratio(item: Locator) {
  await expect(item).toBeVisible();
  const box = (await item.boundingBox())!;
  expect(Math.abs(box.width / box.height - 4 / 3)).toBeLessThan(0.015);
}
async function imageHash(item: Locator) {
  await item.evaluate((img: HTMLImageElement) => img.decode());
  const bytes = await item.evaluate(async (img: HTMLImageElement) =>
    Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())),
  );
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}
test("035: demonstração comercial com uma identificação, desktop e celular", async ({
  page,
}) => {
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/empresa/horizonte-ficticio");
    await expect(page.locator(".c-brand")).toContainText("Estúdio Horizonte");
    await expect(page.locator(".c-demo")).toHaveCount(1);
    await expect(page.locator(".c-demo")).toHaveText(
      "Exemplo de página criada com a SYZIA",
    );
    expect(await page.locator(".consumer").innerText()).not.toMatch(
      /fict[ií]ci|demonstração local|fixture|mock|sintética|testar o isolamento/i,
    );
    await ratio(page.locator(".c-hero-art"));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `reports/syzia-035/demo-${width}.png`,
      fullPage: true,
    });
  }
});

test("035: três formatos de capa, mover/zoom, recarga e igualdade da prévia/publicação em dois tamanhos", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await demoLogin(page, "adminb@example.invalid");
  await page
    .getByRole("link", { name: /Estúdio Horizonte/ })
    .first()
    .click();
  await page.waitForURL(/\/painel\//);
  const org = new URL(page.url()).pathname.split("/")[2];
  await page.goto(`/painel/${org}/pagina`);
  const cover = page
    .locator(".media-upload")
    .filter({
      has: page.getByRole("heading", { name: "Capa da página", exact: true }),
    });
  await expect(cover).toContainText("Proporção recomendada: 4:3");
  const visitor = await context.newPage();
  for (const [label, width, height] of [
    ["4x3", 1200, 900],
    ["horizontal", 1600, 600],
    ["vertical", 600, 1200],
  ] as const) {
    const svg = `<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#211634"/><path d="M0 0L${width} ${height}M${width} 0L0 ${height}" stroke="#c9b8ff" stroke-width="30"/><circle cx="${width / 2}" cy="${height / 2}" r="180" fill="#6c4dff"/><circle cx="${width / 2}" cy="${height / 2}" r="90" fill="#f4f5ff"/></svg>`;
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    await cover
      .getByLabel("Enviar capa da página", { exact: true })
      .setInputFiles({ name: label + ".png", mimeType: "image/png", buffer });
    await expect(
      page.getByRole("button", { name: "Salvar identidade visual" }),
    ).toBeEnabled();
    await ratio(cover.locator(".media-preview"));
    await cover
      .getByRole("button", { name: "Ajustar enquadramento", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Ajustar enquadramento — Capa da página",
    });
    await expect(
      dialog.getByRole("button", { name: "Salvar enquadramento" }),
    ).toBeEnabled();
    if (label === "vertical")
      await page.setViewportSize({ width: 390, height: 844 });
    const stage = dialog.getByLabel("Prévia do enquadramento");
    await ratio(stage);
    await dialog.getByLabel("Zoom", { exact: true }).fill("1.5");
    const before = await stage.locator("img").getAttribute("style");
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
    await page.mouse.up();
    expect(await stage.locator("img").getAttribute("style")).not.toBe(before);
    await dialog.screenshot({ path: `reports/syzia-035/crop-${label}.png` });
    await dialog.getByRole("button", { name: "Salvar enquadramento" }).click();
    await expect(dialog).toHaveCount(0);
    const cropped = cover.getByRole("img");
    await cropped.evaluate((img: HTMLImageElement) => img.decode());
    const natural = await cropped.evaluate(
      (img: HTMLImageElement) => img.naturalWidth / img.naturalHeight,
    );
    expect(Math.abs(natural - 4 / 3)).toBeLessThan(0.005);
    const originalHash = await imageHash(cropped);
    await page
      .getByRole("button", { name: "Salvar identidade visual" })
      .click();
    await expect(
      page.getByText(
        "Rascunho salvo. Revise a prévia e publique quando estiver pronto.",
      ),
    ).toBeVisible();
    await page.reload();
    expect(await imageHash(cover.getByRole("img"))).toBe(originalHash);
    await page
      .locator("#previa")
      .getByRole("button", { name: "Visualizar como cliente", exact: true })
      .click();
    const preview = page.getByLabel("Prévia do rascunho");
    await expect(preview.locator(".c-cover")).toBeVisible();
    expect(await imageHash(preview.locator(".c-cover"))).toBe(originalHash);
    for (const [w, h] of [
      [1440, 1000],
      [390, 844],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await ratio(preview.locator(".c-hero-art"));
    }
    await page
      .getByRole("button", { name: "Publicar alterações", exact: true })
      .click();
    await expect(
      page.getByText(
        "Alterações publicadas. Sua página já apresenta a versão revisada.",
      ),
    ).toBeVisible();
    for (const [w, h] of [
      [1440, 1000],
      [390, 844],
    ]) {
      await visitor.setViewportSize({ width: w, height: h });
      await visitor.goto("/empresa/horizonte-ficticio");
      await ratio(visitor.locator(".c-hero-art"));
      expect(await imageHash(visitor.locator(".c-cover"))).toBe(originalHash);
      await expect(visitor.locator(".c-cover")).toHaveCSS(
        "object-position",
        "50% 50%",
      );
      await visitor
        .locator(".c-hero-art")
        .screenshot({ path: `reports/syzia-035/published-${label}-${w}.png` });
    }
  }
});

test("035: falha Auth distinta de sessão expirada, reautenticação e mesma preparação", async ({
  page,
}) => {
  await demoLogin(page, "root@example.invalid");
  await page.goto("/admin/equipe");
  await page.getByRole("button", { name: "Nova pessoa", exact: true }).click();
  await page
    .getByLabel("Nome completo", { exact: true })
    .fill("Pessoa Retomada");
  await page.getByLabel("Username", { exact: true }).fill("pessoa.retomada035");
  await page.getByLabel("E-mail de contato", { exact: true }).fill("retomada035@example.invalid");
  await page.request.post("http://127.0.0.1:54321/__test/fail-next-provision");
  await page.getByRole("button", { name: "Criar pessoa", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Use Retomar provisionamento",
  );
  const reservation = page
    .locator(".card")
    .filter({
      has: page.getByRole("heading", { name: "Preparações pendentes" }),
    })
    .locator("p")
    .filter({ hasText: "pessoa.retomada035" });
  await page.request.post("http://127.0.0.1:54321/__test/fail-next-provision");
  await reservation
    .getByRole("button", { name: "Retomar provisionamento" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Use Retomar provisionamento",
  );
  await expect(page.getByRole("alert")).not.toContainText(
    "Verifique a conexão",
  );
  await page.route(
    "**/access/resume",
    (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "session_expired" }),
      }),
    { times: 1 },
  );
  await reservation
    .getByRole("button", { name: "Retomar provisionamento" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Sua sessão expirou");
  await expect(
    page.getByRole("region", { name: "Instruções de acesso" }),
  ).toHaveCount(0);
  await expect(reservation).toHaveCount(1);
  await page
    .getByRole("link", { name: "Entrar novamente", exact: true })
    .click();
  await expect(page).toHaveURL(/\/entrar/);
  await demoLogin(page, "root@example.invalid");
  await page.goto("/admin/equipe");
  await expect(reservation).toHaveCount(1);
  await reservation
    .getByRole("button", { name: "Retomar provisionamento" })
    .click();
  const instructions = page.getByRole("region", {
    name: "Instruções de acesso",
  });
  await expect(instructions).toContainText("pessoa.retomada035");
  for (const name of [
    "Copiar instruções de acesso",
    "Copiar código",
    "Copiar link",
  ])
    await expect(
      instructions.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  await expect(reservation).toHaveCount(0);
  await page.screenshot({
    path: "reports/syzia-035/retomada.png",
    fullPage: true,
  });
});
