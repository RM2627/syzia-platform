import {
  browser,
  out,
  context,
  measure,
  login,
  nav,
  settle,
  results,
} from "./harness.mjs";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const calls = (r, name) =>
  r.requests.filter((q) => q.path.endsWith("/" + name));
try {
  const { c: root, p: rp } = await context(1440);
  await login(rp, "root@example.invalid");
  await rp
    .getByLabel("Nome da empresa", { exact: true })
    .fill("Oficina Freeze UX");
  await rp.getByLabel("Identificador no endereço").fill("oficina-freeze-ux");
  await rp.getByLabel("Preparar primeiro administrador agora").uncheck();
  await rp.getByRole("button", { name: /Criar.*empresa/ }).click();
  await settle(rp);
  await rp.goto("/app");
  await settle(rp);
  const cold = await measure(rp, "root-open-cold", () =>
    rp.locator(".org-card").filter({ hasText: "Oficina Freeze UX" }).click(),
  );
  assert.equal(calls(cold, "onboarding_context").length, 1);
  assert.ok(!cold.frames.some((f) => f.shell === false));
  await root.tracing.stop({ path: `${out}/cold-trace.zip` });
  await root.close();
  const { c, p } = await context(390);
  await login(p, "admin@example.invalid");
  await p.goto("/app");
  await settle(p);
  const base = await p
    .locator(".org-card")
    .filter({ hasText: "ms-auto-ficticia" })
    .getAttribute("href");
  const entry = await measure(p, "company-double-click", () =>
    p.locator(".org-card").filter({ hasText: "ms-auto-ficticia" }).dblclick(),
  );
  assert.equal(
    entry.requests.filter((q) => q.path === "/access/context").length,
    1,
  );
  await nav(p, base + "/configuracao");
  await settle(p);
  for (const section of ["servicos", "faq", "manual", "respostas", "regras"]) {
    const r = await measure(p, `reuse-${section}`, () =>
      nav(p, base + "/" + section),
    );
    assert.equal(calls(r, "company_context").length, 0);
  }
  const billing = await measure(p, "billing", () =>
    nav(p, base + "/assinatura"),
  );
  assert.equal(calls(billing, "billing_capabilities").length, 1);
  const media = await measure(p, "company-media", () =>
    nav(p, base + "/pagina"),
  );
  const downloads = media.requests.filter((q) =>
    q.path.startsWith("/company-media/"),
  );
  assert.equal(downloads.length, new Set(downloads.map((q) => q.path)).size);
  const preview = await measure(p, "preview", () =>
    p
      .locator("#previa")
      .getByRole("button", { name: "Visualizar como cliente", exact: true })
      .click(),
  );
  const imgs = preview.requests.filter((q) =>
    q.path.startsWith("/company-media/"),
  );
  assert.equal(imgs.length, 4);
  assert.ok(
    Math.max(...imgs.map((q) => q.t)) < Math.min(...imgs.map((q) => q.end)),
  );
  await p.goto(base + "/atendimento");
  await settle(p);
  await p.getByRole("button", { name: "Todos", exact: true }).click();
  await settle(p);
  await p
    .getByLabel("Minha presença", { exact: true })
    .selectOption("available");
  await settle(p);
  const links = await p
    .locator("a.h-ticket")
    .evaluateAll((es) => es.map((e) => e.getAttribute("href")));
  let sent = false;
  for (const href of links.slice(0, 8)) {
    await nav(p, href);
    await settle(p);
    const claim = p.getByRole("button", {
      name: "Assumir atendimento",
      exact: true,
    });
    if (await claim.isEnabled()) {
      await claim.click();
      await settle(p);
    }
    const field = p.getByLabel("Resposta pública ao cliente", { exact: true });
    if (await field.isEnabled()) {
      await field.fill("Regressão sintética UX001 — atualização paralela.");
      const r = await measure(p, "send-parallel", () =>
        p.getByRole("button", { name: "Enviar mensagem", exact: true }).click(),
      );
      const ctx = calls(r, "central_context")[0],
        queue = calls(r, "central_queue")[0],
        cmd = calls(r, "central_act")[0];
      assert.equal(cmd.status, 200);
      assert.ok(ctx.t >= cmd.end - 5);
      assert.ok(queue.t < ctx.end);
      assert.equal(r.final.alerts.length, 0);
      sent = true;
      break;
    }
  }
  assert.ok(sent);
  for (const r of results) {
    assert.equal(r.status, "RECORDED", r.id);
    assert.equal(r.errors.length, 0, r.id);
    assert.equal(r.final.overflow, 0, r.id);
  }
  await writeFile(
    `${out}/checks.json`,
    JSON.stringify(
      {
        status: "PASS",
        checks: [
          "PERF-001 shell",
          "PERF-002 onboarding",
          "PERF-003 reuso company_context",
          "PERF-004 clique duplo",
          "PERF-006 atualização paralela Central",
          "PERF-007 prévia concorrente",
          "PERF-010 capabilities",
          "PERF-011 downloads compartilhados",
        ],
        sourcePreservation: "Demais itens conferidos por integridade e gate.",
      },
      null,
      2,
    ),
  );
  await c.tracing.stop({ path: `${out}/regression-trace.zip` });
  await c.close();
} finally {
  await browser.close();
}
