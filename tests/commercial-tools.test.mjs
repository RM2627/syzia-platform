import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { validateCommercialConfig } from "../scripts/homologation/commercial-config.mjs";
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
  opportunities: { a: "o_" + "a".repeat(24), b: "o_" + "b".repeat(24) },
  requestA: "r_" + "a".repeat(24),
});
test("Comercial: guardas exigem projeto dedicado, empresas distintas e dados fictícios", () => {
  assert.ok(validateCommercialConfig(config()));
  for (const patch of [
    { realCustomerData: true },
    { testOnlyAcknowledged: false },
    { url: "https://other.example" },
  ])
    assert.throws(() => validateCommercialConfig({ ...config(), ...patch }));
  const c = config();
  c.organizations.b = c.organizations.a;
  assert.throws(() => validateCommercialConfig(c));
});
test("Comercial: tokens únicos, não expirados, sem service role e sem exp ausente", () => {
  for (const patch of [{ exp: 1 }, { role: "service_role" }, { exp: null }]) {
    const c = config();
    c.tokens.agentA = token(0, patch);
    assert.throws(() => validateCommercialConfig(c));
  }
  const c = config();
  c.tokens.backup = c.tokens.agentA;
  assert.throws(() => validateCommercialConfig(c));
  assert.throws(() =>
    validateCommercialConfig({
      ...config(),
      publishableKey: "sb_secret_forbidden",
    }),
  );
});
test("Comercial: ferramentas externas recusam ausência de configuração antes da rede", () => {
  for (const script of ["commercial-http", "commercial-concurrency"]) {
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
test("Comercial: scripts de homologação têm sintaxe válida e inspeção SQL não escreve", () => {
  for (const script of [
    "commercial-http",
    "commercial-concurrency",
    "commercial-config",
  ])
    execFileSync(process.execPath, [
      "--check",
      "scripts/homologation/" + script + ".mjs",
    ]);
  const sql = readFileSync(
    "scripts/homologation/commercial-inspect.sql",
    "utf8",
  ).replace(/--.*$/gm, "");
  assert.doesNotMatch(sql, /\b(update|insert|delete|alter|drop|truncate)\b/i);
});
test("Comercial: códigos de oportunidade distintos e válidos obrigatórios", () => {
  const c = config();
  c.opportunities.b = c.opportunities.a;
  assert.throws(() => validateCommercialConfig(c));
  c.opportunities.b = "uuid-is-not-access";
  assert.throws(() => validateCommercialConfig(c));
});
