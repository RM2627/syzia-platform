import { readFile, mkdir, writeFile } from "node:fs/promises";
import { renderDocument } from "../../src/documents/render.ts";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
const destination = process.argv[2] || "output/pdf";
await mkdir(destination, { recursive: true });
const base = {
  customer: { name: "Pessoa demonstrativa" },
  company: {
    name: "Ateliê Aurora",
    timezone: "America/Sao_Paulo",
    address: "Endereço ilustrativo — ambiente local",
    regions: "Região ilustrativa",
  },
  branding: { primary_color: "#185f60" },
  issued_at: "2026-10-25T13:30:00Z",
  request: "SOL-ILUSTRATIVA-001",
  reference: "DOC-ILUSTRATIVO-001",
};
const item = {
  name: "Planejamento de ambientes",
  quantity: 1,
  unit_cents: 18000,
  gross_cents: 18000,
  discount_cents: 0,
  price_mode: "fixed",
  note: "Conversa inicial e orientações para organizar o ambiente.",
};
const samples = [
  [
    "agendamento",
    {
      ...base,
      kind: "appointment",
      status: "Confirmado",
      content: {
        revision: 2,
        starts_at: "2026-11-03T13:00:00Z",
        ends_at: "2026-11-03T14:30:00Z",
        services: ["Planejamento de ambientes"],
        execution_state: "scheduled",
        instructions:
          "Tenha em mãos as medidas do ambiente e as referências que deseja compartilhar.",
      },
    },
  ],
  [
    "orcamento-simples",
    {
      ...base,
      kind: "quote",
      status: "Proposta enviada",
      content: {
        kind: "final",
        version: 1,
        items: [item],
        price_mode: "fixed",
        subtotal_cents: 18000,
        total_cents: 18000,
        duration_minutes: 90,
        expires_at: "2026-11-01T23:59:00Z",
        customer_explanation:
          "Valores demonstrativos. A execução depende do aceite das condições.",
      },
    },
  ],
  [
    "orcamento-longo",
    {
      ...base,
      kind: "quote",
      status: "Proposta enviada",
      content: {
        kind: "final",
        version: 3,
        items: Array.from({ length: 18 }, (_, i) => ({
          ...item,
          name: `${i + 1}. Organização e apresentação — avaliação de ambientes e referências visuais`,
          note: "Descrição ilustrativa detalhada: avaliação do espaço, referências, orientações e revisão das condições. ".repeat(
            4,
          ),
        })),
        price_mode: "fixed",
        subtotal_cents: 324000,
        discount_cents: 24000,
        total_cents: 300000,
        expires_at: "2026-11-05T23:59:00Z",
        customer_explanation:
          "Condições demonstrativas; não constitui nota fiscal nem recibo. ".repeat(
            12,
          ),
      },
    },
  ],
];
const font = await readFile("public/fonts/DejaVuSans.ttf"),
  logo = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="100"><rect rx="18" width="100" height="100" fill="#185f60"/><text x="22" y="73" font-family="DejaVu Sans" font-size="68" fill="white">A</text><text x="120" y="66" font-family="DejaVu Sans" font-size="44" fill="#185f60">AURORA</text></svg>',
    ),
  )
    .png()
    .toBuffer();
for (const [name, d] of samples) {
  const bytes = await renderDocument(
    d,
    font,
    name === "orcamento-simples" ? undefined : logo,
  );
  await writeFile(destination + "/" + name + ".pdf", bytes);
  const pdf = await PDFDocument.load(bytes);
  console.log(name + ": " + pdf.getPageCount() + " páginas");
}
