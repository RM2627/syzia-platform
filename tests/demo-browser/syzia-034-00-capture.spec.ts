import { test, expect } from "../support/demo-test";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
test("Captura atual da página real com dados fictícios para a landing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 900 });
  await page.goto("/empresa/horizonte-ficticio");
  await expect(page.locator(".c-service").first()).toBeVisible();
  await page
    .locator(".c-cover")
    .evaluate((img: HTMLImageElement) => img.decode());
  await page
    .locator(".c-logo")
    .evaluate((img: HTMLImageElement) => img.decode());
  await mkdir("public/marketing", { recursive: true });
  await sharp(await page.screenshot())
    .webp({ quality: 85 })
    .toFile("public/marketing/pagina-demonstracao.webp");
});
