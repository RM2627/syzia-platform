import { assertFileHash } from "../support/portable-integrity.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { assertHotfix051File } from "../support/hotfix051-integrity.mjs";
test("051-I consolidated 050 preservation except authorized files and proven LF/CRLF; 46 old migrations intact", async () => {
  const base = JSON.parse(
    await readFile("docs/syzia-051/base-050-sha256.json", "utf8"),
  );
  for (const [path, expected] of Object.entries(base))
    assertHotfix051File(path, await readFile(path), expected);
  assert.equal(
    Object.keys(base).filter((p) => p.startsWith("supabase/migrations/"))
      .length,
    46,
  );
  assert.equal(
    (await readdir("supabase/migrations")).filter((p) => p.endsWith(".sql"))
      .length,
    51,
  );
});
test("051-I HMAC and verified snapshot preserved except LF/CRLF; credentials/runtime/legal unmodified", async () => {
  const source = await readFile("server/billing/mercado-pago.mjs", "utf8");
  const anchors = JSON.parse(
    await readFile("docs/trial-052/security-anchors.json", "utf8"),
  );
  assertFileHash("server/billing/mercado-pago.mjs",
    Buffer.from(source.slice(source.indexOf("  notification(raw,")), "utf8"),
    anchors.notification_and_snapshot,
  );
  assertFileHash("server/billing/mercado-pago.mjs", Buffer.from(source.slice(source.indexOf("  notification(raw,"), source.indexOf("// Static check names")), "utf8"), anchors.notification_only);
  const form = await readFile("src/billing/SecureCardForm.tsx", "utf8");
  assert.match(form, /iframe: true/);
  assert.doesNotMatch(form, /console\.|localStorage|sessionStorage|analytics/);
  const client = await readFile("src/billing/checkout-api.ts", "utf8");
  assert.doesNotMatch(client, /ACCESS_TOKEN|SERVICE_ROLE/);
});
