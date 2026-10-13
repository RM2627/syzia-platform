import { hotfix051ExpectedHash } from "../support/hotfix051-integrity.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
test("HF-I01 migrations até 049, lockfile Sharp e backend protegido intactos", async () => {
  const hashes = JSON.parse(
    await readFile("docs/testing/hotfix-049-preserved-sha256.json", "utf8"),
  );
  assert.equal(
    Object.keys(hashes).filter((x) => x.startsWith("supabase/")).length,
    45,
  );
  for (const [p, hash] of Object.entries(hashes))
    assert.equal(
      createHash("sha256")
        .update(await readFile(p))
        .digest("hex"),
      hotfix051ExpectedHash(p, hash),
      p,
    );
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(pkg.dependencies.sharp, "0.35.5");
});
test("HF-I02 prévias reais locais têm dimensões reservadas e tamanho limitado", async () => {
  for (const id of ["home", "atendimento", "orcamentos", "agenda"]) {
    const p = `public/marketing/produto-${id}.webp`,
      m = await sharp(p).metadata();
    assert.equal(m.width, 1280);
    assert.equal(m.height, 850);
    assert.equal(m.format, "webp");
    assert.ok((await stat(p)).size < 200000);
  }
});
