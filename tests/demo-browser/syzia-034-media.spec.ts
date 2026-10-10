import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
import sharp from "sharp";
import { createHash } from "node:crypto";
import type { Page, Locator } from "@playwright/test";
const photo = "assets/demo/auto-photo.png",
  otherPhoto = "assets/demo/horizonte-photo.png";
async function openCompany(page: Page) {
  await demoLogin(page);
  await page
    .getByRole("link", { name: /MS Auto/ })
    .first()
    .click();
  await page.waitForURL(/\/painel\//);
  return new URL(page.url()).pathname.split("/")[2];
}
async function pageEditor(page: Page, org: string) {
  await page.goto(`/painel/${org}/pagina`);
  await expect(
    page.getByRole("heading", { name: "A sua empresa, do seu jeito" }),
  ).toBeVisible();
}
const upload = (page: Page, title: string) =>
  page
    .locator(".media-upload")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
async function saveBrand(page: Page) {
  await page.getByRole("button", { name: "Salvar identidade visual" }).click();
  await expect(
    page.getByText(
      "Rascunho salvo. Revise a prévia e publique quando estiver pronto.",
    ),
  ).toBeVisible();
}
async function publish(page: Page) {
  await page
    .locator("#previa")
    .getByRole("button", {
      name: /^(Visualizar como cliente|Atualizar prévia)$/,
    })
    .click();
  await expect(page.getByLabel("Prévia do rascunho")).toBeVisible();
  await page
    .getByRole("button", { name: "Publicar alterações", exact: true })
    .click();
  await expect(
    page.getByText(
      "Alterações publicadas. Sua página já apresenta a versão revisada.",
    ),
  ).toBeVisible();
}
async function dimensions(image: Locator) {
  await expect(image).toBeVisible();
  await image.evaluate((i: HTMLImageElement) => i.decode());
  return image.evaluate((i: HTMLImageElement) => ({
    width: i.naturalWidth,
    height: i.naturalHeight,
    fit: getComputedStyle(i).objectFit,
    radius: getComputedStyle(i).borderRadius,
    box: i.getBoundingClientRect().toJSON(),
  }));
}
async function adjust(page: Page, container: Locator, title: string) {
  await container
    .getByRole("button", { name: "Ajustar enquadramento", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Ajustar enquadramento — " + title,
  });
  await expect(
    dialog.getByRole("button", { name: "Salvar enquadramento" }),
  ).toBeEnabled();
  await dialog.getByLabel("Zoom", { exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await dialog.getByLabel("Posição horizontal", { exact: true }).focus();
  await page.keyboard.press("End");
  const stage = dialog.getByLabel("Prévia do enquadramento");
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.6);
  await page.mouse.up();
  await dialog.screenshot({
    path: `reports/syzia-034/enquadramento-${title.includes("Capa") ? "capa" : "servico"}.png`,
  });
  await dialog.getByRole("button", { name: "Salvar enquadramento" }).click();
  await expect(dialog).toHaveCount(0);
}
test("Logo em três proporções, capa aceita retrato, enquadramento, preview/publicação/recarga e gateway parado", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const org = await openCompany(page);
  await pageEditor(page, org);
  const visitor = await context.newPage();
  for (const [label, width, height] of [
    ["horizontal", 1000, 240],
    ["quadrada", 600, 600],
    ["vertical", 300, 900],
  ] as const) {
    const buffer = await sharp({
      create: { width, height, channels: 3, background: "#26325a" },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="${width}" height="${height}"><rect x="8" y="8" width="${width - 16}" height="${height - 16}" fill="none" stroke="#c9b8ff" stroke-width="8"/><text x="50%" y="50%" text-anchor="middle" fill="white" font-size="${Math.min(width, height) / 5}">FICTÍCIA</text></svg>`,
          ),
        },
      ])
      .png()
      .toBuffer();
    await page
      .getByLabel("Enviar logo da empresa", { exact: true })
      .setInputFiles({ name: label + ".png", mimeType: "image/png", buffer });
    await expect(
      page.getByRole("button", { name: "Salvar identidade visual" }),
    ).toBeEnabled();
    const local = await dimensions(
      page.getByRole("img", { name: "Prévia — Logo da empresa" }),
    );
    expect(local.fit).toBe("contain");
    expect(local.width / local.height).toBeCloseTo(width / height, 2);
    await saveBrand(page);
    await publish(page);
    await visitor.goto("/empresa/ms-auto-ficticia");
    const published = await dimensions(visitor.locator(".c-logo"));
    expect(published.fit).toBe("contain");
    expect(published.radius).toBe("0px");
    expect(published.width / published.height).toBeCloseTo(width / height, 2);
    expect(published.box.width / published.box.height).toBeCloseTo(
      width / height,
      1,
    );
    if (label === "horizontal")
      expect(published.box.width).toBeGreaterThan(150);
    await visitor
      .locator(".c-header")
      .screenshot({ path: `reports/syzia-034/logo-${label}.png` });
    await visitor.setViewportSize({ width: 390, height: 844 });
    const mobileLogo = await dimensions(visitor.locator(".c-logo"));
    expect(mobileLogo.box.width / mobileLogo.box.height).toBeCloseTo(width / height, 1);
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await visitor.locator(".c-header").screenshot({ path: `reports/syzia-034/logo-${label}-mobile.png` });
    await visitor.setViewportSize({ width: 1440, height: 1000 });
    await page.reload();
    await expect(
      page.getByRole("img", { name: "Prévia — Logo da empresa" }),
    ).toBeVisible();
  }
  const cover = upload(page, "Capa da página");
  // Both recommended 4:3 and portrait uploads are accepted through the real sanitizer.
  for (const [w, h] of [
    [1200, 900],
    [600, 1200],
  ]) {
    const buffer = await sharp({
      create: { width: w, height: h, channels: 3, background: "#c9b8ff" },
    })
      .png()
      .toBuffer();
    await cover
      .getByLabel("Enviar capa da página", { exact: true })
      .setInputFiles({ name: "capa.png", mimeType: "image/png", buffer });
    await expect(
      page.getByRole("button", { name: "Salvar identidade visual" }),
    ).toBeEnabled();
    expect((await dimensions(cover.getByRole("img"))).width).toBe(w);
  }
  await adjust(page, cover, "Capa da página");
  const savedCropSrc = await cover.getByRole("img").getAttribute("src");
  await page.setViewportSize({ width: 390, height: 844 });
  await cover.getByRole("button", { name: "Ajustar enquadramento", exact: true }).click();
  const mobileDialog = page.getByRole("dialog", { name: "Ajustar enquadramento — Capa da página" });
  await expect(mobileDialog.getByRole("button", { name: "Salvar enquadramento" })).toBeEnabled();
  expect(await mobileDialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBeTruthy();
  await mobileDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(mobileDialog).toHaveCount(0);
  await expect(cover.getByRole("img")).toHaveAttribute("src", savedCropSrc!);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const cropped = await dimensions(cover.getByRole("img"));
  expect(cropped.width / cropped.height).toBeCloseTo(4 / 3, 2);
  await saveBrand(page);
  await page.reload();
  await page
    .locator("#previa")
    .getByRole("button", { name: "Visualizar como cliente", exact: true })
    .click();
  const preview = page.getByLabel("Prévia do rascunho");
  const previewBytes = await preview
    .locator(".c-cover")
    .evaluate(async (img: HTMLImageElement) =>
      Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())),
    );
  await expect(preview.locator(".c-cover")).toHaveCSS("object-fit", "cover");
  await publish(page);
  await visitor.reload();
  const src = await visitor.locator(".c-cover").getAttribute("src");
  const bytes = await (await visitor.request.get(src!)).body();
  expect(
    createHash("sha256").update(Buffer.from(previewBytes)).digest("hex"),
  ).toBe(createHash("sha256").update(bytes).digest("hex"));
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ]) {
    await visitor.setViewportSize({ width, height });
    const frame = await visitor.locator(".c-hero-art").boundingBox();
    expect(frame!.width / frame!.height).toBeCloseTo(4 / 3, 2);
    expect(
      await visitor.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await visitor.screenshot({
      path: `reports/syzia-034/pagina-publicada-${width}.png`,
      fullPage: true,
    });
  }
  await page.route("**/company-media/*", (route) =>
    route.request().method() === "POST"
      ? route.abort("connectionrefused")
      : route.continue(),
  );
  const oldSrc = await cover.getByRole("img").getAttribute("src");
  await cover
    .getByLabel("Enviar capa da página", { exact: true })
    .setInputFiles(photo);
  await expect(cover.getByRole("alert")).toContainText(
    "Gateway de mídia indisponível",
  );
  await expect(cover.getByRole("img")).toHaveAttribute("src", oldSrc!);
  await cover.screenshot({
    path: "reports/syzia-034/gateway-indisponivel.png",
  });
  await visitor.close();
});
test("Serviço usa enquadramento 3:2 e o mesmo arquivo na prévia e publicação", async ({
  page,
  context,
}) => {
  const org = await openCompany(page);
  await page.goto(`/painel/${org}/servicos`);
  await page
    .getByLabel("Nome do serviço", { exact: true })
    .fill("Projeto Fictício 034");
  await page
    .getByLabel("Descrição do serviço", { exact: true })
    .fill("Serviço demonstrativo de enquadramento.");
  await page
    .getByLabel("Enviar imagem do serviço", { exact: true })
    .setInputFiles(photo);
  await expect(
    page.getByRole("img", { name: "Prévia — Imagem do serviço" }),
  ).toBeVisible();
  const panel = upload(page, "Imagem do serviço");
  await adjust(page, panel, "Imagem do serviço");
  const d = await dimensions(panel.getByRole("img"));
  expect(d.width / d.height).toBeCloseTo(3 / 2, 2);
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Projeto Fictício 034.*Sob consulta/ }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: /Projeto Fictício 034.*Sob consulta/ })
    .click();
  expect((await dimensions(panel.getByRole("img"))).width).toBe(d.width);
  await pageEditor(page, org);
  await publish(page);
  const visitor = await context.newPage();
  await visitor.goto("/empresa/ms-auto-ficticia");
  const card = visitor
    .locator(".c-service")
    .filter({
      has: visitor.getByRole("heading", { name: "Projeto Fictício 034" }),
    });
  expect((await dimensions(card.locator(".c-service-photo img"))).width).toBe(
    d.width,
  );
  const box = await card.locator(".c-service-photo").boundingBox();
  expect(box!.width / box!.height).toBeCloseTo(3 / 2, 2);
  await card.screenshot({ path: "reports/syzia-034/servico-publicado.png" });
  await visitor.close();
});

test("Portfólio preserva foto única, comparação equivalente e galeria ampliada", async ({
  page,
  context,
}) => {
  const org = await openCompany(page);
  await pageEditor(page, org);
  for (const format of ["single", "before_after", "gallery"]) {
    await page
      .getByRole("button", { name: "+ Adicionar trabalho", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Adicionar trabalho",
      exact: true,
    });
    await dialog
      .getByLabel("Título", { exact: true })
      .fill("Trabalho fictício " + format);
    await dialog
      .getByLabel("Descrição curta")
      .fill("Projeto demonstrativo com imagens fictícias.");
    await dialog
      .getByRole("combobox", { name: "Formato", exact: true })
      .selectOption(format);
    if (format === "single") {
      await dialog.getByLabel("Enviar foto do trabalho").setInputFiles(photo);
      await expect(
        dialog.getByRole("img", { name: "Prévia — Foto do trabalho" }),
      ).toBeVisible();
    } else if (format === "before_after") {
      await dialog
        .getByLabel("Enviar antes", { exact: true })
        .setInputFiles(photo);
      await expect(
        dialog.getByRole("img", { name: "Prévia — Antes" }),
      ).toBeVisible();
      await dialog
        .getByLabel("Enviar depois", { exact: true })
        .setInputFiles(photo);
      await expect(
        dialog.getByRole("img", { name: "Prévia — Depois" }),
      ).toBeVisible();
    } else {
      await dialog
        .getByLabel("Adicionar fotos", { exact: true })
        .setInputFiles([photo, otherPhoto]);
      await expect(dialog.locator(".gallery-thumb img")).toHaveCount(2);
      await dialog
        .getByRole("button", { name: "Remover foto 2", exact: true })
        .click();
      await expect(dialog.locator(".gallery-thumb img")).toHaveCount(1);
      await dialog
        .getByLabel("Adicionar fotos", { exact: true })
        .setInputFiles(otherPhoto);
      await expect(dialog.locator(".gallery-thumb img")).toHaveCount(2);
      await dialog
        .getByRole("button", { name: "Adiar foto 1", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Visualizar foto 1", exact: true })
        .click();
      await expect(
        page
          .getByRole("dialog", { name: "Foto 1 do trabalho", exact: true })
          .getByRole("img"),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        dialog.getByRole("button", { name: "Visualizar foto 1", exact: true }),
      ).toBeFocused();
      await page.screenshot({
        path: "reports/syzia-034/media-portfolio-editor-desktop.png",
      });
    }
    await dialog
      .getByRole("button", { name: "Salvar trabalho", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Trabalho fictício " + format,
        exact: true,
      }),
    ).toBeVisible();
  }

  await publish(page);
  await page
    .locator("#previa")
    .getByRole("button", { name: "Visualizar como cliente", exact: true })
    .click();
  const preview = page.getByLabel("Prévia do rascunho");
  const visitor = await context.newPage();
  await visitor.goto("/empresa/ms-auto-ficticia");
  for (const width of [1440, 390]) {
    await visitor.setViewportSize({ width, height: 1000 });
    for (const [format, fit] of [
      ["single", "contain"],
      ["before_after", "contain"],
      ["gallery", "cover"],
    ]) {
      const work = visitor
        .locator(".c-work")
        .filter({
          has: visitor.getByRole("heading", {
            name: "Trabalho fictício " + format,
            exact: true,
          }),
        });
      const draft = preview
        .locator(".c-work")
        .filter({
          has: page.getByRole("heading", {
            name: "Trabalho fictício " + format,
            exact: true,
          }),
        });
      await expect(work.locator(".c-photo-open img").first()).toHaveCSS(
        "object-fit",
        fit,
      );
      await expect(draft.locator(".c-photo-open img").first()).toHaveCSS(
        "object-fit",
        fit,
      );
      if (format === "before_after") {
        const a = (await work
          .locator(".c-photo-open img")
          .nth(0)
          .boundingBox())!;
        const b = (await work
          .locator(".c-photo-open img")
          .nth(1)
          .boundingBox())!;
        expect(a.width).toBeCloseTo(b.width, 0);
        expect(a.height).toBeCloseTo(b.height, 0);
      }
      await work.screenshot({
        path: `reports/syzia-034/portfolio-${format}-${width}.png`,
      });
      await work.getByRole("button", { name: "Ver imagens" }).click();
      const lightbox = visitor.getByRole("dialog", {
        name: "Trabalho fictício " + format,
      });
      await expect(lightbox.getByRole("img")).toHaveCSS(
        "object-fit",
        "contain",
      );
      if (format === "gallery") {
        await lightbox.getByRole("button", { name: "Próxima imagem" }).click();
        await expect(lightbox).toContainText("2/2");
      }
      await visitor.keyboard.press("Escape");
      await expect(lightbox).toHaveCount(0);
    }
    expect(
      await visitor.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  }
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Trabalho fictício single",
      exact: true,
    }),
  ).toBeVisible();
  await visitor.close();
});
