import {commercial055ExpectedHash,assertCommercial055File}from './commercial055-integrity.mjs';
// Additive, explicit 054 authorization over the supplied 4b33f42 archive.
// Historical manifests remain unchanged. Only enumerated text permits paired CRLF/LF.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const sha = (b) => createHash("sha256").update(b).digest("hex");
function lf(bytes) {
  const t = bytes.toString("utf8");
  assert.ok(
    Buffer.from(t).equals(bytes) && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(t),
    "integrity invalid text",
  );
  const value = t.replaceAll("\r\n", "\n");
  assert.ok(!value.includes("\r"), "integrity lone CR");
  return value;
}
const root = new URL("../../", import.meta.url);
const manifestText = lf(
  readFileSync(
    new URL("docs/commercial-implementation/authorized-hashes.json", root),
  ),
);
assert.equal(
  sha(manifestText),
  "e670aa944f151021d54ea22f15fdd8e24db559eb1b6e213d10870c7db356a7bc",
  "054 authorization manifest changed",
);
export const commercialManifest = JSON.parse(manifestText);
const authorized = new Set([".env.example", ".env.server.example", ".gitignore", "package-lock.json", "package.json", "public/brand/syzia/syzia-horizontal-dark.png", "public/brand/syzia/syzia-horizontal-light.png", "public/brand/syzia/syzia-logo-dark.png", "public/brand/syzia/syzia-logo-light.png", "public/brand/syzia/syzia-symbol-dark.png", "public/brand/syzia/syzia-symbol-light.png", "scripts/syzia-044/current-gate.mjs", "server/access-mail.mjs", "server/unified.mjs", "src/Captcha.tsx", "src/FoundationApp.tsx", "src/access/PeopleAccess.tsx", "src/acquisition/SelfService.tsx", "src/api.ts", "src/consumer/CompanyPage.tsx", "src/consumer/Consumer.tsx", "src/consumer/api.ts", "src/main.tsx", "src/workspace/Workspace.tsx", "tests/demo-browser/syzia-049.spec.ts", "tests/hotfix-050/integrity.test.mjs", "tests/integrated-051/integrity-cases.mjs", "tests/support/hotfix051-integrity.mjs", "tests/syzia-049/ui-utils.test.mjs", "tests/syzia-051/integrity.test.mjs", "tests/ux-modernization/integrity.test.mjs", "vite.config.ts"]);
assert.equal(
  commercialManifest.source_commit,
  "4b33f423982e6d3703935ae2f18a738c0496b72e",
);
for (const [path, row] of Object.entries(commercialManifest.transitions)) {
  assert.ok(authorized.has(path), "054 unauthorized path");
  assert.ok(
    !path.startsWith("supabase/migrations/"),
    "historical migration cannot change",
  );
  assert.match(row.after, /^[a-f0-9]{64}$/);
}
assert.equal(
  Object.keys(commercialManifest.transitions).length,
  authorized.size,
);
const baseText = lf(
  readFileSync(
    new URL("docs/commercial-implementation/base-4b33f42.json", root),
  ),
);
assert.equal(sha(baseText), "edc60eff8d304cc0386152391be8446ff24b29bffb66b4df0516229c01119516", "054 base provenance changed");
export const commercialBase = JSON.parse(baseText);
export function commercialExpectedHash(path, expected) {
  const r = commercialManifest.transitions[path];
  if (!r) return commercial055ExpectedHash(path,expected);
  assert.ok(r.before.includes(expected), "054 unexpected predecessor: " + path);
  return commercial055ExpectedHash(path,r.after);
}
export function assertCommercialFile(path, bytes, expected, expectedLF) {
  const r = commercialManifest.transitions[path];
  if(assertCommercial055File(path,bytes,r?r.after:expected))return;
  if (r) {
    const h = commercialExpectedHash(path, expected);
    if (r.text) assert.equal(sha(lf(bytes)), h, "integrity mismatch: " + path);
    else assert.equal(sha(bytes), h, "integrity mismatch: " + path);
  } else if (sha(bytes) !== expected) {
    assert.ok(expectedLF, "byte-exact integrity mismatch: " + path);
    assert.equal(sha(lf(bytes)), expectedLF, "integrity mismatch: " + path);
  }
}
export function verifyCommercialSources() {
  for (const [path, r] of Object.entries(commercialBase))
    assertCommercialFile(
      path,
      readFileSync(new URL(path, root)),
      r.sha256,
      r.sha256_lf,
    );
  for (const [path, r] of Object.entries(commercialManifest.added)) {
    const bytes = readFileSync(new URL(path, root));
    if(assertCommercial055File(path,bytes,r.sha256))continue;
    assert.equal(
      sha(r.text ? lf(bytes) : bytes),
      r.sha256,
      "new 054 source changed: " + path,
    );
  }
}
