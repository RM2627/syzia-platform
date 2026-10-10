export type Row = {
  id: string;
  organization_id: string;
  [key: string]: unknown;
};
export type Hours = { day: number; open: string; close: string }[];
export type Settings = Row & {
  revision: number;
  operational_revision: number;
  published_manual_id: string | null;
  human_enabled: boolean;
  faq_public_enabled: boolean;
  business_hours: Hours;
  human_hours: Hours;
};
export type Manual = Row & {
  version: number;
  title: string;
  status: "draft" | "published";
  published_at: string | null;
  source_revision: number | null;
  snapshot: {
    faqs: { question: string; answer: string }[];
    quick_replies: { title: string; body: string }[];
    services: Row[];
    addons: Row[];
    fields: Row[];
    settings: Record<string, unknown>;
    rules: Record<string, unknown>;
    permissions: Record<string, unknown>;
  } | null;
};
export type CompanyData = {
  editable: boolean;
  categories?: { id: string; name: string; active: boolean }[];
  settings: Settings | null;
  rules: Row | null;
  permissions: Row | null;
  services: Row[];
  addons: Row[];
  fields: Row[];
  manuals: Manual[];
  sections: Row[];
  faqs: Row[];
  replies: Row[];
  checklist: Record<string, boolean>;
};
export const sections: Record<string, string> = {
  business: "Empresa e atendimento",
  operation: "Operação",
  deadlines: "Prazos",
  payments: "Pagamentos",
  regions: "Regiões de atendimento",
  policies: "Políticas",
  cancellation: "Cancelamentos",
  rescheduling: "Remarcações",
  important: "Informações importantes",
  objections: "Dúvidas e objeções",
  exceptions: "Exceções",
};
export const ruleLabels: Record<string, string> = {
  pricing_policy: "Política de preços",
  payment_policy: "Condições de pagamento",
  cancellation_policy: "Cancelamento",
  rescheduling_policy: "Remarcação",
  service_policy: "Condições de execução do serviço",
  deadlines_policy: "Prazos e antecedência",
  exception_policy: "Quando encaminhar ao responsável",
};
export const actionLabels: Record<string, string> = {
  price_list: "Informar preço tabelado",
  price_range: "Informar faixa cadastrada e publicada",
  discount: "Aplicar desconto em preço ou orçamento",
  negotiate: "Explicar condições publicadas",
  schedule: "Agendar",
  reschedule: "Remarcar",
  cancel: "Cancelar",
  fit_in: "Buscar encaixe respeitando a capacidade",
  quote_create: "Criar orçamento tabelado",
  quote_send: "Enviar orçamento",
  quote_items: "Selecionar itens tabelados autorizados",
  follow_up: "Fazer acompanhamento",
  whatsapp: "Contatar via WhatsApp",
  aftercare: "Fazer pós-atendimento",
};
export const checklistLabels: Record<string, [string, string]> = {
  company: ["Descrição e regiões atendidas", "configuracao"],
  services: ["Pelo menos um serviço ativo", "servicos"],
  pricing: ["Política de preços", "regras"],
  hours: ["Horários da empresa e da equipe", "configuracao"],
  payments: ["Formas de pagamento", "configuracao"],
  faq: ["FAQ cadastrada", "faq"],
  replies: ["Respostas rápidas cadastradas", "respostas"],
  rules: ["Regras empresariais completas", "regras"],
  autonomy: ["Autonomia revisada pela empresa", "autonomia"],
  exception_contact: ["Responsável por exceções", "configuracao"],
  manual_sections: ["Tópicos completos no manual aprovado", "manual"],
  manual_published: ["Manual publicado e atualizado", "manual"],
  attendant: ["Atendente principal ativo e elegível", "acessos"],
};
export function priceLabel(row: Row) {
  if (row.price_mode === "quote") return "Sob consulta";
  const format = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const minimum = format.format(Number(row.price_cents) / 100);
  if (row.price_mode === "from" && row.price_max_cents != null)
    return `${minimum} a ${format.format(Number(row.price_max_cents) / 100)}`;
  return (row.price_mode === "from" ? "A partir de " : "") + minimum;
}
export function parseMoney(value: string) {
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(value.trim()))
    throw new Error("invalid_money");
  const [whole, decimal = ""] = value.trim().replace(",", ".").split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (cents > 100000000) throw new Error("invalid_money");
  return cents;
}
