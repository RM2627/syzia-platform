import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const file = "src/platform-commercial/Management.tsx";
const hash = text => createHash("sha256")
  .update(text.replaceAll("\r\n", "\n"))
  .digest("hex");

test("HF-CONVITES: somente Management.tsx foi modificado", () => {
  const files = execFileSync("git", [
    "diff", "--name-only", "HEAD"
  ], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);

  assert.deepEqual(files.sort(), [
    file,
    "tests/commercial-057-hf-convites/authorization.test.mjs",
    "tests/commercial-057-hf-convites/integrity.test.mjs"
  ].sort());
});

test("HF-CONVITES: preserva controles de autorizacao", () => {
  const source = readFileSync(file, "utf8");

  assert.match(source, /commercial_contact_authorize/);
  assert.match(source, /p_authorized:\s*true/);
  assert.match(source, /p_evidence:/);
  assert.match(source, /confirmed/);
  assert.match(source, /eligibleContact/);
  assert.match(source, /!ready/);

  const original = execFileSync("git", [
    "show", "HEAD:" + file
  ], { encoding: "utf8" });

  assert.notEqual(hash(source), hash(original));
});
