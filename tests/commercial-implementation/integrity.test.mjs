import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  commercialBase,
  commercialManifest,
  assertCommercialFile,
  commercialExpectedHash,
  verifyCommercialSources,
} from "../support/commercial-integrity.mjs";
test("I054-01 complete 1090-file baseline, additive sources and all 49 historical migrations retained", () => {
  assert.equal(Object.keys(commercialBase).length, 1090);
  assert.equal(
    Object.keys(commercialBase).filter((p) =>
      p.startsWith("supabase/migrations/"),
    ).length,
    49,
  );
  assert.equal(
    readdirSync("supabase/migrations").filter((p) => p.endsWith(".sql")).length,
    51,
  );
  verifyCommercialSources();
});
test("I054-02 financial/permission/identity implementations have no 054 transitions", () => {
  for (const p of Object.keys(commercialManifest.transitions))
    assert.doesNotMatch(
      p,
      /^server\/billing\/|^src\/billing\/|^src\/permissions\/|^supabase\/migrations\//,
    );
});
test("I054-03 authorized textual LF/CRLF only; real edits, binary changes and wrong predecessors fail", () => {
  for (const [path, row] of Object.entries(commercialManifest.transitions)) {
    const b = readFileSync(path),
      base = commercialBase[path];
    assertCommercialFile(path, b, base.sha256, base.sha256_lf);
    assert.throws(
      () => commercialExpectedHash(path, "0".repeat(64)),
      /predecessor/,
    );
    assert.throws(() =>
      assertCommercialFile(
        path,
        Buffer.concat([b, Buffer.from("UNAUTHORIZED")]),
        base.sha256,
        base.sha256_lf,
      ),
    );
    if (row.text) {
      const lf = b.toString().replaceAll("\r\n", "\n");
      assertCommercialFile(path, Buffer.from(lf), base.sha256, base.sha256_lf);
      assertCommercialFile(
        path,
        Buffer.from(lf.replaceAll("\n", "\r\n")),
        base.sha256,
        base.sha256_lf,
      );
    }
  }
});
test("I054-04 untouched SQL, secret examples and billing are still content protected", () => {
  for (const p of [
    "server/billing/mercado-pago.mjs",
    "supabase/migrations/202610030045_team_availability_assisted.sql",
    "supabase/migrations/202610030046_flexible_shared_support.sql",
  ]) {
    const r = commercialBase[p];
    assert.throws(() =>
      assertCommercialFile(
        p,
        Buffer.concat([readFileSync(p), Buffer.from("\n-- real change")]),
        r.sha256,
        r.sha256_lf,
      ),
    );
  }
});
