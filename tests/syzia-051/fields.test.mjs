import test from "node:test";
import assert from "node:assert/strict";
import {
  documentError,
  holderError,
} from "../../src/billing/checkout-fields.ts";
test("051-U name format accepts accents and apostrophes, rejects empty/control/markup", () => {
  for (const n of ["Cláudia de Souza", "Ana D’Avila".replace("’", "'")])
    assert.equal(holderError(n), "");
  for (const n of ["", "<script>", "123456", "A\n"]) assert.ok(holderError(n));
});
test("051-U document validation checks both digits without storage or financial inference", () => {
  assert.equal(documentError("CPF", "529.982.247-25"), "");
  for (const n of ["", "00000000000", "52998224724", "52998224725secret"])
    assert.ok(documentError("CPF", n));
  assert.equal(documentError("CNPJ", "11.222.333/0001-81"), "");
  assert.ok(documentError("CNPJ", "11222333000180"));
});
