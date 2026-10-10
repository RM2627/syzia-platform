import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { sanitizeImage, MAX_IMAGE_BYTES } from "../server/images.mjs";
for (const [format, mime] of [
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
])
  test("Decodifica e regrava " + format + " sem metadados", async () => {
    const original = await sharp({
      create: { width: 32, height: 20, channels: 3, background: "#559977" },
    })
      [format]()
      .withMetadata({ exif: { IFD0: { Artist: "SEGREDO" } } })
      .toBuffer();
    const out = await sanitizeImage(original, mime);
    assert.equal(out.width, 32);
    assert.equal(out.height, 20);
    assert.match(out.sha256, /^[a-f0-9]{64}$/);
    assert.equal((await sharp(out.data).metadata()).exif, undefined);
  });
test("SVG renomeado .jpeg é rejeitado", async () => {
  await assert.rejects(
    sanitizeImage(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      "image/jpeg",
    ),
  );
});
test("MIME adulterado é rejeitado", async () => {
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  await assert.rejects(sanitizeImage(png, "image/jpeg"));
});
test("Assinatura válida com corpo truncado é rejeitada", async () => {
  await assert.rejects(
    sanitizeImage(
      Buffer.from([255, 216, 255, ...Array(40).fill(0)]),
      "image/jpeg",
    ),
  );
});
test("Arquivo acima de 5 MB é rejeitado", async () => {
  await assert.rejects(
    sanitizeImage(Buffer.alloc(MAX_IMAGE_BYTES + 1), "image/png"),
  );
});
test("Dimensão excessiva é rejeitada antes do processamento final", async () => {
  const png = await sharp({
    create: { width: 8001, height: 2, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  await assert.rejects(sanitizeImage(png, "image/png"));
});
test("Bomba acima de 20 milhões de pixels é rejeitada", async () => {
  const png = await sharp({
    create: { width: 5000, height: 5000, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  await assert.rejects(sanitizeImage(png, "image/png"));
});
