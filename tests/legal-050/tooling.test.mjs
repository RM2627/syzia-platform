import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  readdir,
  symlink,
  mkdir,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { prepare, compile } from "../../scripts/legal-050/prepare.mjs";
const base = JSON.parse(
  await readFile("docs/legal-050/config.example.json", "utf8"),
);
const config = () => ({
  ...structuredClone(base),
  public_identity: {
    ...base.public_identity,
    operator_name: "Responsável do ensaio local",
    support_email: "suporte@syzia-ensaio.example.org",
    privacy_email: "privacidade@syzia-ensaio.example.org",
  },
});
const snapshot = {
  contract_sha256: "a".repeat(64),
  current: ["terms", "privacy"].map((kind) => ({
    kind,
    version: "older-local",
    acceptance_version: "old-material",
    row_sha256: "b".repeat(64),
  })),
};
test("L050-T01 safe configuration rejects CPF fields, residential addresses, markup, missing contacts and placeholders", async () => {
  for (const change of [
    (c) => (c.public_identity.cpf = ""),
    (c) => (c.public_identity.professional_address = "Endereço residencial"),
    (c) => (c.public_identity.operator_name = "<b>Nome</b>"),
    (c) => (c.public_identity.operator_name = "A DEFINIR"),
    (c) => (c.public_identity.privacy_email = ""),
    (c) =>
      (c.public_identity.professional_address =
        "Endereço profissional pendente"),
  ]) {
    const c = config();
    change(c);
    await assert.rejects(prepare(c, snapshot), /legal_/);
  }
});
test("L050-T02 changed prose/version or expected database snapshot invalidates approval hash", async () => {
  const c = config(),
    a = await prepare(c, snapshot);
  c.public_identity.operator_name = "Outro responsável do ensaio local";
  const b = await prepare(c, snapshot);
  assert.notEqual(a.reviewHash, b.reviewHash);
  assert.throws(
    () => compile(c, snapshot, b, a.reviewHash),
    /legal_review_hash_mismatch/,
  );
  const s = structuredClone(snapshot);
  s.current[0].row_sha256 = "c".repeat(64);
  assert.notEqual((await prepare(c, s)).reviewHash, b.reviewHash);
});
test("L050-T03 CLI uses private external files, never overwrites artifacts, logs no contact and blocks SQL without approval", async () => {
  const dir = await mkdtemp(join(tmpdir(), "legal050-cli-"));
  try {
    const c = config();
    await writeFile(join(dir, "config.json"), JSON.stringify(c));
    await writeFile(join(dir, "snapshot.json"), JSON.stringify(snapshot));
    const run = (mode, out, hash = "") =>
      spawnSync(
        process.execPath,
        [
          "scripts/legal-050/prepare.mjs",
          mode,
          join(dir, "config.json"),
          join(dir, "snapshot.json"),
          join(dir, out),
          hash,
        ],
        { encoding: "utf8" },
      );
    const result = run("preview", "preview");
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /Responsável|@/);
    assert.deepEqual((await readdir(join(dir, "preview"))).sort(), [
      "PRIVACIDADE.md",
      "REVISAO-PARA-APROVACAO.json",
      "TERMOS.md",
    ]);
    const hash = JSON.parse(result.stdout).review_sha256;
    assert.notEqual(run("preview", "preview").status, 0);
    const denied = run("compile", "publication", hash);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /legal_publication_review_pending/);
    await assert.rejects(readdir(join(dir, "publication")), /ENOENT/);
    // A symlink to the source tree cannot redirect private output into versioned files.
    await symlink(process.cwd(), join(dir, "source-link"), "dir");
    assert.notEqual(run("preview", "source-link/leak").status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("L050-T04 inspection script and generated locks are explicit; no application credentials or network client", async () => {
  const source = await readFile("scripts/legal-050/prepare.mjs", "utf8");
  assert.doesNotMatch(
    source,
    /fetch\(|createClient|DATABASE_URL|process\.env|supabase\.co/,
  );
  const { inspectSQL, publicationSQL } =
    await import("../../scripts/legal-050/sql.mjs");
  assert.equal(
    await readFile("scripts/legal-050/01-CONSULTAR.sql", "utf8"),
    inspectSQL,
  );
  const sql = publicationSQL(snapshot, [], "a".repeat(64));
  assert.match(sql, /BEGIN ISOLATION LEVEL READ COMMITTED/);
  assert.match(sql, /pg_advisory_xact_lock\(734921501\)/);
  assert.match(sql, /SHARE ROW EXCLUSIVE/);
  assert.match(sql, /lock_timeout='5s'/);
  assert.doesNotMatch(
    sql,
    /DISABLE|DROP|DELETE FROM|UPDATE private\.legal_acceptances/i,
  );
});
test("L050-T05 production finance, HMAC, all migrations and other modules remain byte-identical", async () => {
  const hashes = JSON.parse(
    await readFile("docs/legal-050/preserved-sha256.json", "utf8"),
  );
  assert.equal(
    Object.keys(hashes).filter((p) => p.startsWith("supabase/migrations/"))
      .length,
    46,
  );
  for (const [path, expected] of Object.entries(hashes))
    assert.equal(
      createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
      expected,
      path,
    );
});
