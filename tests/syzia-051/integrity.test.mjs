import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { hotfix051ExpectedHash } from "../support/hotfix051-integrity.mjs";
const hash = (s) => createHash("sha256").update(s).digest("hex");
test("051-I exact consolidated 050 preservation except explicitly authorized 051 files; 46 old migrations untouched", async () => {
  const base = JSON.parse(
    await readFile("docs/syzia-051/base-050-sha256.json", "utf8"),
  );
  for (const [path, expected] of Object.entries(base))
    assert.equal(
      hash(await readFile(path)),
      hotfix051ExpectedHash(path, expected),
      path,
    );
  assert.equal(
    Object.keys(base).filter((p) => p.startsWith("supabase/migrations/"))
      .length,
    46,
  );
  assert.equal(
    (await readdir("supabase/migrations")).filter((p) => p.endsWith(".sql"))
      .length,
    47,
  );
});
test("051-I HMAC and verified snapshot (trial/tenant/payment) byte-exact, credentials/runtime/legal unmodified", async () => {
  const source = await readFile("server/billing/mercado-pago.mjs", "utf8");
  const anchors = JSON.parse(
    await readFile("docs/syzia-051/security-anchors.json", "utf8"),
  );
  assert.equal(
    hash(source.slice(source.indexOf("  notification(raw,"))),
    anchors.notification_and_snapshot,
  );
  const form = await readFile("src/billing/SecureCardForm.tsx", "utf8");
  assert.match(form, /iframe: true/);
  assert.doesNotMatch(form, /console\.|localStorage|sessionStorage|analytics/);
  const client = await readFile("src/billing/checkout-api.ts", "utf8");
  assert.doesNotMatch(client, /ACCESS_TOKEN|SERVICE_ROLE/);
});
