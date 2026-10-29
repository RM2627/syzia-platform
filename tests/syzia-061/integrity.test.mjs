import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
const sha = (b) => createHash("sha256").update(b).digest("hex");
function lf(b) {
  const s = b.toString("utf8");
  assert.ok(
    Buffer.from(s).equals(b) && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s),
    "invalid text",
  );
  const n = s.replaceAll("\r\n", "\n");
  assert.ok(!n.includes("\r"), "lone CR");
  return Buffer.from(n);
}
const raw = readFileSync("docs/syzia-061/base-sha256.json"),
  auth = readFileSync("docs/syzia-061/authorized-hashes.json");
assert.equal(
  sha(lf(raw)),
  "12335700e9b3592eb1b797dbc2777b9e9bf1715e21aba3f82b2cf6e007392ec0",
  "061 official baseline changed",
);
assert.equal(
  sha(lf(auth)),
  "a489d0d2a46b56244c25f9409c1289762aea00e753c9a5979b2690f144c8a149",
  "061 authorization changed",
);
const base = JSON.parse(raw),
  manifest = JSON.parse(auth);
assert.equal(
  manifest.source_commit,
  "6e9cacae053e964b063f0e533e0b752bdddaa869",
);
function verify(path, bytes, expected = base[path]) {
  assert.equal(expected, base[path], "unexpected predecessor: " + path);
  const transition = manifest.transitions[path];
  if (transition) {
    assert.equal(transition.before, expected, "transition predecessor");
    assert.equal(
      sha(lf(bytes)),
      transition.after_lf,
      "authorized content mismatch: " + path,
    );
    return;
  }
  if (sha(bytes) === expected) return;
  assert.ok(manifest.authorized_text_lf[path], "exact bytes required: " + path);
  assert.equal(
    sha(lf(bytes)),
    manifest.authorized_text_lf[path],
    "base content mismatch: " + path,
  );
}
test("061 full official baseline retained; only 16 explicit authorized existing-file changes", () => {
  assert.equal(Object.keys(manifest.transitions).length, 16);
  for (const [p, h] of Object.entries(base)) verify(p, readFileSync(p), h);
  for (const p of Object.keys(manifest.transitions))
    assert.ok(
      !p.startsWith("supabase/migrations/") &&
        !p.startsWith("tests/") &&
        !p.startsWith("src/billing/"),
      "forbidden historical edit: " + p,
    );
});
test("061 historical SQL content preserved with proven EOL portability; exactly three incremental migrations", () => {
  const migrations = Object.keys(base).filter((p) =>
    p.startsWith("supabase/migrations/"),
  );
  assert.equal(migrations.length, 56);
  for (const p of migrations) verify(p, readFileSync(p));
  assert.deepEqual(
    readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql") && !base["supabase/migrations/" + f])
      .sort(),
    [
      "202610280061_service_quantities.sql",
      "202610280062_insights.sql",
      "202610280063_billing_environments.sql",
    ],
  );
});
test("061 negative integrity: EOL-only text accepted; changed code, SQL, binary and predecessor rejected", () => {
  // Both representations must match hashes derived from the exact official Git
  // blobs. No whitespace, BOM, Unicode, SQL or other content normalization.
  for (const path of Object.keys(manifest.authorized_text_lf)) {
    const original = lf(readFileSync(path));
    verify(path, original);
    verify(path, Buffer.from(original.toString().replaceAll("\n", "\r\n")));
  }
  const p = "server/billing/subscriptions.mjs",
    bytes = readFileSync(p);
  verify(p, Buffer.from(lf(bytes).toString().replaceAll("\n", "\r\n")));
  assert.throws(
    () => verify(p, Buffer.concat([bytes, Buffer.from("\n// unauthorized")])),
    /mismatch/,
  );
  assert.throws(() => verify(p, bytes, "0".repeat(64)), /predecessor/);
  const sql = Object.keys(base).find((p) =>
    p.startsWith("supabase/migrations/"),
  );
  assert.throws(
    () =>
      verify(
        sql,
        Buffer.concat([readFileSync(sql), Buffer.from("\n-- unauthorized")]),
      ),
    /mismatch/,
  );
  const binary = Object.keys(base).find((p) => p.endsWith(".png"));
  const changed = Buffer.from(readFileSync(binary));
  changed[0] ^= 1;
  assert.throws(() => verify(binary, changed), /exact bytes/);
  assert.throws(() => lf(Buffer.from("a\rb")), /lone CR/);
  assert.throws(() => lf(Buffer.from([255, 0])), /invalid text/);
});
