import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  commercial056,
  sha056,
  lf056,
  assertCommercial056File,
  commercial056ExpectedHash,
} from "../support/commercial056-integrity.mjs";
const baseText = readFileSync("docs/syzia-056/base-ba65468.json");
assert.equal(sha056(lf056(baseText)), commercial056.base_manifest_sha256);
const base = JSON.parse(baseText);
test("056-I01 every official base file preserved except explicit reviewed transitions; all 51 migrations and HF01–HF03 unchanged", () => {
  assert.equal(
    Object.keys(base).filter((p) => p.startsWith("supabase/migrations/"))
      .length,
    51,
  );
  for (const [p, r] of Object.entries(base)) {
    const b = readFileSync(p);
    if (assertCommercial056File(p, b, r.sha256)) continue;
    if (sha056(b) !== r.sha256) {
      assert.ok(r.sha256_lf, "byte-exact official source changed: " + p);
      assert.equal(
        sha056(lf056(b)),
        r.sha256_lf,
        "official source changed: " + p,
      );
    }
  }
});
test("056-I02 authorized source rejects mutations, wrong predecessors and lone CR; paired EOL only for authorized text", () => {
  for (const [p, r] of Object.entries(commercial056.transitions)) {
    const b = readFileSync(p);
    assertCommercial056File(p, b, r.before[0]);
    assert.throws(
      () => commercial056ExpectedHash(p, "0".repeat(64)),
      /predecessor/,
    );
    assert.throws(
      () =>
        assertCommercial056File(
          p,
          Buffer.concat([b, Buffer.from("UNAUTHORIZED")]),
          r.before[0],
        ),
      /mismatch/,
    );
    if (r.text) {
      assertCommercial056File(
        p,
        Buffer.from(lf056(b).replaceAll("\n", "\r\n")),
        r.before[0],
      );
      assert.throws(
        () =>
          assertCommercial056File(p, Buffer.from(lf056(b) + "\r"), r.before[0]),
        /lone CR/,
      );
    }
  }
});
test("056-I03 new migration, component and tests are pinned; no billing/backend service transition", () => {
  for (const [p, r] of Object.entries(commercial056.added))
    assert.equal(
      sha056(r.text ? lf056(readFileSync(p)) : readFileSync(p)),
      r.sha256,
      p,
    );
  for (const p of Object.keys(commercial056.transitions))
    assert.doesNotMatch(p, /^(server\/|src\/billing\/|supabase\/migrations\/)/);
});
