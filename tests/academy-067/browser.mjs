// Focused tests: disposable SQL fixture + fake mail; every non-loopback request is blocked.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { prepareGateBrowser } from "../../scripts/billing-047/browser-runtime.mjs";
const origin = "http://127.0.0.1:5197",
  out = process.env.ACADEMY_TEST_OUTPUT || "reports/academy-067";
await mkdir(out, { recursive: true });
const server = spawn(
  process.execPath,
  ["tests/academy-067/preview.mjs", "--port", "5197"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let serverLog = "";
server.stdout.on("data", (b) => (serverLog += b));
server.stderr.on("data", (b) => (serverLog += b));
let browser;
const checks = [],
  errors = [];
const record = (s) => {
  checks.push(s);
  console.log("PASS " + s);
};
async function until(fn) {
  for (let i = 0; i < 150; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("Timed out");
}
try {
  await until(
    () =>
      serverLog.includes("ACADEMY_LOCAL_FIXTURE_READY") ||
      server.exitCode !== null,
  );
  if (server.exitCode !== null) throw Error(serverLog);
  await prepareGateBrowser();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.FOUNDATION_CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "pt-BR",
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  await ctx.route("**/*", (r) =>
    new URL(r.request().url()).origin === origin ? r.continue() : r.abort(),
  );
  let release;
  const blocked = new Promise((r) => (release = r));
  await ctx.route("**/tests/academy-066/harness.tsx", async (r) => {
    await blocked;
    await r.continue();
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(origin, { waitUntil: "commit" });
  await p.waitForFunction(
    () => document.documentElement.dataset.academyTheme === "dark",
  );
  assert.equal(
    await p.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    ),
    "rgb(17, 16, 24)",
  );
  assert.equal(await p.locator("#root").textContent(), "");
  record(
    "Tema do sistema aplicado antes do React (módulo atrasado), sem fundo claro",
  );
  release();
  await p
    .getByRole("heading", { name: "Menos improviso. Mais direção." })
    .waitFor();
  assert.match(
    await p.locator(".ac-header img").getAttribute("src"),
    /horizontal-dark/,
  );
  await p.screenshot({
    path: out + "/academy-dark-desktop.png",
    fullPage: true,
  });
  await p.getByRole("button", { name: "Ativar modo claro" }).click();
  assert.equal(
    await p.evaluate(() => localStorage.getItem("syzia.academy.theme")),
    "light",
  );
  const light = await p.evaluate(() => ({
    paper: getComputedStyle(document.querySelector(".academy")).backgroundColor,
    ink: getComputedStyle(document.querySelector(".academy")).color,
    form: getComputedStyle(document.querySelector(".ac-form")).backgroundColor,
    purple: getComputedStyle(document.querySelector(".ac-primary"))
      .backgroundColor,
  }));
  assert.deepEqual(light, {
    paper: "rgb(250, 249, 246)",
    ink: "rgb(36, 32, 53)",
    form: "rgb(255, 255, 255)",
    purple: "rgb(98, 64, 221)",
  });
  await p.screenshot({
    path: out + "/academy-light-desktop.png",
    fullPage: true,
  });
  record("Alternância e paleta clara original preservada");
  await p
    .getByRole("link", { name: "Termos da Academy", exact: true })
    .last()
    .click();
  await p
    .getByRole("heading", { level: 1, name: "Termos da SYZIA Academy" })
    .waitFor();
  await p.reload();
  assert.equal(
    await p.evaluate(() => document.documentElement.dataset.academyTheme),
    "light",
  );
  record(
    "Preferência manual persiste na navegação e recarga, sem autenticação",
  );
  await p.goto(origin);
  await p.getByRole("button", { name: "Ativar modo escuro" }).click();
  const contrast = await p.evaluate(() => {
    function rgb(v) {
      return v
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
    }
    function lum(v) {
      return rgb(v)
        .map((c) => c / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    }
    return [
      ".ac-lede",
      ".ac-eyebrow",
      ".ac-primary",
      ".ac-form input",
      ".ac-orbit-center",
      ".ac-pill",
      ".ac-program li > span",
    ].map((selector) => {
      let e = document.querySelector(selector),
        bg = e;
      while (getComputedStyle(bg).backgroundColor === "rgba(0, 0, 0, 0)")
        bg = bg.parentElement;
      const a = lum(getComputedStyle(e).color),
        b = lum(getComputedStyle(bg).backgroundColor);
      return {
        selector,
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
  });
  for (const x of contrast) assert.ok(x.ratio >= 4.5, JSON.stringify(x));
  record(
    "Contraste calculado ≥4,5:1 em sete combinações essenciais do tema escuro",
  );
  await writeFile(out + "/contrast.json", JSON.stringify(contrast, null, 2));
  for (const width of [390, 360]) {
    await p.setViewportSize({ width, height: 900 });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.getByRole("button", { name: "Ativar modo claro" }).focus();
    await p.keyboard.press("Tab");
    assert.ok(
      await p.evaluate(
        () =>
          document.activeElement !== document.body &&
          getComputedStyle(document.activeElement).outlineStyle !== "none",
      ),
    );
    await p.screenshot({
      path: out + `/academy-dark-${width}.png`,
      fullPage: true,
    });
  }
  record(
    "390/360 px sem overflow, controles acessíveis por teclado e foco visível",
  );
  await p.getByLabel("Nome", { exact: true }).fill("Marina Local");
  await p.getByLabel("E-mail", { exact: true }).fill("browser@example.invalid");
  await p
    .getByLabel("Segmento profissional")
    .selectOption("Design e comunicação");
  await p
    .getByLabel("Qual é a principal dificuldade")
    .fill("Organizar solicitações e acompanhar a rotina.");
  await p.getByRole("checkbox").check();
  await p
    .getByRole("button", { name: "Receber confirmação por e-mail" })
    .click();
  await p
    .getByRole("status")
    .filter({ hasText: "Se os dados estiverem aptos" })
    .waitFor();
  await until(async () =>
    (await (await fetch(origin + "/__fixture")).json()).sent.some(
      (x) => x.kind === "confirm",
    ),
  );
  let f = await (await fetch(origin + "/__fixture")).json();
  const token = new URL(f.sent.find((x) => x.kind === "confirm").link).hash;
  await p.goto(origin + "/confirmar" + token);
  await p.getByRole("button", { name: "Confirmar meu e-mail" }).click();
  await p
    .getByRole("status")
    .filter({ hasText: "Inscrição confirmada" })
    .waitFor();
  record(
    "Formulário e estados de sucesso/confirmacão funcionam em modo escuro",
  );
  await fetch(origin + "/__course", { method: "POST" });
  await p.goto(origin + "/aulas");
  await p
    .getByRole("button", { name: "Preparar a rotina", exact: true })
    .click();
  await p.getByRole("checkbox", { name: "Marcar aula como concluída" }).click();
  await p
    .getByRole("button", { name: "✓ Preparar a rotina", exact: true })
    .waitFor();
  assert.equal(
    await p
      .getByRole("checkbox", { name: "Marcar aula como concluída" })
      .isChecked(),
    true,
  );
  await p.getByRole("button", { name: "↓ guia-local.txt" }).waitFor();
  await p.screenshot({
    path: out + "/academy-dark-classroom-mobile.png",
    fullPage: true,
  });
  await p.getByRole("button", { name: "Carregar vídeo da aula" }).click();
  assert.match(
    await p.locator("iframe").getAttribute("src"),
    /youtube-nocookie/,
  );
  await p.getByRole("button", { name: "Preferências", exact: true }).click();
  await p.getByRole("heading", { level: 1 }).waitFor();
  assert.equal(
    await p.evaluate(() => document.documentElement.dataset.academyTheme),
    "dark",
  );
  record(
    "Catálogo, módulo, aula, player, material, progresso e preferências com estado local/SQL real",
  );
  await p.goto(origin + "/confirmar#token=invalid");
  await p.getByRole("button", { name: "Confirmar meu e-mail" }).click();
  await p.getByRole("alert").waitFor();
  record("Estado de erro permanece legível no modo escuro");
  await p.goto(origin + "/admin/academy");
  await p.getByRole("button", { name: "Comunicações", exact: true }).click();
  assert.equal(
    await p.evaluate(() => document.documentElement.dataset.academyTheme),
    undefined,
  );
  assert.equal(await p.getByRole("button", { name: /Ativar modo/ }).count(), 0);
  await p
    .getByLabel("Destinatário do teste")
    .fill("authorized@example.invalid");
  await p.getByLabel("Controlo este endereço").check();
  const before = (await (await fetch(origin + "/__fixture")).json()).sent
    .length;
  await p.getByRole("button", { name: "Visualizar mensagem de teste" }).click();
  await p.getByRole("heading", { name: "Revise antes de enviar" }).waitFor();
  assert.equal(
    (await (await fetch(origin + "/__fixture")).json()).sent.length,
    before,
  );
  await p.getByRole("button", { name: "Confirmar envio de teste" }).click();
  await p.getByRole("status").filter({ hasText: "Teste autorizado" }).waitFor();
  await until(async () =>
    (
      await (await fetch(origin + "/__fixture")).json()
    ).overview.mail_tests.some((t) => t.status === "accepted"),
  );
  await p.getByRole("button", { name: "Atualizar resultados" }).click();
  await p.getByText("Resultados dos testes (1)", { exact: true }).click();
  await p.getByText("Aceito pelo provedor", { exact: true }).waitFor();
  f = await (await fetch(origin + "/__fixture")).json();
  assert.equal(f.sent.filter((x) => x.kind === "test").length, 1);
  assert.equal(f.students.length, 1);
  await p.screenshot({
    path: out + "/admin-mail-test-mobile.png",
    fullPage: true,
  });
  record(
    "Admin: prévia sem envio, confirmação explícita, um teste simulado, inscrição preservada, tema principal isolado",
  );
  const fresh = await browser.newContext({ colorScheme: "light" });
  await fresh.route("**/*", (r) =>
    new URL(r.request().url()).origin === origin ? r.continue() : r.abort(),
  );
  const q = await fresh.newPage();
  await q.goto(origin);
  await q.getByRole("button", { name: "Ativar modo escuro" }).waitFor();
  await q.emulateMedia({ colorScheme: "dark" });
  await q.getByRole("button", { name: "Ativar modo claro" }).waitFor();
  await q.getByRole("button", { name: "Ativar modo claro" }).click();
  await q.emulateMedia({ colorScheme: "light" });
  await q.emulateMedia({ colorScheme: "dark" });
  assert.equal(
    await q.evaluate(() => document.documentElement.dataset.academyTheme),
    "light",
  );
  record(
    "Sistema acompanha mudanças até escolha manual; armazenamento independente por visitante",
  );
  await fresh.close();
  assert.deepEqual(errors, []);
  await writeFile(
    out + "/browser-results.json",
    JSON.stringify({ status: "PASS", checks, errors }, null, 2),
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await writeFile(out + "/fixture.log", serverLog);
}
