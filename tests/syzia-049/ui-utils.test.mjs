import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  normalizePhone,
  formatPhone,
  whatsappHref,
} from "../../src/consumer/phone.ts";
import { memberLimitLabel } from "../../src/billing/plan-copy.ts";
import { renderDocument } from "../../src/documents/render.ts";
import { PDFDocument } from "pdf-lib";
test("049-X01 singular/plural/zero/ilimitado sem alteração de preço", () => {
  assert.equal(memberLimitLabel(1), "1 membro da equipe");
  assert.equal(memberLimitLabel(3), "3 membros da equipe");
  assert.match(memberLimitLabel(0), /^0 membros/);
  assert.match(memberLimitLabel(null), /Ilimitado/);
});
test("049-T03 telefone e WhatsApp: máscara, BR, internacional, inválidos e texto seguro", () => {
  for (const raw of ["(87) 99999-1234", "87999991234", "+55 87 99999-1234"])
    assert.equal(normalizePhone(raw), "5587999991234");
  assert.equal(normalizePhone("+1 202 555 0123"), "+12025550123");
  assert.equal(whatsappHref("+1 202 555 0123"), "https://wa.me/12025550123");
  assert.equal(formatPhone("5587999991234"), "(87) 99999-1234");
  for (const x of [
    "",
    "20999991234",
    "teste87999991234",
    "879123",
    "87999999999",
  ])
    assert.equal(whatsappHref(x), null);
  assert.match(
    whatsappHref("87999991234", "Olá & orçamento?"),
    /text=Ol%C3%A1%20%26%20or%C3%A7amento%3F/,
  );
});
test("049-D06 PDF multipágina: acentos, longos, desconto, branding/fallback, metadados e impressão", async () => {
  const d = {
    kind: "quote",
    reference: "v_ficticio49",
    request: "r_ficticio49",
    issued_at: new Date().toISOString(),
    status: "Proposta enviada",
    company: {
      name: "Oficina São José — Empresa Fictícia",
      timezone: "America/Recife",
      address: "Rua Fictícia, 49",
    },
    branding: { primary_color: "#C52831" },
    content: {
      version: 3,
      kind: "final",
      price_mode: "fixed",
      total_cents: 11900,
      subtotal_cents: 12000,
      discount_cents: 100,
      items: Array.from({ length: 30 }, (_, i) => ({
        name: `Serviço ${i + 1} — Avaliação, manutenção e atenção às orientações`,
        quantity: 1,
        unit_cents: 400,
        gross_cents: 400,
        discount_cents: 0,
        note:
          "Observação com acentos: ç, ã, é. " +
          "Descrição detalhada. ".repeat(5),
      })),
      customer_explanation: "Informação longa: " + "SEMESPACO".repeat(90),
    },
  };
  const bytes = await renderDocument(
    d,
    new Uint8Array(await readFile("public/fonts/DejaVuSans.ttf")),
  );
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 2);
  assert.equal(pdf.getAuthor(), d.company.name);
  await mkdir("reports/commercial-054/regenerated-049/documents", { recursive: true });
  await writeFile("reports/commercial-054/regenerated-049/documents/orcamento-ficticio.pdf", bytes);
  const receipt = {
    ...d,
    kind: "appointment",
    status: "Confirmado",
    content: {
      revision: 2,
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 3600000).toISOString(),
      execution_state: "scheduled",
      services: ["Serviço multissegmento — visita técnica"],
      instructions: "Apresente a referência da solicitação.",
    },
  };
  await writeFile(
    "reports/commercial-054/regenerated-049/documents/agendamento-ficticio.pdf",
    await renderDocument(
      receipt,
      new Uint8Array(await readFile("public/fonts/DejaVuSans.ttf")),
    ),
  );
});
