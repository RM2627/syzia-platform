import { hotfix051ExpectedHash } from "../support/hotfix051-integrity.mjs";
import { mp01ExpectedHash } from "../support/mp01-integrity.mjs";
import { hotfix050ExpectedHash } from "../support/hotfix050-integrity.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
test("049-I01 44 migrations anteriores, entrada unificada e núcleo financeiro preservado, exceto adaptador MP-01 autorizado", async () => {
  const manifest = JSON.parse(
    await readFile("docs/syzia-049/preserved-048-sha256.json", "utf8"),
  );
  assert.equal(
    Object.keys(manifest).filter((x) => x.startsWith("supabase/")).length,
    44,
  );
  for (const [path, hash] of Object.entries(manifest))
    assert.equal(
      createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
      hotfix051ExpectedHash(path, hotfix050ExpectedHash(path, mp01ExpectedHash(path, hash))),
      path,
    );
});
test("049-I02 lockfile atualizado explicitamente para dependências PDF", async () => {
  assert.equal(
    createHash("sha256")
      .update(await readFile("package-lock.json"))
      .digest("hex"),
    hotfix051ExpectedHash("package-lock.json", (await readFile("docs/syzia-049/lockfile-sha256.txt", "utf8")).trim()),
  );
});
