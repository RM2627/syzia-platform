import type { Company, Service } from "./api";
export type RequestItem = {
  service: string;
  addons: string[];
  answers: Record<string, unknown>;
  notes: string;
};
export const emptyItem = (service: string): RequestItem => ({
  service,
  addons: [],
  answers: {},
  notes: "",
});
export function relationIssue(
  company: Company,
  selected: string[],
  candidate: string,
) {
  const name = (code: string) =>
    company.services.find((s) => s.code === code)?.name || "Serviço";
  const relations = company.relations || [];
  function includes(
    source: string,
    target: string,
    seen = new Set<string>(),
  ): boolean {
    if (seen.has(source)) return false;
    seen.add(source);
    return relations.some(
      (r) =>
        r.kind === "includes" &&
        r.source === source &&
        (r.target === target || includes(r.target, target, seen)),
    );
  }
  for (const code of selected) {
    if (includes(code, candidate))
      return `${name(candidate)} já está contemplado em ${name(code)}. Não é preciso adicioná-lo novamente.`;
    if (includes(candidate, code))
      return `${name(candidate)} inclui ${name(code)}. Remova ${name(code)} do pedido antes de adicionar ${name(candidate)}.`;
    if (
      relations.some(
        (r) =>
          r.kind === "incompatible" &&
          ((r.source === code && r.target === candidate) ||
            (r.target === code && r.source === candidate)),
      )
    )
      return `${name(candidate)} não pode ser combinado com ${name(code)}. Sua seleção foi mantida.`;
  }
  return "";
}
export function selectedPrices(services: Service[], selection: RequestItem[]) {
  return selection.flatMap((item) => {
    const s = services.find((x) => x.code === item.service);
    return s
      ? [s, ...s.addons.filter((a) => item.addons.includes(a.code))]
      : [];
  });
}
export function priceBreakdown(
  items: {
    price_mode: string;
    price_cents?: number | null;
    unit_cents?: number | null;
    quantity?: number;
  }[],
) {
  let fixed = 0,
    estimate = 0,
    pending = 0,
    fixedCount = 0,
    estimateCount = 0;
  for (const i of items) {
    const cents = i.price_cents !== undefined ? i.price_cents : i.unit_cents;
    if (i.price_mode === "quote" || cents == null) pending++;
    else if (i.price_mode === "from") {
      estimate += cents * (i.quantity || 1);
      estimateCount++;
    } else {
      fixed += cents * (i.quantity || 1);
      fixedCount++;
    }
  }
  return {
    fixed,
    estimate,
    pending,
    fixedCount,
    estimateCount,
    expected: pending ? null : fixed + estimate,
  };
}
