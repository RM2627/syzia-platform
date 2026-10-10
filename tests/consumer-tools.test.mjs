import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConsumerConfig } from "../scripts/homologation/consumer-config.mjs";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
const token = (n) =>
  "h." +
  Buffer.from(
    JSON.stringify({
      role: "authenticated",
      sub: n,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url") +
  ".s";
const valid = () => ({
  testOnlyAcknowledged: true,
  realCustomerData: false,
  projectRef: "abcdefghijklmnopqrst",
  url: "https://abcdefghijklmnopqrst.supabase.co",
  publishableKey: "sb_publishable_fixture",
  tokens: { alice: token("a"), bob: token("b"), adminA: token("c") },
  slugs: { a: "ms-auto-ficticia", b: "horizonte-ficticio" },
});
test("Configuração exige projeto dedicado e ausência de clientes reais", () => {
  for (const patch of [
    { testOnlyAcknowledged: false },
    { realCustomerData: true },
    { url: "https://production.example" },
  ])
    assert.throws(() => validateConsumerConfig({ ...valid(), ...patch }));
});
test("Configuração rejeita service role, tokens repetidos e token expirado", () => {
  assert.throws(() =>
    validateConsumerConfig({ ...valid(), publishableKey: "sb_secret_abc" }),
  );
  const c = valid();
  c.tokens.bob = c.tokens.alice;
  assert.throws(() => validateConsumerConfig(c));
  c.tokens.bob =
    "h." +
    Buffer.from(
      JSON.stringify({ role: "authenticated", sub: "b", exp: 1 }),
    ).toString("base64url") +
    ".s";
  assert.throws(() => validateConsumerConfig(c));
});
test("Configuração aceita apenas slugs fictícios distintos", () => {
  assert.deepEqual(validateConsumerConfig(valid()).slugs, valid().slugs);
  assert.throws(() =>
    validateConsumerConfig({
      ...valid(),
      slugs: { a: "ms-auto-details", b: "horizonte-ficticio" },
    }),
  );
});
test("Ferramentas externas recusam ausência de configuração sem conectar", () => {
  for (const path of ["consumer-http", "consumer-concurrency"]) {
    try {
      execFileSync(process.execPath, [`scripts/homologation/${path}.mjs`], {
        stdio: "pipe",
      });
      assert.fail("Should refuse missing config");
    } catch (e) {
      assert.equal(e.status, 2);
      assert.match(e.stderr.toString(), /Nenhuma/);
    }
  }
});
test("Scripts Node do gateway e homologação têm sintaxe válida", () => {
  for (const file of [
    "server/attachments.mjs",
    "server/images.mjs",
    "scripts/dev-consumer-demo.mjs",
    "scripts/homologation/consumer-http.mjs",
    "scripts/homologation/consumer-concurrency.mjs",
  ])
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
});
test("Storage permanece privado e nenhum client recebe escrita no bucket", () => {
  const s = readFileSync("supabase/storage/consumer-private.sql", "utf8");
  assert.match(s, /false,5242880/);
  assert.match(s, /as restrictive for all to anon,authenticated/);
  assert.match(s, /bucket_id<>'consumer-private'/);
});
test("Nenhuma chave privilegiada é lida pelo código frontend", () => {
  for (const dir of ["src", "src/consumer", "src/company"])
    for (const f of readdirSync(dir)) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const s = readFileSync(dir + "/" + f, "utf8");
      assert.ok(
        !/import\.meta\.env\.[A-Z_]*(?:SERVICE_ROLE|SECRET)/.test(s),
        f,
      );
    }
});
