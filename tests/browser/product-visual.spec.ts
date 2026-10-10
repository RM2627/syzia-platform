import { test, expect } from "@playwright/test";
import { setupConsumer } from "../support/consumer-browser";
import sharp from "sharp";
// Presentation stress fixtures only; does not claim PostgREST or public-projection security validation.
test("Fase 8: nomes longos, catálogo grande e fotografias em proporções diferentes", async ({
  page,
}) => {
  const c = await setupConsumer(page);
  try {
    let data: any;
    await c.asAdmin(async (x: any) => {
      data = await x.rpc("consumer_public_page", {
        p_slug: "ms-auto-ficticia",
      });
    });
    data.name =
      "Empresa Fictícia de Serviços Especializados com um Nome Muito Longo para Revisão de Layout";
    data.description =
      "Atendimento fictício com informações comerciais extensas, claras e publicadas. ".repeat(
        8,
      );
    data.services = Array.from({ length: 24 }, (_, i) => ({
      ...data.services[i % data.services.length],
      code: "visual-fixture-" + i,
      name:
        "Serviço fictício com descrição longa e diferentes necessidades " + i,
      image_url: "https://image-fixture.invalid/" + i + ".png",
    }));
    await page.route("**/rest/v1/rpc/consumer_public_page", (r) =>
      r.fulfill({ json: data }),
    );
    const images = await Promise.all(
      [
        [1200, 300],
        [300, 1000],
      ].map(([width, height]) =>
        sharp({ create: { width, height, channels: 3, background: "#759e8e" } })
          .png()
          .toBuffer(),
      ),
    );
    await page.route("https://image-fixture.invalid/**", (r) =>
      r.fulfill({
        contentType: "image/png",
        body: images[parseInt(r.request().url().split("/").pop() || "0") % 2],
      }),
    );
    await page.goto("/empresa/ms-auto-ficticia");
    await expect(page.locator(".c-service")).toHaveCount(24);
    for (const [label, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect(page.locator(".c-service-photo img").first()).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await page.screenshot({
        path: `reports/visual-phase8/stress-${label}.png`,
        fullPage: true,
      });
    }
  } finally {
    await c.close();
  }
});
test("Fase 8: carregamento lento e erro público não deixam página incompleta", async ({
  page,
}) => {
  const c = await setupConsumer(page);
  try {
    await page.route("**/rest/v1/rpc/consumer_public_page", async (r) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await r.fulfill({
        status: 503,
        json: { message: "temporary_unavailable" },
      });
    });
    await page.goto("/empresa/ms-auto-ficticia");
    await expect(page.getByRole("status")).toContainText(
      "Preparando seu atendimento",
    );
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator(".c-service")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Tentar novamente" }),
    ).toBeEnabled();
    await page.screenshot({
      path: "reports/visual-phase8/public-error.png",
      fullPage: true,
    });
  } finally {
    await c.close();
  }
});
