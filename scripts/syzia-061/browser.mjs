// Real React editor + Node-rendered public pages + disposable PGlite, no external network.
import { createServer } from "vite";
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { fixture } from "../../tests/syzia-061/fixture.mjs";
import { createInsightsHandler } from "../../server/insights/http.mjs";
import { prepareGateBrowser } from "../billing-047/browser-runtime.mjs";
await prepareGateBrowser();
const output = process.env.SYZIA061_EVIDENCE_DIR || "/tmp/syzia061-browser";
await mkdir(output, { recursive: true });
const c = await fixture();
let vite, browser;
const results = [];
const origin = "http://127.0.0.1:5191";
const edit = (a, d) =>
  c.asUser("root", "insights_editor", { p_action: a, p_data: d });
try {
  const drafts = JSON.parse(
    await readFile("content/insights/drafts-061.json", "utf8"),
  );
  const posts = [];
  for (const d of drafts) posts.push(await edit("create", { document: d }));
  assert.equal(
    (await c.service("insights_service", { p_action: "catalog", p_data: {} }))
      .posts.length,
    0,
  );
  results.push({
    name: "Five complete articles imported exclusively as drafts",
    status: "PASS",
  });
  for (const p of posts.slice(0, 3))
    await edit("publish", { id: p.id, revision: p.revision });
  const handler = createInsightsHandler({
    origin,
    adminOrigin: origin,
    secret: "offline-local-browser-insights-secret-061",
    service: (a, d) =>
      c.service("insights_service", { p_action: a, p_data: d }),
    asUser: (_, a, d) => edit(a, d),
  });
  vite = await createServer({
    configFile: false,
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(origin),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        "sb_publishable_offline_browser_fixture",
      ),
      "import.meta.env.VITE_PLATFORM_API_URL": JSON.stringify(origin),
    },
    server: { host: "127.0.0.1", port: 5191, strictPort: true },
    plugins: [
      {
        name: "isolated-insights",
        configureServer(v) {
          v.middlewares.use(async (req, res, next) => {
            if (req.url.startsWith("/blog")) return handler(req, res);
            if (req.url.startsWith("/rest/v1/rpc/consumer_")) {
              try {
                let raw = "";
                for await (const chunk of req) raw += chunk;
                const result = await c.asUser(
                  "alice",
                  req.url.split("/").at(-1),
                  JSON.parse(raw || "{}"),
                );
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(result));
              } catch (e) {
                res.statusCode = 400;
                res.end(JSON.stringify({ message: e.message }));
              }
              return;
            }
            if (req.url === "/rest/v1/rpc/insights_editor") {
              try {
                let raw = "";
                for await (const chunk of req) raw += chunk;
                const { p_action, p_data } = JSON.parse(raw);
                const result = await edit(p_action, p_data);
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(result));
              } catch (e) {
                res.statusCode = 400;
                res.end(JSON.stringify({ message: e.message }));
              }
              return;
            }
            return next();
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
    locale: "pt-BR",
    reducedMotion: "reduce",
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [1440, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin + "/blog");
    await page.getByRole("heading", { level: 1 }).waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `${output}/insights-home-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("link", { name: drafts[0].title, exact: true })
      .click();
    await page.getByRole("heading", { name: drafts[0].title }).waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `${output}/insights-article-${width}.png`,
      fullPage: true,
    });
    await page.keyboard.press("Tab");
    assert.ok(
      await page.evaluate(() => document.activeElement !== document.body),
    );
    results.push({
      name: `Public SSR home/article responsive + keyboard ${width}px`,
      status: "PASS",
    });
  }
  await page.getByRole("button", { name: /Curtir/ }).click();
  await page.getByText("Curtida registrada.", { exact: true }).waitFor();
  await page.reload();
  await page.locator('#like[aria-pressed="true"]').waitFor();
  results.push({ name: "Like persists across browser reload", status: "PASS" });
  const other = await browser.newContext();
  await other.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  const second = await other.newPage();
  await second.goto(origin + "/blog/" + drafts[0].slug);
  await second.locator('#like[aria-pressed="false"]').waitFor();
  results.push({
    name: "Separate visitor has separate engagement identity",
    status: "PASS",
  });
  await other.close();
  for (const width of [1440, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin + "/tests/syzia-061/harness.html");
    await page
      .getByRole("button", { name: "Novo artigo", exact: true })
      .waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page
      .getByRole("button", { name: "Editar", exact: true })
      .first()
      .click();
    await page.getByLabel("Título", { exact: true }).waitFor();
    await page.screenshot({
      path: `${output}/insights-editor-${width}.png`,
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page
      .getByLabel("Título", { exact: true })
      .fill("Agenda organizada para uma rotina mais clara");
    await page
      .getByRole("button", { name: "Salvar rascunho", exact: true })
      .click();
    await page
      .getByText("Rascunho salvo. A publicação atual permanece independente.")
      .waitFor();
    await page
      .getByRole("button", { name: "Prévia privada", exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: "Agenda organizada para uma rotina mais clara",
        exact: true,
      })
      .waitFor();
    results.push({
      name: `Actual editor saves and previews private draft ${width}px`,
      status: "PASS",
    });
  }

  const publicPage = await c.asUser("anon", "consumer_public_page", {
    p_slug: "ms-auto-ficticia",
  });
  const chosen = publicPage.services.find((s) => s.price_mode === "fixed");
  const service = (
    await c.rawSQL(
      "select id from public.services where organization_id=$1 and private.consumer_code('s',id)=$2",
      [c.orgs.A, chosen.code],
    )
  ).rows[0].id;
  const rev = (
    await c.rawSQL(
      "select revision from public.company_settings where organization_id=$1",
      [c.orgs.A],
    )
  ).rows[0].revision;
  await c.asUser("adminA", "company_save", {
    p_org: c.orgs.A,
    p_entity: "service",
    p_id: service,
    p_expected_revision: rev,
    p_data: {
      quantity_enabled: true,
      quantity_min: 1,
      quantity_max: 3,
      quantity_unit: "peça",
      quantity_duration: "fixed",
    },
  });
  const draft = await c.asUser("adminA", "consumer_page_draft", {
    p_org: c.orgs.A,
    p_show_prices: true,
  });
  await c.asUser("adminA", "consumer_publish_draft", {
    p_org: c.orgs.A,
    p_token: draft.token,
    p_show_prices: true,
    p_expected_revision: draft.page_revision,
  });
  for (const width of [1440, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin + "/tests/syzia-061/harness.html?surface=quantity");
    const card = page
      .locator(".c-service")
      .filter({
        has: page.getByRole("heading", { name: chosen.name, exact: true }),
      });
    await card.getByRole("button", { name: "Adicionar ao pedido" }).click();
    await page
      .getByRole("button", { name: "Continuar pedido", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "Continuar →", exact: true })
      .click();
    const input = dialog.getByRole("spinbutton", { name: /Quantidade/ });
    await input.waitFor();
    assert.equal(await input.inputValue(), "1");
    await dialog.getByRole("button", { name: "Aumentar quantidade" }).click();
    assert.equal(await input.inputValue(), "2");
    await dialog.getByRole("button", { name: "Aumentar quantidade" }).click();
    assert.ok(
      await dialog
        .getByRole("button", { name: "Aumentar quantidade" })
        .isDisabled(),
    );
    await input.focus();
    await page.keyboard.press("ArrowDown");
    assert.equal(await input.inputValue(), "2");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `${output}/quantity-${width}.png`,
      fullPage: true,
    });
    results.push({
      name: `Actual public quantity selector limits/keyboard ${width}px`,
      status: "PASS",
    });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    output + "/results.json",
    JSON.stringify(
      {
        status: "PASS",
        engine:
          "Chromium + actual React/SSR + disposable PGlite; auth transport simulated; no remote services",
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ status: "PASS", cases: results.length, output }),
  );
} finally {
  await browser?.close();
  await vite?.close();
  await c.db.close();
}
