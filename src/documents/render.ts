import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
export const brl = (v: number | null) =>
  v == null
    ? "Sob consulta"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(v / 100);
// Authorized canonical values only. This presentation never calculates or approves a quote.
export async function renderDocument(
  d: any,
  fontBytes: Uint8Array,
  logo?: Uint8Array,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const title =
    d.kind === "quote"
      ? d.content.kind === "estimate"
        ? "Estimativa inicial"
        : "Orçamento / proposta"
      : "Comprovante de agendamento";
  pdf.setTitle(`${title} - ${d.company.name}`);
  pdf.setAuthor(d.company.name);
  pdf.setCreationDate(new Date(d.issued_at));
  const color = /^#[\da-f]{6}$/i.test(d.branding?.primary_color || "")
    ? d.branding.primary_color
    : "#186b6a";
  const accent = rgb(
    ...([1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255) as [
      number,
      number,
      number,
    ]),
  );
  const ink = rgb(0.09, 0.15, 0.21),
    muted = rgb(0.34, 0.4, 0.45),
    light = rgb(0.95, 0.97, 0.98);
  const clean = (v: unknown) =>
    String(v ?? "")
      .normalize("NFC")
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
  const lines = (v: unknown, size = 10, width = 499) => {
    const out: string[] = [];
    for (const p of clean(v).split(/\r?\n/)) {
      let line = "";
      for (const word of p.split(/\s+/)) {
        const value = line + (line ? " " : "") + word;
        if (font.widthOfTextAtSize(value, size) <= width) {
          line = value;
          continue;
        }
        if (line) out.push(line);
        line = "";
        for (const ch of word) {
          if (font.widthOfTextAtSize(line + ch, size) > width) {
            out.push(line);
            line = "";
          }
          line += ch;
        }
      }
      out.push(line);
    }
    return out;
  };
  let page: PDFPage,
    y = 0;
  function next() {
    page = pdf.addPage([595.28, 841.89]);
    page.drawRectangle({
      x: 0,
      y: 831.89,
      width: 595.28,
      height: 10,
      color: accent,
    });
    y = 791;
  }
  function ensure(h: number) {
    if (y - h < 66) next();
  }
  function text(v: unknown, size = 10, color = ink) {
    for (const row of lines(v, size)) {
      ensure(size * 1.55);
      page.drawText(row, { x: 48, y, size, font, color });
      y -= size * 1.55;
    }
  }
  function gap(n = 12) {
    y -= n;
  }
  function label(v: string) {
    ensure(70);
    gap();
    text(v.toLocaleUpperCase("pt-BR"), 9, muted);
    gap(4);
  }
  const at = (v: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: d.company.timezone || "America/Recife",
    }).format(new Date(v));
  next();
  if (logo) {
    try {
      const im = await pdf.embedPng(logo).catch(() => pdf.embedJpg(logo));
      const size = im.scale(Math.min(148 / im.width, 52 / im.height));
      page!.drawImage(im, { x: 48, y: y - size.height, ...size });
      y -= size.height + 20;
    } catch {
      /* Text identity remains available. */
    }
  }
  text(d.company.name, 21);
  gap(4);
  text(title, 17);
  gap(16);
  const status = lines(`Situação na emissão: ${d.status}`, 11);
  ensure(status.length * 18 + 24);
  page!.drawRectangle({
    x: 40,
    y: y - status.length * 18 - 5,
    width: 515,
    height: status.length * 18 + 18,
    color: light,
  });
  for (const row of status) {
    page!.drawText(row, { x: 48, y: y - 3, size: 11, font, color: ink });
    y -= 18;
  }
  gap(20);
  text(
    `Referência: ${d.reference} · Versão ${d.content.version ?? d.content.revision}`,
    9,
    muted,
  );
  text(`Solicitação: ${d.request}`, 9, muted);
  text(
    `Emitido em ${at(d.issued_at)} · ${d.company.timezone || "America/Recife"}`,
    9,
    muted,
  );
  if (d.customer?.name) {
    label("Cliente");
    text(d.customer.name, 12);
  }
  const c = d.content;
  if (d.kind === "quote") {
    label("Serviços e composição");
    const tableHead = () => {
      ensure(42);
      page!.drawRectangle({
        x: 40,
        y: y - 6,
        width: 515,
        height: 25,
        color: light,
      });
      page!.drawText("ITEM / DESCRIÇÃO", {
        x: 48,
        y,
        size: 9,
        font,
        color: muted,
      });
      page!.drawText("QTD.", { x: 345, y, size: 9, font, color: muted });
      page!.drawText("UNITÁRIO", { x: 395, y, size: 9, font, color: muted });
      page!.drawText("BRUTO", { x: 496, y, size: 9, font, color: muted });
      y -= 30;
    };
    gap(12);
    tableHead();
    for (const item of c.items || []) {
      const name = lines(item.name, 10, 280),
        note = item.note ? lines(item.note, 9, 499) : [];
      if (y - Math.min(180, name.length * 16 + 35) < 66) {
        next();
        tableHead();
      }
      const money = (v: unknown, x: number, w: number) => {
        let size = 9;
        while (size > 6 && font.widthOfTextAtSize(clean(v), size) > w)
          size -= 0.25;
        for (const [i, row] of lines(v, size, w).entries()) {
          page!.drawText(row, {
            x,
            y: y - i * size * 1.2,
            size,
            font,
            color: ink,
          });
        }
      };
      money(item.quantity, 345, 40);
      money(brl(item.unit_cents), 392, 83);
      money(brl(item.gross_cents), 487, 65);
      for (const row of name) {
        ensure(17);
        page!.drawText(row, { x: 48, y, size: 10, font, color: ink });
        y -= 16;
      }
      if (item.price_mode === "from")
        text("Valor unitário a partir do indicado.", 9, muted);
      if (item.discount_cents)
        text(`Desconto do item: ${brl(item.discount_cents)}`, 9, muted);
      for (const row of note) {
        ensure(15);
        page!.drawText(row, { x: 48, y, size: 9, font, color: muted });
        y -= 14;
      }
      gap(10);
      ensure(5);
      page!.drawLine({
        start: { x: 48, y },
        end: { x: 547, y },
        thickness: 0.5,
        color: light,
      });
      gap(14);
    }
    ensure(110);
    label("Resumo de valores");
    if (c.subtotal_cents != null) text(`Subtotal: ${brl(c.subtotal_cents)}`);
    if (c.discount_cents)
      text(`Desconto da proposta: ${brl(c.discount_cents)}`);
    text(
      `${c.kind === "estimate" ? "Valor estimado" : "Total da proposta"}: ${c.price_mode === "from" ? "a partir de " : ""}${brl(c.total_cents)}`,
      16,
    );
    if (c.duration_minutes)
      text(`Duração prevista: ${c.duration_minutes} minutos`);
    if (c.expires_at) text(`Validade: ${at(c.expires_at)}`);
    if (c.customer_explanation) {
      label("Orientações e condições");
      text(c.customer_explanation);
    }
    if (c.kind === "estimate") {
      gap();
      text("Esta estimativa não representa uma proposta final aprovada.", 10);
    }
  } else {
    label("Seu agendamento");
    text(at(c.starts_at), 20);
    text(`Até ${at(c.ends_at)}`, 12);
    const duration =
      (new Date(c.ends_at).getTime() - new Date(c.starts_at).getTime()) / 60000;
    if (Number.isFinite(duration) && duration > 0)
      text(`Duração: ${duration} minutos`, 11);
    label("Serviços");
    for (const service of c.services || []) text(service, 12);
    if (c.professional) text(`Profissional: ${c.professional}`);
    text(
      `Execução: ${{ scheduled: "agendada", in_progress: "em andamento", completed: "concluída" }[c.execution_state as string] || c.execution_state}`,
    );
    if (c.part_number) text(`Período: ${c.part_number}`);
    if (c.instructions) {
      label("Orientações");
      text(c.instructions);
    }
  }
  if (d.company.address || d.company.regions) {
    label("Informações do estabelecimento");
    if (d.company.address) text(d.company.address);
    if (d.company.regions) text(`Região de atendimento: ${d.company.regions}`);
  }
  ensure(90);
  label("Sobre este documento");
  text(
    "Não é nota fiscal, recibo financeiro ou comprovante de pagamento.",
    9,
    muted,
  );
  text(
    "Consulte a situação atual no acompanhamento da solicitação. Remarcações, cancelamentos e novas propostas podem substituir esta versão.",
    9,
    muted,
  );
  for (const [i, p] of pdf.getPages().entries()) {
    p.drawLine({
      start: { x: 48, y: 49 },
      end: { x: 547, y: 49 },
      thickness: 0.5,
      color: muted,
    });
    p.drawText(title, { x: 48, y: 32, size: 8, font, color: muted });
    p.drawText(`${i + 1} / ${pdf.getPageCount()}`, {
      x: 509,
      y: 32,
      size: 8,
      font,
      color: muted,
    });
  }
  return pdf.save();
}
