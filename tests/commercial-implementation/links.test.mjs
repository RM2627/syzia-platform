import test from "node:test";
import assert from "node:assert/strict";
import {
  demoLink,
  demoOrigin,
  demoOrigins,
  allowedDemoOrigin,
  PLANNED_DEMO_ORIGIN,
} from "../../server/commercial/links.mjs";
test("D01 planned hostname and per-company path are generated without an external call", () =>
  assert.equal(
    demoLink(PLANNED_DEMO_ORIGIN, "atelie-aurora"),
    "https://demo.usesyzia.com.br/atelie-aurora",
  ));
test("D02 configurable local origins do not depend on public DNS", () =>
  assert.equal(
    demoLink("http://127.0.0.1:5181", "casa-horizonte"),
    "http://127.0.0.1:5181/casa-horizonte",
  ));
for (const value of [
  "http://demo.usesyzia.com.br",
  "https://user:password@demo.usesyzia.com.br",
  "https://demo.usesyzia.com.br/path",
  "https://demo.usesyzia.com.br?key=value",
  "https://demo.usesyzia.com.br#value",
  "javascript:alert(1)",
  "null",
  undefined,
])
  test("D03 unsafe origin rejected " + String(value), () =>
    assert.throws(() => demoOrigin(value)),
  );
for (const slug of [
  "../admin",
  "//other.example",
  "a?x=1",
  "x#secret",
  "admin",
  "a%2fb",
  "a\\b",
  "Empresa A",
  "-empresa",
  "empresa-",
])
  test("D04 unsafe slug rejected " + slug, () =>
    assert.throws(() => demoLink(PLANNED_DEMO_ORIGIN, slug)),
  );
test("D05 operational and demo origins cannot silently share a session origin", () =>
  assert.throws(() =>
    demoOrigins({
      COMMERCIAL_DEMO_ORIGIN: PLANNED_DEMO_ORIGIN,
      PLATFORM_APP_ORIGIN: PLANNED_DEMO_ORIGIN,
    }),
  ));
test("D06 origin checks are exact; null, suffixes and different ports fail", () => {
  assert.equal(
    allowedDemoOrigin(PLANNED_DEMO_ORIGIN, PLANNED_DEMO_ORIGIN),
    true,
  );
  for (const x of [
    undefined,
    "null",
    "https://demo.usesyzia.com.br.attacker.invalid",
    "https://demo.usesyzia.com.br:443",
    "https://app.usesyzia.com.br",
  ])
    assert.equal(allowedDemoOrigin(x, PLANNED_DEMO_ORIGIN), false);
});
test("D07 missing environment fails closed instead of assuming deployed infrastructure", () =>
  assert.throws(() =>
    demoOrigins({ PLATFORM_APP_ORIGIN: "https://app.usesyzia.com.br" }),
  ));
