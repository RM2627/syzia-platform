import { browser, out, context, measure } from "./harness.mjs";
try {
  const { c, p } = await context(390);
  await measure(p, "public-390", () => p.goto("/empresa/ms-auto-ficticia"));
  await measure(p, "public-services-390", () =>
    p.getByRole("link", { name: /Conhecer os serviços/ }).click(),
  );
  await measure(p, "public-request-390", async () => {
    await p
      .getByRole("button", { name: /Adicionar ao pedido/ })
      .first()
      .click();
    await p
      .getByRole("button", { name: "Continuar pedido", exact: true })
      .click();
  });
  await c.tracing.stop({ path: `${out}/consumer-trace.zip` });
  await c.close();
} finally {
  await browser.close();
}
