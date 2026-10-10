import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const phase = process.argv[2] || "before",
  base = "http://127.0.0.1:5173";
const out = `reports/ux-performance/${phase}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.FOUNDATION_CHROMIUM_PATH,
  args: ["--no-sandbox", "--disable-gpu"],
});
const results = [];
let active = null,
  started = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function context(width) {
  const c = await browser.newContext({
    baseURL: base,
    viewport: { width, height: 900 },
    locale: "pt-BR",
    reducedMotion: "reduce",
  });
  await c.tracing.start({ screenshots: true, snapshots: true });
  await c.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.includes(":54321/")) await sleep(120);
    else if (/\/assets\/.*\.js/.test(u)) await sleep(250);
    await route.continue();
  });
  await c.exposeBinding("auditFrame", (_, frame) => {
    if (active) active.frames.push({ ...frame, t: Date.now() - started });
  });
  await c.addInitScript(() => {
    let prev = "";
    function frame() {
      const visible = (e) =>
        !!e.getClientRects().length &&
        getComputedStyle(e).display !== "none" &&
        getComputedStyle(e).visibility !== "hidden" &&
        !e.closest('[style*="display: none"]');
      const statuses = [...document.querySelectorAll("[role=status],.notice")]
        .filter(visible)
        .map((x) => x.textContent.trim())
        .filter((x) =>
          /Carregando|Verificando|Registrando|Preparando|Abrindo/.test(x),
        );
      const shell = !![...document.querySelectorAll(".app-shell")].find(
          visible,
        ),
        home = !![...document.querySelectorAll("h1")].find(
          (x) => visible(x) && x.textContent.includes("O que fazer hoje"),
        );
      const headings = [...document.querySelectorAll("main h1")]
        .filter(visible)
        .map((x) => x.textContent.trim());
      const next = JSON.stringify({ statuses, shell, home, headings });
      if (next !== prev) {
        prev = next;
        void window.auditFrame(JSON.parse(next));
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    new PerformanceObserver((list) => {
      for (const x of list.getEntries())
        if (!x.hadRecentInput) void window.auditFrame({ layoutShift: x.value });
    }).observe({ type: "layout-shift", buffered: true });
  });
  c.on("request", (req) => {
    if (active && req.url().includes(":54321/")) {
      const entry = {
        path: new URL(req.url()).pathname,
        body: req.postData(),
        t: Date.now() - started,
      };
      active.requests.push(entry);
      req._audit = entry;
    }
  });
  c.on("response", (res) => {
    const r = res.request()._audit;
    if (r) {
      r.end = Date.now() - started;
      r.status = res.status();
    }
  });
  const p = await c.newPage();
  p._pending = new Set();
  p._lastNetwork = Date.now();
  p.on("request", (r) => {
    p._pending.add(r);
    p._lastNetwork = Date.now();
  });
  for (const event of ["requestfinished", "requestfailed"])
    p.on(event, (r) => {
      p._pending.delete(r);
      p._lastNetwork = Date.now();
    });
  p.setDefaultTimeout(10000);
  p.on("pageerror", (e) => {
    if (active) active.errors.push(e.message);
  });
  return { c, p };
}
async function settle(p) {
  const until = Date.now() + 15000;
  do {
    await p.waitForTimeout(100);
    if (Date.now() > until) throw Error("Network did not settle");
  } while (p._pending.size || Date.now() - p._lastNetwork < 650);
}
async function measure(p, id, action) {
  active = {
    id,
    viewport: p.viewportSize(),
    frames: [],
    requests: [],
    errors: [],
  };
  started = Date.now();
  try {
    await action();
    await settle(p);
    active.durationMs = Date.now() - started;
    active.final = await p.evaluate(() => ({
      url: location.pathname + location.search,
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      headings: [...document.querySelectorAll("h1,h2")].map(
        (e) => e.textContent,
      ),
      alerts: [...document.querySelectorAll("[role=alert]")].map(
        (x) => x.textContent,
      ),
      scrollWidth: document.documentElement.scrollWidth,
    }));
    active.status = "RECORDED";
    await p.screenshot({ path: `${out}/${id}.png`, fullPage: true });
  } catch (e) {
    active.status = "BLOCKED";
    active.reason = e.message;
    await p
      .screenshot({ path: `${out}/${id}-blocked.png`, fullPage: true })
      .catch(() => {});
  }
  const r = active;
  active = null;
  const counts = {};
  for (const q of r.requests) {
    const k = q.path + " " + (q.body || "");
    counts[k] = (counts[k] || 0) + 1;
  }
  r.duplicates = Object.entries(counts)
    .filter(([, n]) => n > 1)
    .map(([key, count]) => ({ key, count }));
  results.push(r);
  await writeFile(
    `${out}/measurements.json`,
    JSON.stringify(
      {
        phase,
        browser: browser.version(),
        latency: { apiMs: 120, chunkMs: 250 },
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    r.status,
    r.id,
    r.requests.length,
    "requests",
    r.duplicates.length,
    "repeated signatures",
    r.final?.overflow || 0,
    "overflow",
  );
  return r;
}
async function login(p, email) {
  await p.request.post("http://127.0.0.1:54321/__test/reset-access-limits");
  await p.goto("/entrar");
  await p.getByLabel("E-mail ou usuário", { exact: true }).fill(email);
  await p.getByLabel("Senha", { exact: true }).fill("FictitiousPassword123!");
  await p.getByRole("button", { name: "Entrar", exact: true }).click();
  await p.waitForURL(/\/(admin|app|painel|escolher-empresa)/);
  await settle(p);
}
async function nav(p, href) {
  const a = p.locator(`a[href="${href}"]`).filter({ visible: true }).first();
  if (await a.count()) await a.click();
  else await p.goto(href);
}
export { browser, results, phase, out, context, measure, login, nav, settle };
