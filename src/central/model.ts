export const states: Record<string, string> = {
  queued: "Na fila",
  active: "Em atendimento",
  waiting_customer: "Aguardando cliente",
  waiting_company: "Aguardando empresa",
  waiting_internal: "Ação interna",
  resolved: "Resolvido",
  closed: "Encerrado",
};
export const actions: Record<string, string> = {
  review: "Revisar solicitação",
  reply: "Responder cliente",
  quote: "Preparar orçamento",
  schedule: "Organizar agenda",
  company: "Decisão da empresa",
  customer: "Resposta do cliente",
  follow_up: "Retorno necessário",
  none: "Sem pendência",
};
export const events: Record<string, string> = {
  created: "Atendimento aberto",
  assigned: "Atendimento assumido",
  transferred: "Responsável alterado",
  returned: "Devolvido à fila",
  message: "Mensagem registrada",
  note: "Nota interna registrada",
  state: "Estado atualizado",
  escalated: "Encaminhado à empresa",
  company_replied: "Empresa respondeu",
  quote: "Proposta enviada",
  booking: "Agenda atualizada",
  resolved: "Atendimento resolvido",
  reopened: "Atendimento reaberto",
  closed: "Atendimento encerrado",
  priority: "Prioridade alterada",
  next_action: "Próxima ação definida",
};
export const money = (n: number | null) =>
  n === null
    ? "Sob consulta"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(n / 100);
export const date = (s: string) =>
  new Date(s).toLocaleString("pt-BR", {
    timeZone: "America/Recife",
    dateStyle: "short",
    timeStyle: "short",
  });
export function waitTime(s: string) {
  const n = Math.max(
    0,
    Math.floor((Date.now() - new Date(s).getTime()) / 60000),
  );
  return n < 60 ? `${n} min` : `${Math.floor(n / 60)}h ${n % 60}min`;
}
export function centralError(e: any) {
  const reason = e?.message || e?.code;
  const assisted: Record<string, string> = {
    assisted_outside_hours:
      "O apoio compartilhado está desativado ou fora do horário programado. O atendimento permanece registrado.",
    assisted_presence_required:
      "O integrante da Equipe SYZIA precisa estar Disponível na Central para assumir ou receber um novo atendimento.",
    assisted_limit_reached:
      "Limite compartilhado atingido neste ciclo. A própria empresa pode continuar atendendo.",
    assisted_unconfigured:
      "O limite do atendimento compartilhado ainda precisa ser configurado pelo Super Admin.",
    assisted_cycle_required:
      "O ciclo do atendimento compartilhado precisa ser configurado pelo Super Admin.",
    professional_unavailable:
      "Este profissional não está disponível durante todo o período selecionado.",
    professional_conflict:
      "O profissional já possui uma reserva neste período.",
  };
  if (assisted[reason]) return assisted[reason];
  if (reason === "central_claim_permission_required")
    return "Você não possui permissão para assumir atendimentos desta empresa. Peça ao administrador para revisar suas permissões.";
  if (reason === "central_presence_required")
    return "Altere sua disponibilidade para Disponível antes de assumir o atendimento.";
  if (reason === "human_support_required")
    return "O plano atual da empresa não inclui atendimento compartilhado SYZIA.";
  if (reason === "central_invalid_recipient")
    return "Esta pessoa não está autorizada a receber o atendimento nesta empresa.";
  if (e?.code === "40001")
    return "Este atendimento foi alterado. Atualize e revise antes de tentar novamente.";
  if (e?.code === "42501")
    return "Ação não autorizada. Confira seu vínculo, responsabilidade e autonomia; encaminhe à empresa quando necessário.";
  if (e?.code === "23P01")
    return "Horário ocupado. Escolha outro; a reserva anterior foi preservada.";
  if (e?.message === "central_message_limit")
    return "Aguarde um minuto antes de enviar mais mensagens.";
  if (e?.message === "central_price_review_required")
    return "Este preço precisa ser definido ou revisado pela empresa. Encaminhe a decisão.";
  if (e?.message === "price_mismatch")
    return "O valor foi atualizado. Revise o orçamento.";
  return "Não foi possível concluir. Revise os dados e a conexão. Nenhuma confirmação deve ser presumida.";
}
