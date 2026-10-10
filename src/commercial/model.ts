export const states: Record<string, string> = {
  interested: "Novo interesse",
  requested: "Primeiro contato",
  awaiting_customer: "Orçamento aguardando resposta",
  negotiating: "Em negociação",
  responded: "Cliente respondeu",
  approved: "Aprovado · agendamento pendente",
  scheduled: "Agendado",
  converted: "Convertido",
  lost: "Perdido",
  refused: "Recusado",
  expired: "Expirado",
  cancelled: "Cancelado",
  no_response: "Sem resposta",
  ineligible: "Não elegível",
};
export const kinds: Record<string, string> = {
  first_contact: "Primeiro contato",
  quote_followup: "Retornar orçamento",
  abandoned: "Recuperar solicitação",
  approval_followup: "Acompanhar aprovação",
  requested_return: "Retorno solicitado",
};
export const taskStates: Record<string, string> = {
  pending: "Pendente",
  assigned: "Atribuída",
  in_progress: "Em execução",
  waiting_customer: "Aguardando cliente",
  rescheduled: "Reagendada",
  completed: "Concluída",
  cancelled: "Cancelada",
};
export const outcomes: Record<string, string> = {
  responded: "Cliente respondeu",
  awaiting_decision: "Aguardando decisão",
  return_later: "Pediu retorno depois",
  interested: "Interessado",
  no_response: "Sem resposta",
  refused: "Recusou",
  lost_interest: "Perdeu interesse",
  price: "Valor não aceito",
  competitor: "Escolheu concorrente",
  not_needed: "Serviço não necessário",
  invalid_contact: "Contato inválido",
  other: "Outro",
};
export const reasons: Record<string, string> = {
  price: "Preço",
  deadline: "Prazo",
  availability: "Disponibilidade",
  location: "Localização",
  withdrawal: "Desistência",
  competitor: "Concorrente",
  no_response: "Sem resposta após limite",
  not_offered: "Serviço não oferecido",
  invalid_contact: "Contato inválido",
  other: "Outro",
};
export const sources: Record<string, string> = {
  instagram: "Instagram",
  google: "Google",
  referral: "Indicação",
  whatsapp: "WhatsApp",
  direct: "Direto",
  other: "Outro",
};
export const events: Record<string, string> = {
  interest: "Interesse persistido",
  requested: "Solicitação enviada",
  quote_sent: "Proposta enviada",
  approved: "Orçamento aprovado",
  booked: "Agendamento confirmado",
  responded: "Cliente respondeu",
  converted: "Conversão confirmada",
  lost: "Perda registrada",
  refused: "Recusado",
  expired: "Proposta expirada",
  cancelled: "Cancelado",
  ineligible: "Contato inelegível",
  scheduled: "Retorno programado",
  assigned: "Tarefa assumida",
  transferred: "Responsabilidade transferida",
  started: "Tentativa iniciada",
  attempt: "Resultado registrado",
  rescheduled: "Tarefa atualizada",
  completed: "Tentativa concluída",
  task_cancelled: "Retorno interrompido",
  limit_reached: "Limite de tentativas atingido",
};
export const terminal = (s: string) =>
  [
    "converted",
    "lost",
    "refused",
    "expired",
    "cancelled",
    "no_response",
    "ineligible",
  ].includes(s);
export const date = (s: string, zone = "America/Recife") =>
  s
    ? new Date(s).toLocaleString("pt-BR", {
        timeZone: zone,
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Não definido";
export const money = (n: number | null) =>
  n == null
    ? "Sob consulta"
    : (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function errorMessage(e: any) {
  if (e?.code === "40001")
    return "A tarefa foi alterada. Atualize e revise antes de continuar.";
  if (e?.code === "42501")
    return "Ação não autorizada ou contato inelegível. Verifique vínculo, autonomia e consentimento.";
  if (e?.message === "commercial_outside_window")
    return "O retorno ainda não está no prazo ou está fora do horário de contato.";
  if (e?.code === "23514")
    return "Confira os limites e campos obrigatórios. Aprovação e agenda exigem eventos reais.";
  return "Não foi possível confirmar. Confira os dados e sua conexão.";
}
