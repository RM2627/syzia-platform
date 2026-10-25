import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { renderDocument } from "../../src/documents/render.ts";
import { storedZip } from "../../src/studio/export.ts";
import {
  studioPreview,
  generateConfiguration,
} from "../../src/studio/model.ts";
const font = await readFile("public/fonts/DejaVuSans.ttf"),
  models = JSON.parse(await readFile("server/studio/segments.json", "utf8"));
test("060 fifteen models: unknown financial and scheduling values stay unknown", () => {
  assert.equal(models.length, 15);
  for (const s of models) {
    const a = generateConfiguration(s.model),
      b = generateConfiguration(s.model);
    assert.notEqual(a.tables.services[0].id, b.tables.services[0].id);
    assert.ok(
      a.tables.services.every(
        (x) =>
          x.price_cents === null &&
          x.duration_minutes === null &&
          !x.direct_booking,
      ),
    );
    assert.equal(a.tables.company_settings[0].business_hours.length, 0);
    assert.equal(
      studioPreview("Aurora", a).services.length,
      a.tables.services.length,
    );
  }
});
test("060 ZIP export preserves PNG bytes and independent paths", async () => {
  const b = new Uint8Array(
    await storedZip([
      { name: "inicio.png", bytes: new Uint8Array([1, 2, 3]) },
      { name: "servicos.png", bytes: new Uint8Array([4, 5]) },
    ]).arrayBuffer(),
  );
  assert.equal(new DataView(b.buffer).getUint32(0, true), 0x04034b50);
  assert.equal(new DataView(b.buffer).getUint16(b.length - 14, true), 2);
  assert.ok(new TextDecoder().decode(b).includes("servicos.png"));
});
test("060 PDF accents, no logo fallback, long pagination and canonical totals", async () => {
  const data = {
    kind: "quote",
    company: { name: "Ação & Organização", timezone: "America/Sao_Paulo" },
    branding: {},
    status: "Proposta enviada",
    request: "q-1",
    reference: "v-1",
    issued_at: "2026-10-25T12:00:00Z",
    content: {
      kind: "final",
      version: 1,
      total_cents: 12345,
      items: Array.from({ length: 25 }, () => ({
        name: "Descrição".repeat(25),
        quantity: 1,
        unit_cents: 500,
        gross_cents: 500,
        note: "Orientações para execução. ".repeat(25),
      })),
    },
  };
  const before = structuredClone(data);
  const bytes = await renderDocument(data, font, new Uint8Array([1, 2, 3]));
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 2);
  assert.deepEqual(data, before);
  assert.ok(pdf.getTitle().includes("Ação"));
});

import {eligibleContact,eligibleDemoLink} from '../../src/platform-commercial/policy.ts';
test('060 link sem e-mail não autoriza envio nem ativação',()=>{
 const c={email:null,stage:'prospect',suppressed:false,authorizations:[]},d={state:'available',published_version_id:'fixture',expires_at:'2030-01-01T00:00:00Z'},now=Date.parse('2026-10-25');
 assert.equal(eligibleDemoLink(c,d,now),true);assert.equal(eligibleContact(c,'demonstration',now),false);assert.equal(eligibleContact(c,'activation',now),false);
 assert.equal(eligibleDemoLink({...c,suppressed:true},d,now),false);assert.equal(eligibleDemoLink(c,{...d,state:'draft'},now),false);
});
