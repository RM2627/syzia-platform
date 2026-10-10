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
  const { c, p } = await context(390);
  await login(p, "admin@example.invalid");
  await p.goto("/app");
  await settle(p);
  const base = await p
    .locator(".org-card")
    .filter({ hasText: "ms-auto-ficticia" })
    .getAttribute("href");
  let deny = true;
  await p.route("**/rest/v1/rpc/operations_home_section", async (route) => {
    if (deny && route.request().postDataJSON()?.p_section === "attention")
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ code: "42501", message: "access_denied" }),
      });
    else await route.fallback();
  });
  await measure(p, "home-isolated-block-failure", async () => {
    await p.goto(base);
    await settle(p);
    assert.equal(
      await p
        .getByRole("heading", { name: "O que fazer hoje?", exact: true })
        .isVisible(),
      true,
    );
    assert.equal(
      await p
        .getByRole("heading", { name: "Agenda de hoje", exact: true })
        .isVisible(),
      true,
    );
    assert.equal(
      await p
        .getByText("Seu acesso a este bloco não está autorizado.", {
          exact: false,
        })
        .isVisible(),
      true,
    );
    assert.equal((await p.locator(".op-appointment").count()) > 0, true);
  });
  deny = false;
  await measure(p, "home-block-retry", async () => {
    await p
      .getByRole("button", { name: "Tentar novamente", exact: true })
      .click();
    await settle(p);
    assert.equal(
      await p
        .getByText("Seu acesso a este bloco não está autorizado.", {
          exact: false,
        })
        .count(),
      0,
    );
  });
  await p.unroute("**/rest/v1/rpc/operations_home_section");
  // A save must refresh the reused configuration context; switching sections must not reset it.
  await p.goto(base + "/servicos");
  await settle(p);
  await p.getByText("Categorias de serviços", { exact: true }).click();
  await p
    .getByLabel("Nova categoria", { exact: true })
    .fill("Categoria sintética UX");
  await measure(p, "category-save-refresh", async () => {
    await p
      .getByRole("button", { name: "Criar categoria", exact: true })
      .click();
    await settle(p);
    assert.equal(
      await p
        .getByRole("option", { name: "Categoria sintética UX", exact: true })
        .count(),
      1,
    );
  });
  await measure(p, "configuration-reuse", async () => {
    await nav(p, base + "/faq");
    await settle(p);
    await nav(p, base + "/servicos");
    await settle(p);
    assert.equal(
      await p
        .getByRole("option", { name: "Categoria sintética UX", exact: true })
        .count(),
      1,
    );
  });
  await p.goto("/app");
  await settle(p);
  await measure(p, "open-double-click", async () => {
    await p
      .locator(".org-card")
      .filter({ hasText: "ms-auto-ficticia" })
      .dblclick();
    await settle(p);
    assert.equal(
      await p
        .getByRole("heading", { name: "O que fazer hoje?", exact: true })
        .isVisible(),
      true,
    );
  });
  for (const width of [320, 768]) {
    await p.setViewportSize({ width, height: 900 });
    for (const section of ["agenda", "clientes", "atendimento", "orcamentos"])
      await measure(p, `responsive-${section}-${width}`, async () => {
        await nav(p, base + "/" + section);
        await settle(p);
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          true,
        );
      });
  }
  await c.tracing.stop({ path: `${out}/guards-trace.zip` });
  await c.close();
} finally {
  await browser.close();
}
