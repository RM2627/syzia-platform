import {
  browser,
  results,
  phase,
  out,
  context,
  measure,
  login,
  nav,
  settle,
} from "./harness.mjs";
try {
  // Cold global entry, including the existing audited authorization/entry operation.
  const { c: root, p: rp } = await context(1440);
  await login(rp, "root@example.invalid");
  await rp
    .getByLabel("Nome da empresa", { exact: true })
    .fill("Oficina Aurora UX");
  await rp.getByLabel("Identificador no endereço").fill("oficina-aurora-ux");
  await rp.getByLabel("Preparar primeiro administrador agora").uncheck();
  await rp.getByRole("button", { name: /Criar.*empresa/ }).click();
  await settle(rp);
  await rp.goto("/app");
  await settle(rp);
  await measure(rp, "root-open-cold", () =>
    rp.locator(".org-card").filter({ hasText: "Oficina Aurora UX" }).click(),
  );
  await root.tracing.stop({ path: `${out}/root-trace.zip` });
  await root.close();
  for (const width of [1440, 390]) {
    const { c, p } = await context(width);
    await measure(p, `login-${width}`, () => login(p, "admin@example.invalid"));
    await p.goto("/app");
    await settle(p);
    const href = await p
      .locator(".org-card")
      .filter({ hasText: "ms-auto-ficticia" })
      .getAttribute("href");
    await measure(p, `open-company-${width}`, () =>
      p.locator(".org-card").filter({ hasText: "ms-auto-ficticia" }).click(),
    );
    for (const section of [
      "agenda",
      "pendencias",
      "atendimento",
      "clientes",
      "comercial",
      "orcamentos",
      "metricas",
      "financeiro",
      "assinatura",
      "acessos",
      "pagina",
      "configuracao",
      "servicos",
      "manual",
      "faq",
      "respostas",
      "regras",
      "ajuda",
      "",
    ]) {
      await measure(p, `route-${section || "home"}-${width}`, () =>
        nav(p, href + (section ? "/" + section : "")),
      );
      if (section === "agenda") {
        await measure(p, `agenda-week-${width}`, () =>
          p.getByRole("button", { name: "Semana", exact: true }).click(),
        );
        await measure(p, `agenda-month-${width}`, () =>
          p.getByRole("button", { name: "Calendário", exact: true }).click(),
        );
      }
      if (section === "atendimento") {
        await p.getByRole("button", { name: "Todos", exact: true }).click();
        await settle(p);
        const tickets = await p.locator("a.h-ticket").count();
        for (let i = 0; i < Math.min(2, tickets); i++)
          await measure(p, `ticket-${i + 1}-${width}`, () =>
            p.locator("a.h-ticket").nth(i).click(),
          );
      }
      if (
        section === "clientes" &&
        (await p
          .getByRole("button", { name: "Ver histórico", exact: true })
          .count())
      )
        await measure(p, `client-history-${width}`, () =>
          p
            .getByRole("button", { name: "Ver histórico", exact: true })
            .first()
            .click(),
        );
    }
    await c.tracing.stop({ path: `${out}/company-${width}-trace.zip` });
    await c.close();
    const { c: pub, p: pp } = await context(width);
    await measure(pp, `public-${width}`, () =>
      pp.goto("/empresa/ms-auto-ficticia"),
    );
    await measure(pp, `public-services-${width}`, async () => {
      await pp.getByRole("link", { name: /Conhecer os serviços/ }).click();
    });
    await measure(pp, `public-request-${width}`, async () => {
      await pp
        .getByRole("button", { name: /Adicionar ao pedido/ })
        .first()
        .click();
      await pp
        .getByRole("button", { name: "Continuar pedido", exact: true })
        .click();
    });
    await pub.tracing.stop({ path: `${out}/consumer-${width}-trace.zip` });
    await pub.close();
  }
} finally {
  await browser.close();
}
