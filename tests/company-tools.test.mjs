import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { PGlite } from "./support/pglite.mjs";
import { parseMoney, priceLabel } from "../src/company/model.ts";
test("Conversão monetária preserva centavos sem arredondamento binário", () => {
  assert.equal(parseMoney("145,90"), 14590);
  assert.equal(parseMoney("0.29"), 29);
  assert.equal(parseMoney("1,2"), 120);
  assert.equal(parseMoney("1000000"), 100000000);
  assert.equal(parseMoney("0"), 0);
});
test("Preço inválido não é convertido silenciosamente", () => {
  for (const value of [
    "-1",
    "1,001",
    "1e3",
    "NaN",
    "Infinity",
    "1.000,00",
    "1000000,01",
    "",
    "1,",
    "0x10",
  ])
    assert.throws(() => parseMoney(value));
});
test("Modalidades mantêm rótulos de estimativa e consulta", () => {
  assert.equal(
    priceLabel({
      id: "test",
      organization_id: "test",
      price_mode: "quote",
      price_cents: null,
    }),
    "Sob consulta",
  );
  assert.match(
    priceLabel({
      id: "test",
      organization_id: "test",
      price_mode: "from",
      price_cents: 10000,
    }),
    /^A partir de /,
  );
  assert.ok(
    !priceLabel({
      id: "test",
      organization_id: "test",
      price_mode: "fixed",
      price_cents: 10000,
    }).includes("partir"),
  );
});
test("Runner externo da Empresa para antes de rede sem configuração", async () => {
  const dir = await mkdtemp(join(tmpdir(), "company-guard-"));
  try {
    const r = spawnSync(
      process.execPath,
      [resolve("scripts/homologation/company-http.mjs"), "--mutations"],
      { cwd: dir, encoding: "utf8", timeout: 10000 },
    );
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Nenhuma requisição enviada/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("Inventário SQL da Empresa é somente leitura e confere as 75 tabelas", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("tests/auth-fixture.sql", "utf8"));
    for (const f of (await readdir("supabase/migrations")).sort())
      await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
    await db.exec(
      await readFile("scripts/homologation/company-inspect.sql", "utf8"),
    );
    const r = await db.query(
      "select count(*)::integer n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and relrowsecurity and relforcerowsecurity",
    );
    assert.equal(r.rows[0].n, 75);
  } finally {
    await db.close();
  }
});
