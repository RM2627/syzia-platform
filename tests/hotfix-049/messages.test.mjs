import test from "node:test";
import assert from "node:assert/strict";
import {
  quoteContactMessage,
  trackingContactMessage,
} from "../../src/operations/contactMessages.ts";
import { whatsappHref } from "../../src/consumer/phone.ts";
test("HF-M01 mensagem canônica ignora referências técnicas, sem promessa de PDF/pagamento", () => {
  for (const [status, mode, total, expected] of [
    ["Proposta enviada", "fixed", 12345, /123,45/],
    ["Proposta aprovada", "fixed", 0, /0,00/],
    ["Proposta expirada", "from", 4990, /a partir de R\$\s49,90/],
    [
      "Estimativa inicial — não é proposta aprovada",
      "quote",
      null,
      /sob consulta/,
    ],
  ]) {
    const t = quoteContactMessage({
      company: { name: "Empresa fictícia" },
      status,
      content: {
        price_mode: mode,
        total_cents: total,
        public_code: "q_secret",
      },
      request: "r_secret",
      reference: "t_secret",
    });
    assert.ok(t.includes(status));
    assert.match(t, expected);
    assert.doesNotMatch(t, /\b[qrt]_secret|PDF|anex|pagamento confirmado/i);
  }
});
test("HF-M02 mensagem manual contém só o acesso fornecido e explica vínculo; wa.me valida telefone", () => {
  const url =
      "https://app.example.invalid/acompanhar/r_fixture#secret=" +
      "a".repeat(64),
    text = trackingContactMessage("Empresa fictícia", url);
  assert.ok(text.includes(url));
  assert.match(text, /7 dias/);
  assert.match(text, /primeiro navegador/);
  for (const invalid of [
    "",
    "00000000000",
    "11999999999",
    "javascript:alert(1)",
  ])
    assert.equal(whatsappHref(invalid, text), null);
  const link = new URL(whatsappHref("(87) 99999-1234", text));
  assert.equal(link.hostname, "wa.me");
  assert.equal(link.searchParams.get("text"), text);
});
