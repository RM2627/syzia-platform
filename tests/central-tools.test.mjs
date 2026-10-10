import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { validateCentralConfig } from "../scripts/homologation/central-config.mjs";
const token = (i, patch = {}) =>
  "h." +
  Buffer.from(
    JSON.stringify({
      sub: "user-" + i,
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...patch,
    }),
  ).toString("base64url") +
  ".s";
const config = () => ({
  testOnlyAcknowledged: true,
  realCustomerData: false,
  projectRef: "abcdefghijklmnopqrst",
  url: "https://abcdefghijklmnopqrst.supabase.co",
  publishableKey: "sb_publishable_fixture",
  tokens: Object.fromEntries(
    ["agentA", "backup", "agentB", "adminA", "consumerA", "consumerB"].map(
      (u, i) => [u, token(i)],
    ),
  ),
  organizations: {
    a: "10000000-0000-0000-0000-000000000001",
    b: "10000000-0000-0000-0000-000000000002",
  },
  tickets: { a: "t_" + "a".repeat(24), b: "t_" + "b".repeat(24) },
  requestA: "r_" + "a".repeat(24),
});
test("Central: guardas exigem projeto dedicado, empresas distintas e dados fictícios", () => {
  assert.ok(validateCentralConfig(config()));
  for (const patch of [
    { realCustomerData: true },
    { testOnlyAcknowledged: false },
    { url: "https://other.example" },
  ])
    assert.throws(() => validateCentralConfig({ ...config(), ...patch }));
  const c = config();
  c.organizations.b = c.organizations.a;
  assert.throws(() => validateCentralConfig(c));
});
test("Central: tokens únicos, não expirados, sem service role e sem exp ausente", () => {
  for (const patch of [{ exp: 1 }, { role: "service_role" }, { exp: null }]) {
    const c = config();
    c.tokens.agentA = token(0, patch);
    assert.throws(() => validateCentralConfig(c));
  }
  const c = config();
  c.tokens.backup = c.tokens.agentA;
  assert.throws(() => validateCentralConfig(c));
  assert.throws(() =>
    validateCentralConfig({
      ...config(),
      publishableKey: "sb_secret_forbidden",
    }),
  );
});
test("Central: ferramentas externas recusam ausência de configuração antes da rede", () => {
  for (const script of ["central-http", "central-concurrency"]) {
    try {
      execFileSync(
        process.execPath,
        ["scripts/homologation/" + script + ".mjs"],
        { stdio: "pipe" },
      );
      assert.fail("Expected refusal");
    } catch (e) {
      assert.equal(e.status, 2);
      assert.match(e.stderr.toString(), /Nenhuma conexão/);
    }
  }
});
test("Central: scripts de homologação têm sintaxe válida e inspeção SQL não escreve", () => {
  for (const script of [
    "central-http",
    "central-concurrency",
    "central-config",
  ])
    execFileSync(process.execPath, [
      "--check",
      "scripts/homologation/" + script + ".mjs",
    ]);
  const sql = readFileSync(
    "scripts/homologation/central-inspect.sql",
    "utf8",
  ).replace(/--.*$/gm, "");
  assert.doesNotMatch(sql, /\b(update|insert|delete|alter|drop|truncate)\b/i);
});
test("Central: frontend não importa segredos nem decide preço final ou confirma pagamentos", () => {
  const text = readFileSync("src/central/Central.tsx", "utf8");
  assert.doesNotMatch(text, /SERVICE_ROLE|sb_secret_|payments.*\.update/);
  assert.match(text, /central_quote/);
  assert.match(text, /central_booking/);
  assert.match(text, /p_revision/);
});
