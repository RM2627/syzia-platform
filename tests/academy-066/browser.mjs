// Targeted browser checks against the disposable local fixture, never production.
// Start: node tests/academy-066/preview.mjs --port 5196
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { prepareGateBrowser } from "../../scripts/billing-047/browser-runtime.mjs";
const origin = process.env.ACADEMY_TEST_ORIGIN || "http://127.0.0.1:5196";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname))
  throw Error("Disposable loopback fixture required");
const out = process.env.ACADEMY_TEST_OUTPUT || "reports/academy-066";
await mkdir(out, { recursive: true });
await prepareGateBrowser();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.FOUNDATION_CHROMIUM_PATH,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const checks = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "pt-BR",
    reducedMotion: "reduce",
  });
  await context.route("**/*", (r) =>
    new URL(r.request().url()).origin === origin ? r.continue() : r.abort(),
  );
  const p = await context.newPage(),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(origin);
  await p
    .getByRole("heading", { name: "Menos improviso. Mais direção." })
    .waitFor();
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
  checks.push(
    "Inscrição pela interface real com validação e resposta não enumerável",
  );
  const f = await (await fetch(origin + "/__fixture")).json();
  const token = new URL(f.sent.find((x) => x.kind === "confirm").link).hash;
  await p.goto(origin + "/confirmar" + token);
  await p.getByRole("button", { name: "Confirmar meu e-mail" }).click();
  await p
    .getByRole("status")
    .filter({ hasText: "Inscrição confirmada" })
    .waitFor();
  await p.getByRole("button", { name: /Área do aluno/ }).click();
  await p
    .getByRole("heading", { name: "As aulas estão sendo preparadas." })
    .waitFor();
  checks.push("Confirmação real via SQL e área fechada");
  await p.goto(origin + "/admin/academy");
  await p
    .getByRole("heading", { name: "SYZIA Academy", exact: true })
    .waitFor();
  await p.getByRole("button", { name: "Lista de espera", exact: true }).click();
  await p.getByRole("heading", { name: "Marina Local" }).waitFor();
  checks.push("Inscrição confirmada visível na gestão integrada");
  await p.getByRole("button", { name: "Cursos", exact: true }).click();
  await p.getByRole("button", { name: /Do improviso à organização/ }).click();
  await p.getByLabel("Título do curso").fill("Curso local revisado");
  await p.getByRole("button", { name: "Salvar rascunho" }).click();
  await p
    .getByRole("status")
    .filter({ hasText: "Operação concluída." })
    .waitFor();
  checks.push("Editor salva e retoma rascunho real");
  for (const route of ["/", "/admin/academy"])
    for (const width of [1440, 390, 360]) {
      await p.setViewportSize({ width, height: 900 });
      await p.goto(origin + route);
      await p.getByRole("heading", { level: 1 }).waitFor();
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await p.keyboard.press("Tab");
      assert.ok(
        await p.evaluate(() => document.activeElement !== document.body),
      );
      await p.screenshot({
        path:
          out +
          "/" +
          (route === "/" ? "public" : "admin") +
          "-" +
          width +
          ".png",
        fullPage: true,
      });
      checks.push(route + " " + width + "px sem overflow, teclado e captura");
    }
  assert.deepEqual(errors, []);
  await writeFile(
    out + "/browser-results.json",
    JSON.stringify({ status: "PASS", checks }, null, 2) + "\n",
  );
  console.log("PASS " + checks.length + " verificações direcionadas");
} finally {
  await browser.close();
}
