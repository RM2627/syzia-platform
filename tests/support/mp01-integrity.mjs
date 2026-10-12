// Explicit, byte-exact exception authorized by the MP-01 adapter hotfix.
// Historical manifests remain unchanged; all other entries keep their old hash.
import assert from "node:assert/strict";
export function mp01ExpectedHash(path, historical) {
  if (path !== "server/billing/mercado-pago.mjs") return historical;
  assert.equal(historical, "9d7737edecf656b210bfa0cddaa5e28922f98bc748d0a90d96fe2058bd0cc5ae", "unexpected historical billing adapter");
  return "2d83d945a8e859d78ce9c0307b4a6ef14582c405e3fcf54acd1f289f678da5c1";
}
