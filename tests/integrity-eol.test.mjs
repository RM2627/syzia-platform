import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertFileHash, referenceFileBytes } from "./support/portable-integrity.mjs";
import { assertHotfix051File } from "./support/hotfix051-integrity.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const bytes = (s) => Buffer.from(s, "utf8");
const sample = bytes("SETTING=disabled\nSECOND=7\n");
const crlf = (b) => bytes(b.toString("utf8").replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"));
const lf = (b) => bytes(b.toString("utf8").replaceAll("\r\n", "\n"));
const reject = (path, actual, expected = sha(sample)) =>
  assert.throws(() => assertFileHash(path, actual, expected), /integrity mismatch/);

test("EOL-01 authorized text accepts only proven LF/CRLF equivalents in either direction", () => {
  assert.equal(assertFileHash(".env.example", sample, sha(sample)), "byte_exact");
  assert.equal(assertFileHash(".env.example", crlf(sample), sha(sample)), "lf_crlf_only");
  assert.equal(assertFileHash(".env.example", sample, sha(crlf(sample))), "lf_crlf_only");
  assert.equal(assertFileHash(".env.example", bytes("SETTING=disabled\r\nSECOND=7\n"), sha(sample)), "lf_crlf_only");
  assert.deepEqual(referenceFileBytes(".env.example", sample, sha(crlf(sample))), crlf(sample));
});

test("EOL-02 real content, spaces, tabs, empty lines and final newline remain significant", () => {
  for (const s of ["SETTING=enabled\nSECOND=7\n", "SETTING=disabled \nSECOND=7\n",
    "SETTING=disabled\nSECOND=7\n\n", "SETTING=disabled\nSECOND=7",
    "SETTING=disabled\n\tSECOND=7\n", "SETTING=disabled\nSECOND=8\n"])
    reject(".env.example", bytes(s));
});

test("EOL-03 BOM, Unicode, invalid UTF-8, NUL and lone CR are never normalized away", () => {
  reject(".env.example", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), sample]));
  reject(".env.example", sample, sha(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), sample])));
  reject(".env.example", bytes("SETTING=disabled\rSECOND=7\r"));
  reject(".env.example", Buffer.concat([sample, Buffer.from([0xff])]));
  reject(".env.example", Buffer.concat([sample, Buffer.from([0])]));
  reject(".env.example", bytes("name=e\u0301\r\n"), sha(bytes("name=é\n")));
  const invalid = Buffer.from([0xff, 0x0a]);
  reject(".env.example", Buffer.from([0xff, 0x0d, 0x0a]), sha(invalid));
});

test("EOL-04 binary and unlisted text paths retain byte-exact comparison", () => {
  for (const path of ["brand/syzia/approved-reference.png", "new-unapproved.txt", ".env",
    "../.env.example", ".ENV.EXAMPLE"] ) {
    assert.equal(assertFileHash(path, sample, sha(sample)), "byte_exact");
    reject(path, crlf(sample));
  }
});

test("EOL-05 every historical migration rejects SQL/RLS changes despite EOL conversion", async () => {
  const baseline = JSON.parse(await readFile("docs/syzia-051/base-050-sha256.json", "utf8"));
  const migrations = Object.entries(baseline).filter(([p]) => p.startsWith("supabase/migrations/"));
  assert.equal(migrations.length, 46);
  for (const [path, expected] of migrations) {
    const original = await readFile(path);
    assertHotfix051File(path, lf(original), expected);
    assertHotfix051File(path, crlf(original), expected);
    assert.throws(() => assertHotfix051File(path, Buffer.concat([lf(original), bytes("\n-- unauthorized SQL edit\n")]), expected), /integrity mismatch/);
    const changed = original.toString("utf8").replace(/SECURITY DEFINER|FORCE ROW LEVEL SECURITY/, "SECURITY INVOKER");
    if (changed !== original.toString("utf8"))
      assert.throws(() => assertHotfix051File(path, crlf(bytes(changed)), expected), /integrity mismatch/);
  }
});

test("EOL-06 code, safe credential examples and plan/security settings reject content edits", async () => {
  for (const path of ["server/billing/mercado-pago.mjs", ".env.example", ".env.server.example", ".gitignore"]) {
    const original = await readFile(path), expected = sha(original);
    assertFileHash(path, lf(original), expected);
    assertFileHash(path, crlf(original), expected);
    reject(path, Buffer.concat([lf(original), bytes("\nUNAUTHORIZED_CHANGE=1\n")]), expected);
  }
  reject(".env.server.example", bytes("ACCESS_TOKEN=changed\r\n"), sha(bytes("ACCESS_TOKEN=fixture-only\n")));
});

test("EOL-07 false expected hashes and historical transition inputs cannot approve current content", () => {
  reject(".env.example", sample, "0".repeat(64));
  assert.throws(() => assertHotfix051File("scripts/legal-050/prepare.mjs", sample, "0".repeat(64)), /unexpected historical input/);
});

test("EOL-08 adding paths to the authorization list is rejected by its independent anchor", async () => {
  const dir = await mkdtemp(join(tmpdir(), "syzia-eol-allowlist-"));
  try {
    await mkdir(join(dir, "tests", "support"), { recursive: true });
    await mkdir(join(dir, "docs", "syzia-051"), { recursive: true });
    const module = join(dir, "tests", "support", "portable-integrity.mjs");
    await writeFile(module, await readFile("tests/support/portable-integrity.mjs"));
    const list = JSON.parse(await readFile("docs/syzia-051/integrity-text-paths.json", "utf8"));
    list.push("new-unapproved.txt");
    await writeFile(join(dir, "docs", "syzia-051", "integrity-text-paths.json"), JSON.stringify(list));
    const result = spawnSync(process.execPath, [module], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /integrity text allowlist was changed/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
