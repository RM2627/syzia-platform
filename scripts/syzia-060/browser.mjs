import { createCommercialHandler } from "../../server/commercial/http.mjs";
import { createDemoMediaHandler } from "../../server/commercial/media.mjs";
// Local disposable databases + real React components. No remote services.
import { createServer } from "vite";
import { chromium } from "playwright";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { fixture } from "../../tests/billing-047/fixture.mjs";
import { demoFixture } from "../../tests/commercial-implementation/demo-fixture.mjs";
import { studioController } from "../../server/studio/controller.mjs";
import { commercialController } from "../../server/commercial/controller.mjs";
process.env.SYZIA_OPTIONAL_MANUAL_CURRENT = "1";
process.env.SYZIA_OPERATION_CURRENT = "1";
const output = process.env.SYZIA060_EVIDENCE_DIR || "/tmp/syzia060-browser";
await mkdir(output, { recursive: true });
const c = await fixture(),
  x = await demoFixture();
let vite, browser, page;
try {
  for (const n of (await readdir("supabase/migrations"))
    .filter((n) => /^202610(18|20|21|22|25)00(54|55|56|57|58|59|60)_/.test(n))
    .sort())
    await c.db.exec(await readFile("supabase/migrations/" + n, "utf8"));
  const blobs = new Map(),
    storage = {
      from: () => ({
        upload: async (path, bytes) => {
          blobs.set(path, Buffer.from(bytes));
          return {};
        },
        download: async (path) =>
          blobs.has(path)
            ? { data: new Blob([blobs.get(path)]) }
            : { error: true },
        remove: async (paths) => {
          paths.forEach((p) => blobs.delete(p));
          return {};
        },
      }),
    };
  const ctl = commercialController({
    asUser: c.asUser,
    service: c.service,
    auth: async () => ({ id: c.users.root }),
    store: x.store,
    origins: {
      publicOrigin: "http://127.0.0.1:5180",
      appOrigin: "http://127.0.0.1:5180",
    },
  });
  const studio = studioController({
    asUser: c.asUser,
    service: c.service,
    storage,
    store: x.store,
  });
  const media = createDemoMediaHandler({
    store: x.store,
    controller: ctl,
    origins: {
      publicOrigin: "http://127.0.0.1:5180",
      appOrigin: "http://127.0.0.1:5180",
    },
    resolvePublic: (id) =>
      c.service("commercial_service", { p_action: "demo", p_data: { id } }),
  });
  const demoHTTP = createCommercialHandler({
    controller: ctl,
    origins: {
      publicOrigin: "http://127.0.0.1:5180",
      appOrigin: "http://127.0.0.1:5180",
    },
  });
  vite = await createServer({
    configFile: false,
    define: {
      "import.meta.env.VITE_APP_REALM": JSON.stringify("demo"),
      "import.meta.env.VITE_COMMERCIAL_DEMO_ORIGIN": JSON.stringify(
        "http://127.0.0.1:5180",
      ),
      "import.meta.env.VITE_COMMERCIAL_API_URL": JSON.stringify(
        "http://localhost:5180",
      ),
    },
    server: { host: "127.0.0.1", port: 5180, strictPort: true },
    plugins: [
      {
        name: "isolated-studio-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url.startsWith("/demonstrations/"))
              return demoHTTP(req, res);
            if (req.url.startsWith("/demonstration-media/"))
              return media(req, res);
            if (
              req.method === "GET" &&
              /^\/(?:aurora-ambientes|painel)(?:[/?]|$)/.test(req.url)
            ) {
              req.url = "/demo.html";
              return next();
            }
            if (
              !req.url.startsWith("/__studio/") &&
              !req.url.startsWith("/demonstrations/")
            )
              return next();
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            try {
              const body = JSON.parse(Buffer.concat(chunks) || "{}");
              const d = req.url.startsWith("/demonstrations/")
                ? await ctl.visitor(
                    req.url.slice("/demonstrations/".length),
                    body,
                    req.headers.authorization?.replace(/^Bearer /, ""),
                  )
                : await studio(
                    req.url.slice("/__studio/".length),
                    body,
                    "root",
                    { id: c.users.root },
                  );
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(d));
            } catch (e) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: e.message }));
            }
          });
        },
      },
    ],
  });
  await vite.listen();
  browser = await chromium.launch({
    executablePath: process.env.FOUNDATION_CHROMIUM_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "pt-BR",
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5180/tests/syzia-060/harness.html");
  await page
    .getByLabel("Nome da empresa", { exact: true })
    .fill("Aurora Ambientes");
  await page
    .getByLabel("Segmento", { exact: true })
    .selectOption("consultoria");
  await page
    .getByRole("button", { name: "Gerar rascunho", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Aprovar e criar demonstração" })
    .waitFor();
  console.log("B01 draft created");
  await page
    .getByLabel("Apresentação", { exact: true })
    .fill(
      "Orientações para transformar ambientes com escolhas práticas e uma apresentação acolhedora.",
    );
  await page.getByLabel("Capa", { exact: true }).setInputFiles({
    name: "capa.png",
    mimeType: "image/png",
    buffer: await readFile("public/brand/syzia/syzia-horizontal-light.png"),
  });
  await page.getByRole("slider", { name: "Zoom", exact: true }).fill("1.2");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert.equal(blobs.size, 0);
  await page.getByLabel("Capa", { exact: true }).setInputFiles({
    name: "capa.png",
    mimeType: "image/png",
    buffer: await readFile("public/brand/syzia/syzia-horizontal-light.png"),
  });
  await page
    .getByRole("button", { name: "Salvar enquadramento", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remover capa", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Portfólio", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Adicionar trabalho", exact: true })
    .click();
  await page
    .getByLabel("Título do trabalho", { exact: true })
    .fill("Apresentação de ambientes");
  await page.getByLabel("Foto do trabalho 1", { exact: true }).setInputFiles({
    name: "portfolio.png",
    mimeType: "image/png",
    buffer: await readFile("public/brand/syzia/syzia-horizontal-light.png"),
  });
  await page
    .getByRole("button", { name: "Salvar enquadramento", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remover foto do trabalho 1", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page
    .getByText("Rascunho salvo com segurança.", { exact: true })
    .waitFor();
  // Real touch events against the reused cropper; cancel preserves stored images.
  const touchContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const touch = await touchContext.newPage();
  await touch.goto("http://127.0.0.1:5180/tests/syzia-060/harness.html");
  await touch.getByRole("button", { name: "Abrir", exact: true }).click();
  const countBefore = blobs.size;
  for (const file of [
    {
      name: "arquivo.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("invalid"),
    },
    {
      name: "grande.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5242881),
    },
  ]) {
    await touch.getByLabel("Capa", { exact: true }).setInputFiles(file);
    assert.equal(await touch.getByRole("dialog").count(), 0);
    assert.equal(blobs.size, countBefore);
  }
  await touch.getByLabel("Capa", { exact: true }).setInputFiles({
    name: "capa.png",
    mimeType: "image/png",
    buffer: await readFile("public/brand/syzia/syzia-horizontal-light.png"),
  });
  await touch.getByRole("slider", { name: "Zoom", exact: true }).fill("1.5");
  const stage = touch.getByLabel("Prévia do enquadramento", { exact: true });
  await stage.scrollIntoViewIfNeeded();
  const bounds = await stage.boundingBox(),
    cdp = await touchContext.newCDPSession(touch),
    x0 = bounds.x + bounds.width * 0.65,
    y0 = bounds.y + bounds.height * 0.5;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: x0, y: y0 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x0 - 40, y: y0 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.notEqual(
    await touch
      .getByRole("slider", { name: "Posição horizontal", exact: true })
      .inputValue(),
    "0.5",
  );
  await touch.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert.equal(blobs.size, countBefore);
  await touchContext.close();
  console.log("B02 saved images");
  for (const width of [1440, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: `${output}/studio-${width}.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await page.keyboard.press("Tab");
  assert.ok(
    await page.evaluate(() => document.activeElement !== document.body),
  );
  const png = page.waitForEvent("download");
  await page.getByRole("button", { name: "Início", exact: true }).click();
  const image = await png;
  await image.saveAs(output + "/inicio.png");
  const zip = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar ZIP", exact: true }).click();
  await (await zip).saveAs(output + "/previa-comercial.zip");
  console.log("B03 export complete");
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await page.getByRole("button", { name: "Abrir", exact: true }).click();
  await page
    .getByRole("button", { name: "Remover capa", exact: true })
    .waitFor();
  await page.getByLabel("Revisei esta preparação").check();
  await page
    .getByRole("button", { name: "Aprovar e criar demonstração", exact: true })
    .click();
  await page
    .getByText(
      "Demonstração criada. Continue a configuração e a publicação na gestão de Demonstrações.",
      { exact: true },
    )
    .waitFor();
  // The actual DemoApp runs in two separate browser contexts, backed by local SQL.
  const created = (
    await c.asUser("root", "commercial_studio", {
      p_action: "list",
      p_data: {},
    })
  ).drafts.find((d) => d.name === "Aurora Ambientes");
  let definition = await c.asUser("root", "commercial_demo_edit_context", {
    p_id: created.demo_id,
  });
  const editor = await x.store.begin(definition, "editor", c.users.root),
    config = await x.store.export(editor.token, definition, {
      requireReady: true,
    });
  await x.store.freeze(definition.id, config);
  const revised = await c.asUser("root", "commercial_demo_draft", {
    p_id: definition.id,
    p_revision: definition.revision,
    p_config: config,
    p_review: true,
  });
  await c.asUser("root", "commercial_demo_publish", {
    p_id: definition.id,
    p_revision: revised.revision,
    p_config: config,
  });
  const lead = (
    await c.asUser("root", "commercial_contact_save", {
      p_id: null,
      p_revision: 0,
      p_key: randomUUID(),
      p_data: { name: "Contato de apresentação" },
    })
  ).id;
  await c.asUser("root", "commercial_demo_link", {
    p_demo: definition.id,
    p_lead: lead,
  });
  const invite = await ctl.operator(
    "invite",
    { id: definition.id, lead_id: lead, purpose: "demonstration" },
    "root",
  );
  const desktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    }),
    mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
  const pages = await Promise.all([desktop.newPage(), mobile.newPage()]);
  await Promise.all(
    pages.map(async (p) => {
      await p.goto(invite.url);
      await p.getByText("Demonstração interativa", { exact: true }).waitFor();
      await p
        .getByRole("heading", { name: /^Aurora Ambientes/ })
        .waitFor()
        .catch(async (e) => {
          console.error(await p.locator("body").innerText());
          throw e;
        });
    }),
  );
  const sessions = await Promise.all(
    pages.map((p) =>
      p.evaluate(() =>
        JSON.parse(sessionStorage.getItem("syzia-demo-session")),
      ),
    ),
  );
  assert.notEqual(sessions[0].token, sessions[1].token);
  assert.notEqual(sessions[0].organization.id, sessions[1].organization.id);
  for (let i = 0; i < 2; i++)
    await pages[i].screenshot({
      path: output + "/compartilhamento-" + (i ? "mobile" : "desktop") + ".png",
      fullPage: true,
    });
  const companyPage = pages[0];
  await companyPage.goto(
    "http://127.0.0.1:5180/painel/" + sessions[0].organization.id + "/pagina",
  );
  await companyPage
    .getByRole("button", { name: "+ Adicionar trabalho", exact: true })
    .click();
  await companyPage
    .getByLabel("Título", { exact: true })
    .fill("Galeria com enquadramento");
  await companyPage
    .getByRole("combobox", { name: /Formato/ })
    .selectOption("gallery");
  const picture = await readFile(
    "public/brand/syzia/syzia-horizontal-light.png",
  );
  await companyPage
    .getByLabel("Adicionar fotos", { exact: true })
    .setInputFiles([
      { name: "primeira.png", mimeType: "image/png", buffer: picture },
      { name: "segunda.png", mimeType: "image/png", buffer: picture },
    ]);
  await companyPage
    .getByRole("button", { name: "Cancelar", exact: true })
    .last()
    .click();
  await companyPage
    .getByRole("button", { name: "Salvar enquadramento", exact: true })
    .click();
  await companyPage
    .getByRole("button", { name: "Salvar trabalho", exact: true })
    .click();
  await companyPage
    .getByRole("heading", { name: "Galeria com enquadramento", exact: true })
    .waitFor();
  const gallery = await ctl.visitor(
    "rpc",
    {
      perspective: "company",
      name: "consumer_presence_context",
      args: { p_org: sessions[0].organization.id },
    },
    sessions[0].token,
  );
  assert.equal(
    gallery.portfolio_all.find((w) => w.title === "Galeria com enquadramento")
      .images.length,
    1,
  );
  const other = await ctl.visitor(
    "rpc",
    {
      perspective: "company",
      name: "consumer_presence_context",
      args: { p_org: sessions[1].organization.id },
    },
    sessions[1].token,
  );
  assert.ok(
    !other.portfolio_all.some((w) => w.title === "Galeria com enquadramento"),
  );
  console.log(
    "B05 real portfolio bulk crop: cancel first, save second, isolated media gateway",
  );
  await ctl.visitor("end", {}, sessions[0].token);
  await pages[1].reload();
  await pages[1]
    .getByText("Demonstração interativa", { exact: true })
    .waitFor();
  assert.equal(
    await pages[1].evaluate(
      () => JSON.parse(sessionStorage.getItem("syzia-demo-session")).token,
    ),
    sessions[1].token,
  );
  await desktop.close();
  await mobile.close();
  console.log(
    "B04 same invitation, two real DemoApp contexts, desktop/mobile sessions independent",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    output + "/resultado.json",
    JSON.stringify(
      {
        status: "PASS",
        desktop: 1440,
        mobile: [390, 360],
        persistentDraft: true,
        uploadAndCrop: true,
        cancelWithoutUpload: true,
        exportPNG: true,
        exportZIP: true,
        mobileTouchCrop: true,
        portfolioBulkCrop: true,
        invalidAndOversizeFileBlocked: true,
        twoIndependentDemoBrowsers: true,
        idempotentConversion: "covered by SQL suite",
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS Studio browser: create/edit/upload/crop/cancel/save/reopen/preview1440-390-360/keyboard/exportPNG-ZIP/approve",
  );
} catch (e) {
  console.error(e);
  if (page) {
    await page
      .screenshot({ path: output + "/falha.png", fullPage: true })
      .catch(() => {});
    await writeFile(
      output + "/falha.txt",
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
  }
  throw e;
} finally {
  await browser?.close();
  await vite?.close();
  await c.db.close();
  await x.store.close();
}
