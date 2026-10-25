import { supabase } from "../api";
export async function commercialApi<T = any>(path: string, body: unknown) {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (!token) throw Error("session_required");
  const root =
    import.meta.env.VITE_COMMERCIAL_API_URL ||
    import.meta.env.VITE_PLATFORM_API_URL ||
    "";
  if (!root) throw Error("commercial_unavailable");
  const r = await fetch(root + "/commercial/" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(body),
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "commercial_operation_failed");
  return data;
}
export async function invitationApi(path: string, body: unknown) {
  const root =
    import.meta.env.VITE_COMMERCIAL_API_URL ||
    import.meta.env.VITE_PLATFORM_API_URL ||
    "";
  if (!root) throw Error("commercial_unavailable");
  const r = await fetch(root + "/demonstrations/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "commercial_operation_failed");
  return data;
}
export const commercialError = (e: unknown) =>
  (
    ({
      commercial_studio_locked: "Esta preparação já foi aprovada. Continue em Demonstrações ou duplique para preparar outra versão.",
      commercial_storage_unavailable: "Não foi possível acessar as imagens. O rascunho foi preservado; tente novamente.",
      commercial_media_invalid: "Imagem inválida. Envie JPG, PNG ou WebP de até 5 MB.",
      commercial_export_too_large: "Esta página excede o limite de captura. Exporte cada seção separadamente.",
      commercial_export_empty: "Esta seção ainda não possui conteúdo para exportar.",
      commercial_media_limit: "Limite de 40 imagens por preparação atingido. Revise as imagens antes de continuar.",
      commercial_studio_not_found: "Rascunho indisponível ou excluído.",
      commercial_configuration_not_ready: "Revise a apresentação e cadastre ao menos um serviço antes de aprovar.",
      commercial_email_confirmation_required: "Confirme o e-mail da sua conta antes de continuar pelo convite.",
      commercial_recipient_mismatch: "Entre com a conta do e-mail que recebeu este convite. Esta conta não é a destinatária autorizada.",
      commercial_claim_conflict: "Este convite já está vinculado a outra identidade. Solicite um novo convite à SYZIA.",
      commercial_activation_rejected: "Esta ativação foi recusada anteriormente. Entre em contato com a SYZIA para verificar o convite.",
      commercial_destination_changed:'A configuração desta empresa foi alterada durante a ativação. A importação foi interrompida para preservar seus dados. Solicite uma revisão à SYZIA.',
      commercial_plan_incompatible:'O plano escolhido não comporta a configuração preparada. Escolha um plano compatível ou solicite uma revisão, sem perder os dados.',
      commercial_plan_selected_at_activation:'O plano é escolhido pelo responsável durante a ativação.',
      commercial_configuration_reference_invalid:'Há uma referência inválida na configuração. Revise os serviços e as imagens.',
      commercial_slug_taken:'Este endereço já está reservado. Salve sem informar um endereço para gerar outro.',
      commercial_slug_invalid:'Este endereço não pode ser utilizado.',
      commercial_contact_not_linked:'Vincule o interessado à demonstração antes de gerar o convite.',
      access_denied: "Seu acesso não permite esta ação.",
      session_required: "Entre novamente para continuar.",
      commercial_contact_not_authorized:
        "O destinatário não possui autorização vigente para esta finalidade.",
      commercial_interest_required:
        "Registre o interesse em testar antes de preparar a ativação.",
      commercial_recent_delivery:
        "Há um envio recente ou incerto. Confira o histórico antes de reenviar.",
      commercial_duplicate_recipient:
        "Selecione apenas uma demonstração por destinatário nesta confirmação.",
      commercial_rate_limited:
        "O limite de envio foi atingido. Aguarde antes de preparar outro envio.",
      commercial_confirmation_required:
        "Prepare uma nova prévia e confirme os destinatários.",
      commercial_revision_conflict:
        "A configuração mudou. Atualize a página e revise novamente.",
      commercial_review_required:
        "Confira novamente a configuração e a validade do convite antes de continuar.",
      commercial_review_stale:
        "A demonstração mudou ou expirou. Revise a preparação antes de aprovar.",
      commercial_already_activated:
        "Esta preparação já foi vinculada a uma empresa real.",
      commercial_encryption_required:
        "O envio de convites ainda não foi configurado neste ambiente.",
      commercial_expired:
        "A validade terminou. Revise a demonstração e emita um novo convite.",
      commercial_demo_unavailable: "A demonstração não está disponível.",
      commercial_batch_invalid:
        "Confira a seleção e o limite de destinatários.",
      commercial_invite_invalid:
        "Este convite expirou, foi revogado ou não está disponível.",
    }) as Record<string, string>
  )[(e as Error)?.message] ||
  "Não foi possível concluir. Confira os dados e tente novamente.";
