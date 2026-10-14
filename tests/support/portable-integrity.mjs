// Repository-file integrity only. Never use for tokens, signatures, legal approval
// hashes, database snapshots, uploaded assets or downloadable archive checksums.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function textLF(bytes) {
  const text = bytes.toString("utf8");
  // Preserve BOM, whitespace and Unicode byte representation; reject lossy decoding,
  // binary control bytes and lone CR. Only paired CRLF may change to LF.
  if (!Buffer.from(text, "utf8").equals(bytes) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))
    return null;
  const lf = text.replaceAll("\r\n", "\n");
  return lf.includes("\r") ? null : lf;
}
const listBytes = readFileSync(new URL("../../docs/syzia-051/integrity-text-paths.json", import.meta.url));
const listText = textLF(listBytes);
assert.notEqual(listText, null, "integrity text allowlist must be UTF-8 text");
assert.equal(sha(Buffer.from(listText)), "0c19fd56edb2860ae483f41cb07f6698dd6f0e512c9c1b2b659890109c3d661a", "integrity text allowlist was changed");
const entries = JSON.parse(listText);
assert.equal(entries.length, 892);
const allowed = new Set(entries);
assert.equal(allowed.size, entries.length);

function matchFileHash(path, bytes, expected) {
  assert.ok(Buffer.isBuffer(bytes), "integrity requires original bytes: " + path);
  assert.match(expected, /^[a-f0-9]{64}$/, "invalid expected hash: " + path);
  if (sha(bytes) === expected) return { mode: "byte_exact", bytes };
  if (allowed.has(path)) {
    const lf = textLF(bytes);
    if (lf !== null) {
      for (const candidate of [Buffer.from(lf, "utf8"), Buffer.from(lf.replaceAll("\n", "\r\n"), "utf8")])
        if (sha(candidate) === expected) return { mode: "lf_crlf_only", bytes: candidate };
    }
  }
  assert.fail("integrity mismatch (content or unauthorized representation): " + path);
}
export function assertFileHash(path, bytes, expected) {
  return matchFileHash(path, bytes, expected).mode;
}
// Reconstruct only a representation whose bytes hash to the pre-existing reference.
// Used for provenance proofs; never writes back to the checked file.
export function referenceFileBytes(path, bytes, expected) {
  return matchFileHash(path, bytes, expected).bytes;
}
