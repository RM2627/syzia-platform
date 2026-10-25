import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  sha060,
  lf060,
  studio060,
  assertStudio060File,
} from "../support/studio060-integrity.mjs";
const raw = readFileSync("docs/syzia-060/base-a5354a9.json");
assert.equal(sha060(lf060(raw)), "d6daed43533c429da74484d14e60a40af52315baf3f5b6009ca735d174a1d5be", "060 base provenance changed");
const base = JSON.parse(raw);
test("060 full official Git base; exact authorized changes only; historical migrations and billing unchanged", () => {
  for (const [p, r] of Object.entries(base.files)) {
    const bytes = readFileSync(p);
    if (assertStudio060File(p, bytes, r.text ? r.sha256_lf : r.sha256))
      continue;
    assert.equal(
      sha060(r.text ? lf060(bytes) : bytes),
      r.text ? r.sha256_lf : r.sha256,
      "base preservation: " + p,
    );
  }
  for (const p of Object.keys(studio060.transitions))
    assert.ok(
      !/^(supabase\/migrations\/|server\/billing\/|src\/billing\/)/.test(p),
      "forbidden 060 edit: " + p,
    );
});
test("060 LF/CRLF accepted only for authorized text; edits, binary changes and false predecessors rejected", () => {
  const p = "server/commercial/runtime.mjs",
    r = studio060.transitions[p],
    bytes = readFileSync(p);
  assertStudio060File(
    p,
    Buffer.from(lf060(bytes).replaceAll("\n", "\r\n")),
    r.before,
  );
  assert.throws(
    () =>
      assertStudio060File(
        p,
        Buffer.concat([bytes, Buffer.from("UNAUTHORIZED")]),
        r.before,
      ),
    /mismatch/,
  );
  assert.throws(
    () => assertStudio060File(p, bytes, "0".repeat(64)),
    /predecessor/,
  );
  assert.throws(() => lf060(Buffer.from("data\rchanged")), /lone CR/);
  assert.throws(() => lf060(Buffer.from([0xff, 0])), /invalid integrity text/);
  const sql = Object.entries(base.files).find(([p]) =>
    p.startsWith("supabase/migrations/"),
  );
  assert.notEqual(
    sha060(
      lf060(
        Buffer.concat([readFileSync(sql[0]), Buffer.from("--unauthorized")]),
      ),
    ),
    sql[1].sha256_lf,
  );
  const binary = Object.entries(base.files).find(([, r]) => !r.text);
  const altered = Buffer.from(readFileSync(binary[0]));
  altered[0] ^= 1;
  assert.notEqual(sha060(altered), binary[1].sha256);
});
