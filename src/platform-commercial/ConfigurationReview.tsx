const labels: Record<string, string> = {
  legal_name: "Identificação pública",
  description: "Descrição",
  public_phone: "Telefone público",
  public_email: "E-mail público",
  public_address: "Endereço público",
  service_regions: "Regiões atendidas",
  payment_methods: "Formas de pagamento informadas",
  pricing_policy: "Política de preços",
  payment_policy: "Condições de pagamento",
  cancellation_policy: "Cancelamentos",
  rescheduling_policy: "Remarcações",
  service_policy: "Condições dos serviços",
  deadlines_policy: "Prazos",
  exception_policy: "Exceções",
  primary_color: "Cor principal",
  theme: "Tema",
  name: "Nome",
  title: "Título",
  body: "Orientação",
  question: "Pergunta",
  answer: "Resposta",
  notes: "Observações",
  availability: "Disponibilidade",
  photo_instructions: "Orientações para fotos",
  photo_policy: "Fotos",
  contract_mode: "Contratação",
  execution_mode: "Execução",
  label: "Campo",
  instruction: "Orientação",
  price_mode: "Modalidade de preço",
};
const values: Record<string, string> = {
  immediate: "Aceite direto",
  quote: "Sob avaliação",
  fixed: "Preço fixo",
  from: "A partir de",
  range: "Faixa de valores",
  continuous: "Contínua",
  split: "Em períodos",
  none: "Sem exigência",
  optional: "Opcional",
  required: "Obrigatório",
  light: "Claro",
  dark: "Escuro",
  system: "Conforme dispositivo",
};
const groups: [string, string][] = [
  ["company_settings", "Identificação e apresentação"],
  ["business_rules", "Regras e orientações"],
  ["services", "Serviços"],
  ["service_addons", "Adicionais"],
  ["service_intake_fields", "Informações solicitadas ao cliente"],
  ["service_checklist_items", "Checklists dos serviços"],
  ["faqs", "Perguntas frequentes"],
  ["quick_replies", "Respostas da equipe"],
  ["company_branding", "Identidade visual"],
  ["portfolio_items", "Portfólio"],
];
export function ConfigurationReview({ configuration }: { configuration: any }) {
  return (
    <div>
      {groups.map(([key, label]) => {
        const rows = configuration?.tables?.[key] || [];
        if (!rows.length) return null;
        return (
          <details key={key}>
            <summary>
              {label} ({rows.length})
            </summary>
            {rows.map((r: any, i: number) => (
              <article key={r.id || i}>
                {Object.entries(r)
                  .filter(([k, v]) => labels[k] && typeof v === "string" && v)
                  .map(([k, v]) => (
                    <p key={k}>
                      <strong>{labels[k]}: </strong>
                      {values[String(v)] || String(v)}
                    </p>
                  ))}
                {typeof r.price_cents === "number" && (
                  <p>
                    <strong>Valor: </strong>
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(r.price_cents / 100)}
                  </p>
                )}
                {r.duration_minutes && (
                  <p>Duração: {r.duration_minutes} minutos</p>
                )}
                {r.business_hours && (
                  <ul>
                    {r.business_hours.map((h: any, i: number) => (
                      <li key={i}>
                        {
                          [
                            "Domingo",
                            "Segunda",
                            "Terça",
                            "Quarta",
                            "Quinta",
                            "Sexta",
                            "Sábado",
                          ][h.day]
                        }
                        : {h.open}–{h.close}
                      </li>
                    ))}
                  </ul>
                )}
                {r.required !== undefined && (
                  <p>
                    {r.required
                      ? "Preenchimento obrigatório"
                      : "Preenchimento opcional"}
                  </p>
                )}
              </article>
            ))}
          </details>
        );
      })}
      <p>
        Imagens preparadas: {configuration?.tables?.company_media?.length || 0}.
        Confira também a apresentação visual no link da demonstração recebida.
        Se algo precisar de ajuste, solicite a revisão antes de aprovar.
      </p>
    </div>
  );
}
