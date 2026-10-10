import {
  browser,
  out,
  context,
  measure,
  login,
  nav,
  settle,
} from "./harness.mjs";
import assert from "node:assert/strict";
try {
  for (const width of [1440, 390]) {
    const { c, p } = await context(width);
    await login(p, "admin@example.invalid");
    await p.goto("/app");
    await settle(p);
    const base = await p
      .locator(".org-card")
      .filter({ hasText: "ms-auto-ficticia" })
      .getAttribute("href");
    await p.goto(base + "/atendimento");
    await settle(p);
    await p.getByRole("button", { name: "Todos", exact: true }).click();
    await settle(p);
    await measure(p, `ticket-open-${width}`, () =>
      p.locator("a.h-ticket").first().click(),
    );
    // Opening a company ticket goes to the existing global route, resetting its tab.
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
      if (await claim.isEnabled())
        await measure(p, `claim-${width}`, async () => {
          await claim.click();
          assert.equal(await claim.isDisabled(), true);
        });
      const field = p.getByLabel("Resposta pública ao cliente", {
        exact: true,
      });
      if (await field.isEnabled()) {
        await field.fill("Mensagem sintética da auditoria de desempenho.");
        await measure(p, `send-message-${width}`, async () => {
          const send = p.getByRole("button", {
            name: "Enviar mensagem",
            exact: true,
          });
          await send.click();
          assert.equal(await send.isDisabled(), true);
        });
        assert.equal(
          await p
            .locator(".h-messages")
            .getByText("Mensagem sintética da auditoria de desempenho.", {
              exact: true,
            })
            .count(),
          1,
        );
        sent = true;
        break;
      }
    }
    if (!sent) throw Error("No eligible synthetic ticket to send a message");
    if (links.length > 1)
      await measure(p, `ticket-switch-${width}`, () =>
        nav(
          p,
          links.find((h) => !p.url().endsWith(h)),
        ),
      );
    await measure(p, `client-context-${width}`, async () => {
      await p.getByRole("button", { name: "Contexto", exact: true }).click();
    });
    await p.goto(base + "/orcamentos");
    await settle(p);
    await measure(p, `quote-open-${width}`, () =>
      p
        .getByRole("button", { name: "Abrir solicitação", exact: true })
        .first()
        .click(),
    );
    await p.goto(base + "/pagina");
    await settle(p);
    await measure(p, `page-preview-${width}`, () =>
      p
        .locator("#previa")
        .getByRole("button", { name: "Visualizar como cliente", exact: true })
        .click(),
    );
    await c.tracing.stop({ path: `${out}/actions-${width}-trace.zip` });
    await c.close();
  }
} finally {
  await browser.close();
}
