export const companyGroups = [
  {
    id: "operation",
    label: "Operação",
    icon: "calendar",
    items: [
      ["agenda", "Agenda"],
      ["clientes", "Clientes"],
      ["orcamentos", "Orçamentos"],
      ["atendimento", "Atendimento"],
      ["pendencias", "Pendências"],
    ],
  },
  {
    id: "management",
    label: "Gestão",
    icon: "chart",
    items: [
      ["comercial", "Comercial"],
      ["metricas", "Métricas"],
      ["financeiro", "Financeiro"],
      ["pagina", "Página da empresa"],
    ],
  },
  {
    id: "administration",
    label: "Administração",
    icon: "settings",
    items: [
      ["configuracao", "Configurações"],
      ["acessos", "Pessoas e acessos"],
      ["assinatura", "Plano e assinatura"],
    ],
  },
  {
    id: "help",
    label: "Ajuda e suporte",
    icon: "help",
    items: [
      ["ajuda", "Ajuda"],
      ["suporte", "Suporte SYZIA"],
    ],
  },
];
export function navigationSection(section: string) {
  const first = section.split("/")[0];
  if (
    [
      "manual",
      "servicos",
      "faq",
      "respostas",
      "regras",
      "autonomia",
      "prontidao",
      "legal",
    ].includes(first)
  )
    return "configuracao";
  if (first === "permissoes") return "acessos";
  if (first === "operacao") return "metricas";
  if (["novo-agendamento", "consumidor"].includes(first)) return "agenda";
  if (first === "novo-orcamento") return "orcamentos";
  return first;
}
export function navigationGroup(section: string) {
  return (
    companyGroups.find((g) =>
      g.items.some(([p]) => p === navigationSection(section)),
    )?.id || ""
  );
}
