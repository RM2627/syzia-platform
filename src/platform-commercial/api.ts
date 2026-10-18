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
        "A configuração ou a aprovação mudou. Solicite uma nova análise.",
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
