import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { PGlite } from "../support/pglite.mjs";
import {
  validateConfig,
  accountNames,
  safeError,
} from "../../scripts/homologation/config.mjs";
function config() {
  return {
    testOnlyAcknowledged: true,
    projectRef: "abcdefghijklmno",
    url: "https://abcdefghijklmno.supabase.co",
    publishableKey: "sb_publishable_local_test_value",
    organizations: {
      a: "10000000-0000-0000-0000-000000000001",
      b: "10000000-0000-0000-0000-000000000002",
    },
    accounts: Object.fromEntries(
      accountNames.map((n) => [
        n,
        { email: `${n}@example.invalid`, password: "LocalOnlyPassword123!" },
      ]),
    ),
  };
}
test("Aceita configuração explícita de homologação", () =>
  assert.equal(validateConfig(config()).testOnlyAcknowledged, true));
test("Recusa configuração sem confirmação de dados fictícios", () => {
  const c = config();
  c.testOnlyAcknowledged = false;
  assert.throws(() => validateConfig(c));
});
test("Recusa referência e URL de projetos diferentes", () => {
  const c = config();
  c.url = "https://outroprojeto.supabase.co";
  assert.throws(() => validateConfig(c));
});
test("Recusa HTTP, caminho extra e domínio externo", () => {
  for (const url of [
    "http://abcdefghijklmno.supabase.co",
    "https://abcdefghijklmno.supabase.co/path",
    "https://example.com",
  ]) {
    const c = config();
    c.url = url;
    assert.throws(() => validateConfig(c));
  }
});
test("Recusa service role e secret key", () => {
  for (const key of [
    "sb_secret_never_use",
    `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.sig`,
  ]) {
    const c = config();
    c.publishableKey = key;
    assert.throws(() => validateConfig(c));
  }
});
test("Recusa conta repetida e placeholders", () => {
  const c = config();
  c.accounts.adminA = c.accounts.root;
  assert.throws(() => validateConfig(c));
  const d = config();
  d.accounts.root.password = "REPLACE_PASSWORD";
  assert.throws(() => validateConfig(d));
});
test("Recusa IDs de empresas iguais", () => {
  const c = config();
  c.organizations.b = c.organizations.a;
  assert.throws(() => validateConfig(c));
});
test("Não copia mensagens sensíveis para o relatório", () => {
  assert.deepEqual(safeError({ message: "senha=secret", code: "42501" }), {
    category: "request_or_setup_failure",
    code: "42501",
  });
});
test("Sem configuração, runner encerra antes de autenticar", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "foundation-no-config-"));
  try {
    const r = spawnSync(
      process.execPath,
      [resolve("scripts/homologation/remote-http.mjs")],
      { cwd, encoding: "utf8" },
    );
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Nenhuma requisição/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
test("Preparação fictícia e inspeção SQL funcionam sem alterar proteções", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("tests/auth-fixture.sql", "utf8"));
    for (const f of (await readdir("supabase/migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
    const ids = accountNames.map(
      (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
    );
    for (const id of ids)
      await db.query(
        "insert into auth.users(id,email_confirmed_at) values($1,now())",
        [id],
      );
    await db.query(
      "insert into public.platform_roles(user_id,role) values($1,'super_admin')",
      [ids[0]],
    );
    let seed = await readFile(
      "scripts/homologation/setup-test-fixtures.sql",
      "utf8",
    );
    ["ROOT", "ADMIN_A", "ADMIN_B", "WORKER", "ATTENDANT", "UNLINKED"].forEach(
      (n, i) => {
        seed = seed.replaceAll(`REPLACE_${n}_UUID`, ids[i]);
      },
    );
    await db.exec(seed);
    const before = await db.query(
      "select count(*)::int as count from public.organizations",
    );
    assert.equal(before.rows[0].count, 2);
    await db.exec(
      await readFile("scripts/homologation/inspect-foundation.sql", "utf8"),
    );
    const datasetGuard = await readFile(
      "scripts/homologation/assert-test-dataset.sql",
      "utf8",
    );
    await db.exec(datasetGuard);
    await db.exec("begin");
    await db.query(
      "insert into auth.users(id,email_confirmed_at) values('99999999-0000-0000-0000-000000000001',now())",
    );
    await assert.rejects(
      db.exec(datasetGuard),
      /expected_dedicated_foundation_test_dataset/,
    );
    await db.exec("rollback");
    await assert.rejects(
      db.exec(seed),
      /expected_empty_dedicated_test_dataset/,
    );
    await db.exec("rollback");
    const r = await db.query(
      "select count(*)::int n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity",
    );
    assert.equal(r.rows[0].n, 75);
  } finally {
    await db.close();
  }
});
