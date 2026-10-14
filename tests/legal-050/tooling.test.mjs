import { assertHotfix051File } from "../support/hotfix051-integrity.mjs";
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
import { join, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { prepare, compile, privateFilePaths } from "../../scripts/legal-050/prepare.mjs";
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
  assertHotfix051File("scripts/legal-050/01-CONSULTAR.sql",
    await readFile("scripts/legal-050/01-CONSULTAR.sql"),
    createHash("sha256").update(inspectSQL).digest("hex"));
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
test("L050-T05 production finance, HMAC, all migrations and other modules remain intact except proven LF/CRLF", async () => {
  const hashes = JSON.parse(
    await readFile("docs/legal-050/preserved-sha256.json", "utf8"),
  );
  assert.equal(
    Object.keys(hashes).filter((p) => p.startsWith("supabase/migrations/"))
      .length,
    46,
  );
  for (const [path, expected] of Object.entries(hashes))
    assertHotfix051File(path, await readFile(path), expected);
});

test("L050-T06 private output rejects project root, nested paths, linked ancestors and junctions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "legal051-paths-"));
  const inside = await mkdtemp(join(process.cwd(), ".legal051-paths-"));
  try {
    await mkdir(join(inside, "nested"));
    await writeFile(join(dir, "config.json"), JSON.stringify(config()));
    await writeFile(join(dir, "snapshot.json"), JSON.stringify(snapshot));
    // Windows exercises an actual junction; POSIX exercises the same ancestor via a symlink.
    const type = process.platform === "win32" ? "junction" : "dir";
    await symlink(inside, join(dir, "project-link"), type);
    await symlink(join(dir, "project-link"), join(dir, "chain"), type);
    const outputs = [
      process.cwd(), inside, join(inside, "leak"), join(inside, "nested", "leak"),
      join(dir, "project-link", "leak"), join(dir, "project-link", "nested", "leak"),
      join(dir, "chain", "nested", "leak"),
    ];
    for (const output of outputs) {
      const spellings = process.platform === "win32"
        ? [output, output.replaceAll("\\", "/")] : [output];
      for (const spelling of spellings) {
        const result = legalCli(join(dir, "config.json"), join(dir, "snapshot.json"), spelling);
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /legal_private_files_must_be_outside_project/);
        assert.doesNotMatch(result.stdout + result.stderr, /Responsável|@/);
      }
    }
    assert.deepEqual(await readdir(inside), ["nested"]);
    assert.deepEqual(await readdir(join(inside, "nested")), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(inside, { recursive: true, force: true });
  }
});

test("L050-T07 private inputs stay external and existing leaf links cannot be overwritten", async () => {
  const dir = await mkdtemp(join(tmpdir(), "legal051-files-"));
  const inside = await mkdtemp(join(process.cwd(), ".legal051-files-"));
  try {
    for (const parent of [dir, inside]) {
      await writeFile(join(parent, "config.json"), JSON.stringify(config()));
      await writeFile(join(parent, "snapshot.json"), JSON.stringify(snapshot));
    }
    const type = process.platform === "win32" ? "junction" : "dir";
    await symlink(inside, join(dir, "project-link"), type);
    for (const name of ["config.json", "snapshot.json"]) {
      const result = legalCli(
        join(dir, name === "config.json" ? "project-link/config.json" : "config.json"),
        join(dir, name === "snapshot.json" ? "project-link/snapshot.json" : "snapshot.json"),
        join(dir, "blocked"),
      );
      assert.equal(result.status, 1);
      assert.match(result.stderr, /legal_private_files_must_be_outside_project/);
    }
    await assert.rejects(readdir(join(dir, "blocked")), /ENOENT/);
    // An existing output leaf must never be followed, even if its parent is external.
    assert.equal(legalCli(join(dir, "config.json"), join(dir, "snapshot.json"),
      join(dir, "project-link")).status, 1);
    assert.deepEqual((await readdir(inside)).sort(), ["config.json", "snapshot.json"]);
    await mkdir(join(dir, "real-parent"));
    await symlink(join(dir, "real-parent"), join(dir, "external-link"), type);
    const result = legalCli(join(dir, "config.json"), join(dir, "snapshot.json"),
      join(dir, "external-link", "preview"));
    assert.equal(result.status, 0, result.stderr);
    assert.equal((await readdir(join(dir, "real-parent", "preview"))).length, 3);
    assert.equal(legalCli(join(dir, "config.json"), join(dir, "snapshot.json"),
      join(dir, "missing-parent", "preview")).status, 1);
    await assert.rejects(readdir(join(dir, "missing-parent")), /ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(inside, { recursive: true, force: true });
  }
});

test("L050-T08 Windows path guard covers both separators, drives, case, UNC and canonical links", async () => {
  const nativeRoot = fileURLToPath(new URL("../../", import.meta.url));
  const cases = [
    { output: "C:\\private\\source-link\\leak", parent: "C:\\app\\foundation", blocked: true },
    { output: "C:/private/source-link/leak", parent: "C:\\app\\foundation", blocked: true },
    { output: "C:/private/source-link/nested\\leak", parent: "C:\\app\\foundation\\nested", blocked: true },
    { output: "C:\\private\\source-link\\leak\\", parent: "C:\\app\\foundation", blocked: true },
    { output: "C:\\app\\foundation", parent: "C:\\app", blocked: true },
    { output: "C:\\APP\\FOUNDATION\\nested\\leak", parent: "C:\\APP\\FOUNDATION\\nested", blocked: true },
    { output: "C:\\private\\preview", parent: "C:\\private", expected: "C:\\private\\preview" },
    { output: "C:/private/preview", parent: "C:\\private", expected: "C:\\private\\preview" },
    { output: "C:\\app\\foundation-backup\\preview", parent: "C:\\app\\foundation-backup", expected: "C:\\app\\foundation-backup\\preview" },
    { output: "D:\\private\\preview", parent: "D:\\private", expected: "D:\\private\\preview" },
    { root: "\\\\host\\share\\foundation", output: "\\\\host\\share\\alias\\leak", parent: "\\\\host\\share\\foundation\\nested", blocked: true },
    { root: "\\\\host\\share\\foundation", output: "\\\\host\\share\\private\\preview", parent: "\\\\host\\share\\private", expected: "\\\\host\\share\\private\\preview" },
  ];
  for (const c of cases) {
    const canonical = new Map([
      [nativeRoot, c.root || "C:\\app\\foundation"],
      ["config-alias", "C:\\private\\config.json"],
      ["snapshot-alias", "C:\\private\\snapshot.json"],
      [win32.dirname(win32.resolve(c.output)), c.parent],
    ]);
    const check = () => privateFilePaths("config-alias", "snapshot-alias", c.output, {
      paths: win32,
      canonicalize: async (value) => {
        assert.ok(canonical.has(value), "unexpected realpath request: " + value);
        return canonical.get(value);
      },
    });
    if (c.blocked) await assert.rejects(check, /legal_private_files_must_be_outside_project/, c.output);
    else assert.deepEqual(await check(), {
      config: "C:\\private\\config.json", snapshot: "C:\\private\\snapshot.json", output: c.expected,
    });
  }
});

function legalCli(configPath, snapshotPath, outPath) {
  return spawnSync(process.execPath, [
    "scripts/legal-050/prepare.mjs", "preview", configPath, snapshotPath, outPath,
  ], { encoding: "utf8" });
}
