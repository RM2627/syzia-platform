import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
export const brl = (v: number | null) =>
  v == null
    ? "Sob consulta"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(v / 100);
// This renderer receives a freshly authorized, canonical snapshot from consumer_document.
// It does not calculate a quote, approve a proposal or persist a private document.
export async function renderDocument(
  d: any,
  fontBytes: Uint8Array,
  logo?: Uint8Array,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  pdf.setTitle(
    `${d.kind === "quote" ? "Orçamento" : "Comprovante de agendamento"} - ${d.company.name}`,
  );
  pdf.setAuthor(d.company.name);
  pdf.setCreationDate(new Date(d.issued_at));
  const color = /^#[\da-f]{6}$/i.test(d.branding?.primary_color || "")
    ? d.branding.primary_color
    : "#38465a";
  const accent = rgb(
    ...([1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255) as [
      number,
      number,
      number,
    ]),
  );
  const ink = rgb(0.12, 0.15, 0.2);
  let page!: PDFPage,
    y = 0;
  const clean = (value: unknown) =>
    String(value ?? "")
      .normalize("NFC")
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
  function newPage() {
    page = pdf.addPage([595.28, 841.89]);
    y = 780;
    page.drawRectangle({ x: 40, y: 812, width: 515, height: 5, color: accent });
  }
  function line(text: string, size = 10, x = 44) {
    if (y < 68) newPage();
    page.drawText(text, { x, y, size, font, color: ink });
    y -= size * 1.5;
  }
  function text(value: unknown, size = 10) {
    const max = 507;
    for (const paragraph of clean(value).split(/\r?\n/)) {
      let row = "";
      for (const word of paragraph.split(/\s+/)) {
        if (font.widthOfTextAtSize(row + (row ? " " : "") + word, size) <= max)
          row += (row ? " " : "") + word;
        else {
          if (row) line(row, size);
          row = "";
          for (const char of word) {
            if (font.widthOfTextAtSize(row + char, size) > max) {
              line(row, size);
              row = "";
            }
            row += char;
          }
        }
      }
      line(row, size);
    }
  }
  function gap() {
    y -= 10;
  }
  const at = (v: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: d.company.timezone || "America/Recife",
    }).format(new Date(v));
  newPage();
  if (logo) {
    try {
      const im = await pdf.embedPng(logo).catch(() => pdf.embedJpg(logo));
      const sz = im.scale(Math.min(120 / im.width, 55 / im.height));
      page.drawImage(im, { x: 44, y: y - sz.height, ...sz });
      y -= sz.height + 32;
    } catch {
      /* A missing/invalid logo never prevents a valid text document. */
    }
  }
  text(d.company.name, 20);
  text(
    d.kind === "quote"
      ? d.content.kind === "estimate"
        ? "Estimativa inicial"
        : "Orçamento / proposta"
      : "Comprovante de agendamento",
    15,
  );
  gap();
  text(`Situação na emissão: ${d.status}`, 11);
  text(`Solicitação: ${d.request}`);
  text(
    `Referência: ${d.reference} | Versão: ${d.content.version ?? d.content.revision}`,
  );
  text(
    `Emitido em: ${at(d.issued_at)} (${d.company.timezone || "America/Recife"})`,
  );
  gap();
  const c = d.content;
  if (d.kind === "quote") {
    for (const item of c.items) {
      if (y < 120) newPage();
      text(`${item.quantity} × ${item.name}`, 11);
      text(
        `Valor unitário: ${item.price_mode === "from" ? "a partir de " : ""}${brl(item.unit_cents)} | Bruto: ${brl(item.gross_cents)}`,
      );
      if (item.discount_cents)
        text(`Desconto do item: ${brl(item.discount_cents)}`);
      if (item.note) text(item.note);
      gap();
    }
    if (c.subtotal_cents != null) text(`Subtotal: ${brl(c.subtotal_cents)}`);
    if (c.discount_cents)
      text(`Desconto informado na proposta: ${brl(c.discount_cents)}`);
    text(
      `${c.kind === "estimate" ? "Valor estimado" : "Total da proposta"}: ${c.price_mode === "from" ? "a partir de " : ""}${brl(c.total_cents)}`,
      14,
    );
    if (c.duration_minutes)
      text(`Duração prevista: ${c.duration_minutes} minutos`);
    if (c.expires_at) text(`Validade: ${at(c.expires_at)}`);
    if (c.customer_explanation) {
      gap();
      text("Orientações / condições informadas", 12);
      text(c.customer_explanation);
    }
    if (c.kind === "estimate") {
      gap();
      text("Esta estimativa não representa uma proposta final aprovada.");
    }
  } else {
    text(`Data e horário: ${at(c.starts_at)} até ${at(c.ends_at)}`, 12);
    for (const service of c.services || []) text(`Serviço: ${service}`);
    text(
      `Execução: ${{ scheduled: "agendada", in_progress: "em andamento", completed: "concluída" }[c.execution_state as string] || c.execution_state}`,
    );
    if (c.part_number) text(`Período: ${c.part_number}`);
    if (c.instructions) {
      gap();
      text("Orientações", 12);
      text(c.instructions);
    }
  }
  if (d.company.address) {
    gap();
    text(`Local cadastrado: ${d.company.address}`);
  }
  if (d.company.regions) text(`Região de atendimento: ${d.company.regions}`);
  gap();
  text("Não é nota fiscal, recibo financeiro ou comprovante de pagamento.");
  text(
    "Consulte a situação atual no acompanhamento da solicitação. Remarcações, cancelamentos e novas propostas podem substituir esta versão.",
  );
  for (const [i, p] of pdf.getPages().entries())
    p.drawText(`Página ${i + 1} de ${pdf.getPageCount()}`, {
      x: 44,
      y: 35,
      size: 8,
      font,
      color: ink,
    });
  return pdf.save();
}
