import { demoBuild, demoCompanyClient, demoRPC } from "./demo/transport";
import { createClient } from "@supabase/supabase-js";
export type Status = "active" | "suspended";
export type Profile = { id: string; display_name: string; status: Status };
export type Organization = {
  id: string;
  name: string;
  slug: string;
  status: Status;
};
export type Member = {
  organization_id: string;
  user_id: string;
  role: "admin_empresa" | "colaborador_empresa";
  is_attendant?: boolean;
  status: Status;
};
export type Attendant = {
  organization_id: string;
  user_id: string;
  kind: "primary" | "backup";
  status: Status;
};
export type Role = {
  user_id: string;
  role: "super_admin" | "atendente";
  active: boolean;
};
export type Audit = {
  id: number;
  actor_id: string | null;
  organization_id: string | null;
  entity_table: string;
  action: string;
  changed_fields: string[];
  created_at: string;
};
export type Access = {
  identity?: { kind: string; permissions: string[] };
  profile: Profile;
  roles: string[];
  organizations: Organization[];
  memberships: Member[];
};
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
function configValid() {
  if (
    !url ||
    !key ||
    url.includes("YOUR-PROJECT") ||
    key.includes("REPLACE_ME") ||
    key.startsWith("sb_secret_")
  )
    return false;
  try {
    const u = new URL(url);
    if (
      u.protocol !== "https:" &&
      !(
        ["localhost", "127.0.0.1"].includes(u.hostname) &&
        u.protocol === "http:"
      )
    )
      return false;
    if (key.startsWith("sb_publishable_")) return true;
    const claims = JSON.parse(
      atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return claims.role === "anon";
  } catch {
    return false;
  }
}
export const configured = demoBuild || configValid();
export const supabase = demoBuild ? demoCompanyClient : configured
  ? createClient(url, key, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        // Password routes validate their own callback after explicit recipient confirmation.
        // Avoid auto-consumption and never confuse a stored session with a fresh email proof.
        detectSessionInUrl: !["/aceitar-convite", "/atualizar-senha"].includes(
          window.location.pathname,
        ),
      },
    })
  : null;
export async function rpc<T = void>(
  name: string,
  params?: Record<string, unknown>,
): Promise<T> {
  if (demoBuild) return demoRPC<T>("company", name, params);
  if (!supabase) throw new Error("backend_unavailable");
  const { data, error } = await supabase.rpc(name, params);
  if (error) {
    if (
      import.meta.env.DEV ||
      import.meta.env.VITE_AUTH_DIAGNOSTICS === "true"
    ) {
      const org =
        typeof params?.p_org === "string" &&
        /^[a-f0-9-]{36}$/.test(params.p_org)
          ? params.p_org
          : null;
      console.warn("SYZIA diagnostic", {
        operation: name,
        organization: org,
        category: error.code === "42501" ? "authorization" : "operation",
        reason: Object.hasOwn(messages, error.message)
          ? error.message
          : "unclassified",
        status: error.code,
      });
    }
    throw Object.assign(error, { operation: name });
  }
  return data as T;
}
export async function rows<T>(table: string, org?: string): Promise<T[]> {
  if (!supabase) throw new Error("backend_unavailable");
  let q = supabase.from(table).select("*");
  if (org) q = q.eq("organization_id", org);
  if (table === "audit_logs") q = q.order("id", { ascending: false });
  else
    q = q.order(
      table === "profiles"
        ? "id"
        : table === "platform_roles"
          ? "user_id"
          : "created_at",
    );
  // Minimal admin page paginates all scoped data instead of silently losing records.
  const all: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await q.range(offset, offset + 99);
    if (error) throw error;
    all.push(...(data as T[]));
    if (data.length < 100) break;
    if (table === "audit_logs") break;
  }
  return all;
}
const messages: Record<string, string> = {
  company_quote_permission_required:
    "Somente a equipe própria autorizada pode definir valores desta proposta.",
  company_decision_required:
    "Esta decisão precisa ser feita pela equipe própria ou pelo administrador.",
  invalid_quote_item:
    "Confira descrição, quantidade, valor, desconto e duração dos itens.",
  invalid_quote_duration: "Informe uma duração final válida para a proposta.",
  invalid_discount: "Confira o desconto informado.",
  quote_duration_too_short:
    "A duração não pode ser menor que a definida para esse item do catálogo.",
  addon_not_applicable:
    "Esse adicional pertence a um serviço que não está na proposta.",
  invalid_question_condition:
    "Escolha uma pergunta de sim/não ou escolha do mesmo serviço, sem outra condição.",
  invalid_photo_request:
    "Escreva a orientação para as fotos e confira a etapa do pedido.",

  selfservice_consent_required:
    "Confirme as condições apresentadas para continuar.",
  selfservice_payment_required:
    "Valide uma forma de pagamento antes de ativar o trial.",
  selfservice_quote_expired:
    "Atualize os dados e o plano para rever as condições.",
  trial_already_used:
    "O período gratuito já foi utilizado. Consulte as opções de contratação para continuar.",
  homologation_trial_unavailable:
    "Encerre a homologação antes de iniciar um período gratuito.",
  homologation_conflict:
    "O plano de homologação foi alterado. Atualize a página antes de continuar.",
  homologation_invalid:
    "Selecione uma empresa ativa e informe o motivo com pelo menos 10 caracteres.",
  featured_plan_changed:
    "O destaque foi alterado por outra pessoa. Atualize os planos e tente novamente.",
  featured_plan_invalid:
    "Selecione um plano público disponível e informe um texto válido para o selo.",
  platform_staff_requires_assignment:
    "A equipe SYZIA deve receber uma atribuição de atendimento, sem vínculo de colaborador da empresa.",
  human_support_required:
    "O plano desta empresa não inclui atendimento compartilhado SYZIA.",
  trial_review_required: "Sua elegibilidade precisa de análise pela SYZIA.",
  recurrence_schedule_fixed:
    "Para mudar a frequência ou data inicial, encerre a recorrência e crie outra.",
  permission_denied:
    "Esta ação não está liberada para seu acesso ou para o plano atual da empresa.",
  permission_role_ceiling:
    "A permissão solicitada ultrapassa os limites desta função.",
  permission_revision_conflict:
    "As permissões foram alteradas por outra pessoa. Recarregue antes de salvar.",
  session_expired: "Sua sessão expirou ou foi encerrada. Entre novamente.",
  account_inactive:
    "Seu acesso de usuário está inativo. Consulte a administração responsável.",
  organization_suspended:
    "A empresa está suspensa. Consulte a Administração SYZIA.",
  document_invalid: "Confira o CPF ou CNPJ e seus dígitos verificadores.",
  verification_review_required:
    "A alteração deste documento precisa de revisão da Administração SYZIA.",
  verification_revision_conflict:
    "O cadastro mudou. Recarregue a verificação antes de continuar.",
  shared_support_plan_required:
    "O plano atual não inclui atendimento compartilhado. Ative uma capacidade compatível antes de atribuir a equipe.",
  exemption_no_subscription:
    "Esta empresa possui condição interna/isenta e está fora do ciclo de assinatura.",
  financial_receipt_invalid:
    "Confira o valor e a data. O recebimento deve ser positivo, não pode ser futuro nem superar o saldo pendente.",
  financial_reason_required: "Informe um motivo com pelo menos 10 caracteres.",
  financial_reverse_before_cancel:
    "Estorne os recebimentos antes de cancelar esta conta.",
  financial_revision_conflict:
    "A cobrança foi alterada. Recarregue antes de salvar.",
  category_in_use:
    "Esta categoria está vinculada a serviços. Desative-a ou altere os vínculos antes de excluir.",
  category_revision_conflict: "A categoria mudou. Recarregue antes de salvar.",
  service_category_unavailable: "Escolha uma categoria ativa desta empresa.",
  booking_duration_too_short:
    "Reserve pelo menos a duração prevista para o serviço e seus adicionais.",
  guide_revision_conflict:
    "O tutorial foi atualizado em outra aba. O progresso salvo foi recarregado.",
  invitation_delivery_unavailable:
    "O envio de convites ainda não foi configurado. O convite foi preservado; contate a administração da plataforma.",
  invitation_not_sent:
    "Não foi possível enviar o e-mail. O convite permanece salvo; confira a situação e tente novamente mais tarde.",
  invitation_unavailable:
    "Este convite não está disponível para esta conta. Solicite novas instruções à empresa.",
  invitation_member_exists:
    "Essa pessoa já tem vínculo com a empresa. Gerencie o acesso existente.",
  invitation_rate_limit: "Aguarde antes de reenviar as instruções.",
  invitation_invalid:
    "O pedido de envio está incompleto. Atualize a tela e tente novamente.",
  invitation_not_available:
    "Este convite não está disponível para envio ou seu acesso mudou. Atualize a lista e confira a autorização.",
  invitation_expired:
    "O convite da empresa expirou. Ele não pode ser recuperado por reenvio; um gestor autorizado precisa emitir outro convite.",
  invitation_revoked: "Este convite foi revogado e não pode ser reenviado.",
  invitation_cooldown:
    "Aguarde pelo menos um minuto após a última tentativa antes de reenviar. Nenhuma nova instrução foi enviada nesta tentativa.",
  invitation_attempt_limit:
    "Este convite atingiu o limite de cinco tentativas. Peça à administração que revise a entrega; o reenvio não foi realizado.",
  invitation_rate_limited:
    "O serviço de autenticação limitou os envios. Aguarde e tente mais tarde; trocar o e-mail não contorna o limite do projeto.",
  email_recipient_not_authorized:
    "O serviço de e-mail não autoriza esse destinatário. Peça à administração para verificar as restrições do SMTP padrão e configurar SMTP personalizado.",
  email_delivery_failed:
    "O serviço não conseguiu enviar o convite. Ele continua salvo. A administração deve conferir os logs de Auth e a configuração de e-mail antes de tentar novamente.",
  recovery_delivery_failed:
    "Não foi possível enviar as novas instruções de acesso. O convite continua salvo. A administração deve conferir os logs de Auth e a configuração de e-mail.",
  temporary_delivery_failure:
    "Não foi possível confirmar o envio por uma falha temporária. O convite foi preservado; confira a situação antes de tentar novamente.",
  invitation_delivery_unconfirmed:
    "O envio pode ter ocorrido, mas sua confirmação não pôde ser registrada. Verifique a mensagem mais recente e atualize a lista antes de reenviar.",
  guide_invalid_transition:
    "Esta etapa já mudou. Recarregue o tutorial e continue.",
  appointment_revision_conflict:
    "Este agendamento foi atualizado. Reabra a ficha para conferir os dados atuais.",
  booking_requires_approved_quote:
    "O consumidor precisa aprovar a proposta antes de reservar este atendimento.",
  booking_already_exists:
    "Esta solicitação já possui uma reserva. Abra a Agenda para conferir.",
  execution_part_order_conflict:
    "Este horário alteraria a ordem das etapas do atendimento. Use Replanejar atendimento para reorganizar todos os períodos.",
  appointment_duration_unavailable:
    "A duração original desta reserva antiga não pôde ser confirmada. Use Replanejar atendimento para revisar o serviço e os períodos.",
  professional_unavailable:
    "Este profissional não está disponível durante todo o período selecionado.",
  professional_conflict:
    "Este profissional já possui um atendimento neste período.",
  availability_company_closed:
    "A empresa está fechada em parte do período selecionado.",
  availability_member_denied:
    "Esta pessoa não é um funcionário ativo desta empresa.",
  availability_invalid:
    "Revise os horários: use intervalos completos, sem sobreposição, e um fuso válido.",
  availability_revision_conflict:
    "A configuração foi atualizada. Reabra a tela antes de salvar.",
  responsible_replan_review_required:
    "O novo plano remove um período com responsável. Revise explicitamente a atribuição antes de replanejar.",
  assisted_outside_hours:
    "O apoio compartilhado está desativado ou fora do horário programado. O atendimento permanece registrado.",
  assisted_presence_required:
    "O integrante da Equipe SYZIA precisa estar Disponível na Central para assumir ou receber um novo atendimento.",
  assisted_unconfigured:
    "O limite do Assistido SYZIA ainda está pendente de configuração pelo Super Admin.",
  assisted_cycle_required:
    "O ciclo do atendimento compartilhado ainda precisa ser configurado.",
  assisted_limit_reached:
    "O limite compartilhado deste ciclo foi atingido. A própria empresa pode continuar atendendo.",
  slot_unavailable:
    "Este horário está indisponível. Escolha outro; sua reserva anterior foi preservada.",
  service_already_started:
    "Este serviço já começou. O horário e o histórico não podem mais ser alterados.",
  invalid_service_transition:
    "Confira o estado do serviço. Só é possível iniciar próximo ao horário e concluir após o início.",
  notice_required:
    "Confirme a finalidade de uso dos dados com o cliente antes de salvar.",

  trial_verification_required:
    "Confirme a verificação e preencha referência e motivo válidos.",
  trial_identifier_invalid:
    "Use PAÍS:TIPO:IDENTIFICADOR ou telefone no formato internacional, conforme o tipo.",
  trial_request_invalid:
    "A solicitação já foi decidida ou não está disponível. Atualize antes de analisar.",
  trial_override_required:
    "Esta concessão exige confirmação explícita de uma exceção administrativa legítima.",
  trial_days_invalid:
    "Informe um prazo dentro da política e confirme a extensão administrativa.",
  billing_trial_unavailable:
    "O período gratuito não está disponível para este plano.",
  billing_limit_reached:
    "O limite do plano foi atingido. Consulte Plano e utilização para ampliar o plano ou liberar capacidade.",
  billing_subscription_required:
    "A assinatura precisa ser regularizada para iniciar novas operações. O histórico permanece disponível.",
  billing_feature_unavailable: "Este recurso não faz parte do plano atual.",
  billing_revision_conflict:
    "A assinatura ou oferta mudou. Atualize e revise a alteração.",
  billing_invoice_pending:
    "Há uma cobrança pendente. Conclua ou cancele antes de outra alteração.",
  billing_plan_inconsistent:
    "As atribuições do plano estão inconsistentes. Revise os recursos e a disponibilidade comercial.",
  billing_provider_not_configured:
    "A cobrança aguarda integração. Você pode continuar configurando os planos.",
  billing_mock_disabled:
    "A simulação de pagamento está desabilitada neste ambiente. Nenhuma cobrança real está integrada.",
  billing_renewal_required:
    "Este período terminou. Selecione um plano para preparar uma nova vigência.",
  billing_transition_invalid:
    "Esta ação não está disponível na situação atual. Atualize a assinatura.",
  billing_plan_unavailable:
    "Este plano não está disponível para adesão. Atualize as ofertas.",
  billing_key_conflict:
    "Esta tentativa já foi registrada com outros dados. Recarregue e revise a ação.",
  company_revision_conflict:
    "Outra alteração foi salva. Recarregue os dados e revise antes de tentar novamente.",
  company_not_ready_to_publish:
    "Complete os tópicos e as informações exigidas para publicar esta versão do Manual. Isso não impede a publicação da página ou a operação da equipe própria.",
  company_not_ready_for_human:
    "A empresa ainda não atende a todos os requisitos de prontidão para atendimento humano.",
  company_published_manual_required:
    "Publique uma versão do manual antes de habilitar a FAQ pública.",
  published_manual_immutable:
    "Versões publicadas são imutáveis. Crie um novo rascunho.",
  invalid_company_fields:
    "O formulário contém campos inválidos. Recarregue os dados.",
  company_target_not_found:
    "Este registro não está disponível na empresa selecionada.",
  support_invalid_request:
    "Informe o motivo com 15 a 500 caracteres e a duração do suporte.",
  support_not_required:
    "Esta empresa continua sob gestão da SYZIA. Abra o ambiente diretamente.",
  support_rate_limited:
    "Limite de solicitações atingido. Aguarde antes de tentar novamente.",
  support_pending: "Já existe uma solicitação aguardando o ADM.",
  support_already_decided:
    "Esta solicitação já foi decidida. Atualize para consultar o estado atual.",
  access_denied:
    "Esta operação não foi autorizada. Confira as permissões desta ação.",
  cannot_change_own_membership: "Você não pode alterar seu próprio vínculo.",
  cannot_change_own_global_role:
    "Você não pode alterar seu próprio papel global.",
  cannot_suspend_self: "Você não pode suspender sua própria conta.",
  last_organization_admin:
    "Mantenha outro administrador ativo antes de remover este.",
  attendant_role_required:
    "Conceda primeiro o papel de atendente para esta pessoa.",
  user_not_eligible: "A pessoa precisa ter e-mail confirmado e conta ativa.",
  direct_booking_already_confirmed:
    "Este pedido já possui contratação direta e horário confirmado.",
  execution_plan_changed:
    "A disponibilidade de um dos períodos mudou. Consulte novamente; nenhum período foi reservado.",
  shared_identity_requires_superadmin:
    "A identidade global da equipe SYZIA é administrada pelo Super Admin. Ajuste somente as permissões nesta empresa.",
  quote_explanation_required:
    "Explique ao cliente os valores e as condições da proposta.",
  invalid_name: "Informe um nome entre 2 e 120 caracteres.",
};
export function errorMessage(e: unknown) {
  const x = e as { message?: string; code?: string };
  if (x.message && messages[x.message]) return messages[x.message];
  if (x.code === "42501")
    return "Você não tem permissão para esta ação. Atualize seu acesso.";
  if (x.code === "23505")
    return "Já existe um registro com estes dados, ou um atendente principal ativo.";
  if (x.code === "23514" || x.code === "22023")
    return "Confira os dados e os limites deste cadastro.";
  if (x.code === "23503") return "O usuário ou a empresa informada não existe.";
  if (
    /failed to fetch|fetch failed|networkerror|network request failed|offline/i.test(
      x.message || "",
    )
  )
    return "Não foi possível conectar. Verifique a conexão e tente novamente.";
  return "Não foi possível concluir a operação. Tente novamente; se persistir, informe o responsável pela plataforma.";
}
