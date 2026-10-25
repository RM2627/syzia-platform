// Exact path-specific 060 successors. No historical manifest is replaced.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
export const sha060 = (b) => createHash("sha256").update(b).digest("hex");
export function lf060(b) {
  const t = b.toString("utf8");
  assert.ok(
    Buffer.from(t).equals(b) && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(t),
    "invalid integrity text",
  );
  const n = t.replaceAll("\r\n", "\n");
  assert.ok(!n.includes("\r"), "lone CR");
  return n;
}
const text = lf060(
  readFileSync(
    new URL("../../docs/syzia-060/authorized-hashes.json", import.meta.url),
  ),
);
assert.equal(sha060(text), "4e7c28baaf7ebe91fc7e392d9b6c4293604ef3d7874f7629b2ac331e56d9c3b6", "060 authorization changed");
export const studio060 = JSON.parse(text);
assert.equal(
  studio060.source_commit,
  "a5354a934f7052471bfdd89223f1f62b3a7610b8",
);
export function studio060Expected(path, expected) {
  const r = studio060.transitions[path];
  if (!r) return expected;
  assert.equal(expected, r.before, "060 unexpected predecessor: " + path);
  return r.after;
}
export function assertStudio060File(path, bytes, expected) {
  const r = studio060.transitions[path];
  if (!r) return false;
  assert.equal(
    sha060(r.text ? lf060(bytes) : bytes),
    studio060Expected(path, expected),
    "060 integrity mismatch: " + path,
  );
  return true;
}
