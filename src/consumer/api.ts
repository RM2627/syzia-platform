import { commercialMediaFetch } from '../demo/editor-bridge';
import { demoBuild, demoConsumerClient, demoAPI } from "../demo/transport";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { configured } from "../api";
export const consumerClient = demoBuild ? demoConsumerClient : configured
  ? createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          storageKey: "consumer-session-v1",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      },
    )
  : null;
export const gateway = demoBuild ? demoAPI + "/demonstration-media" : import.meta.env.VITE_ATTACHMENT_GATEWAY_URL || "";
export async function crpc<T = any>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!consumerClient) throw Error("backend_unavailable");
  const { data, error } = await consumerClient.rpc(name, args);
  if (error) throw error;
  return data as T;
}
export async function ensureConsumer(captchaToken?: string) {
  if (!consumerClient) throw Error("backend_unavailable");
  const {
    data: { session },
  } = await consumerClient.auth.getSession();
  if (session) return;
  const { error } = await consumerClient.auth.signInAnonymously({
    options: { captchaToken },
  });
  if (error) throw error;
}
async function jwt(client: SupabaseClient | null = consumerClient) {
  const s = await client?.auth.getSession();
  if (!s?.data.session) throw Error("consumer_session_required");
  return s.data.session.access_token;
}
export async function upload(
  code: string,
  file: File,
  key: string,
  service?: string,
) {
  if (!gateway) throw Error("upload_unavailable");
  const f = await crpc(
    service
      ? "consumer_reserve_item_attachment"
      : "consumer_reserve_attachment",
    {
      ...(service ? { p_service: service } : {}),
      p_code: code,
      p_mime: file.type,
      p_size: file.size,
      p_key: key,
    },
  );
  const r = await commercialMediaFetch(gateway + "/attachments/" + f.code, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + (await jwt()),
      "Content-Type": file.type,
    },
    body: file,
  });
  if (!r.ok) throw Error((await r.json()).error || "invalid_image_content");
  return f.code;
}
export async function download(
  code: string,
  client: SupabaseClient | null = consumerClient,
) {
  if (!gateway) throw Error("upload_unavailable");
  if (!client) throw Error("consumer_session_required");
  const { data: t, error } = await client.rpc("consumer_attachment_ticket", {
    p_code: code,
  });
  if (error) throw error;
  const r = await commercialMediaFetch(gateway + "/attachments/" + code, {
    headers: {
      Authorization: "Bearer " + (await jwt(client)),
      "X-Download-Ticket": t.ticket,
    },
  });
  if (!r.ok) throw Error("attachment_access_denied");
  return URL.createObjectURL(await r.blob());
}
export function message(e: unknown) {
  const x = e as { message?: string; code?: string };
  const map: Record<string, string> = {
    media_gateway_unreachable:
      "Gateway de mídia indisponível. Verifique se o serviço de mídia está iniciado e acessível. Seu rascunho foi preservado.",
    media_gateway_failed:
      "O serviço de mídia não concluiu o envio. Tente novamente ou contate o suporte.",
    storage_unavailable:
      "O armazenamento de imagens está indisponível. A administração deve verificar a configuração do serviço de mídia.",
    origin_denied:
      "O endereço desta aplicação não está autorizado no serviço de mídia. Contate o suporte.",
    operation_rejected:
      "O envio da imagem foi recusado. Confira as permissões de mídia e tente novamente.",

    desired_time_required: "Escolha um dia e horário para continuar.",
    required_service_photos:
      "Envie as fotos obrigatórias de cada serviço para avaliação.",
    inactive_question_answer:
      "Uma resposta depende de uma opção que mudou. Revise os detalhes.",
    invalid_question_condition:
      "Escolha uma pergunta anterior de sim/não ou escolha do mesmo serviço.",
    company_quote_permission_required:
      "A definição de valores depende de autorização da empresa.",
    invalid_quote_item:
      "Confira os valores, quantidades, duração e descrição dos itens.",
    invalid_discount: "Revise o desconto informado.",
    quote_duration_too_short:
      "A duração do item não pode ser menor que a configurada no catálogo.",
    page_unavailable: "Esta página não está disponível no momento.",
    consumer_session_required:
      "Sua sessão expirou. Reabra seu link de acompanhamento ou tente novamente.",
    request_access_denied:
      "Não foi possível acessar esta solicitação com sua sessão.",
    tracking_link_invalid:
      "Este link expirou, foi revogado ou já foi usado em outro dispositivo.",
    service_unavailable:
      "Este serviço ficou indisponível. Seus dados continuam nesta tela.",
    addon_unavailable: "Um adicional ficou indisponível. Revise sua seleção.",
    price_changed:
      "O preço mudou. Atualize o catálogo e revise antes de enviar.",
    price_mismatch:
      "O preço precisa ser revisado. Atualize o catálogo antes de enviar.",
    quote_version_invalid:
      "Há uma versão mais recente da proposta. Atualize para revisá-la.",
    quote_expired_or_invalid:
      "Esta proposta expirou ou não pode mais ser aprovada.",
    professional_unavailable:
      "Não há disponibilidade para este horário. Escolha outra opção.",
    professional_conflict:
      "Não há disponibilidade para este horário. Escolha outra opção.",
    availability_company_closed:
      "Não há disponibilidade para este horário. Escolha outra opção.",
    responsible_replan_review_required:
      "Este atendimento precisa ser revisto pela empresa antes de remarcar.",
    slot_unavailable: "Esse horário não está mais disponível. Escolha outro.",
    cancel_not_allowed:
      "O prazo para cancelar pelo site terminou. Entre em contato com a empresa.",
    reschedule_not_allowed:
      "O prazo para remarcar pelo site terminou. Entre em contato com a empresa.",
    invalid_image_content:
      "A imagem não pôde ser validada. Use um arquivo JPEG, PNG ou WebP estático.",
    invalid_image_type: "Use JPG, PNG ou WebP com até 5 MB.",
    page_draft_changed:
      "O rascunho mudou. Abra novamente a prévia antes de publicar.",
    page_not_ready:
      "Complete os itens obrigatórios indicados antes de publicar.",
    company_media_limit:
      "O limite de 150 imagens da empresa foi atingido. Contate o suporte.",
    portfolio_limit:
      "O limite é de 30 trabalhos. Edite ou exclua um trabalho antes de adicionar outro.",
    upload_unavailable: "O envio de imagens está temporariamente indisponível.",
    attachment_access_denied:
      "Não foi possível abrir esta imagem com sua sessão.",
    request_rate_limit:
      "Você atingiu o limite de solicitações. Aguarde para tentar novamente.",
    service_already_included:
      "Um dos serviços já está incluído em outro. Revise a seleção para evitar cobrança duplicada.",
    services_incompatible:
      "Esses serviços não podem ser combinados. Revise sua seleção.",
    request_item_limit:
      "O pedido comporta até 30 itens, contando serviços e adicionais. Reduza a seleção.",
    invalid_request_items:
      "Confira os serviços e os detalhes de cada item do pedido.",
    execution_plan_changed:
      "A disponibilidade de um dos períodos mudou. Consulte novamente; nenhum período foi reservado.",
    shared_identity_requires_superadmin:
      "A identidade global da equipe SYZIA é administrada pelo Super Admin. Ajuste somente as permissões nesta empresa.",
    quote_explanation_required:
      "Explique a proposta e seus ajustes para o consumidor.",
    required_answer: "Responda às perguntas obrigatórias para continuar.",
    idempotency_conflict:
      "Esta tentativa já foi registrada com outros dados. Reabra sua solicitação.",
    booking_requires_approved_quote:
      "Você precisa aprovar a proposta da empresa antes de reservar o atendimento.",
  };
  if (
    [
      "billing_limit_reached",
      "billing_subscription_required",
      "billing_feature_unavailable",
    ].includes(x.message || "")
  )
    return "A empresa não está recebendo novas solicitações neste momento. Seus dados nesta tela foram preservados; tente novamente mais tarde.";
  if (x.code === "42501") return map.request_access_denied;
  if (x.code === "PGRST301" || x.code === "PGRST302")
    return map.consumer_session_required;
  if (x.code === "40001")
    return "As informações foram atualizadas. Recarregue o catálogo e revise seus dados antes de enviar.";
  if (x.code === "23P01") return map.slot_unavailable;
  return (
    map[x.message || ""] ||
    "Não foi possível concluir. Confira sua conexão e tente novamente. Seus dados nesta tela foram preservados."
  );
}
export const money = (n: number | null) =>
  n === null
    ? "Sob consulta"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(n / 100);
export const date = (s: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Recife",
  }).format(new Date(s));
export const time = (s: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeStyle: "short",
    timeZone: "America/Recife",
  }).format(new Date(s));
export type Addon = {
  code: string;
  name: string;
  price_mode: string;
  price_cents: number | null;
  duration_minutes: number | null;
};
export type Question = {
  code: string;
  label: string;
  kind: string;
  instruction?: string;
  multiline?: boolean;
  condition_field?: string;
  condition_value?: unknown;
  required: boolean;
  options: string[];
};
export type Service = Addon & {
  quantity_enabled?: boolean;
  quantity_min?: number;
  quantity_max?: number;
  quantity_unit?: string;
  quantity_duration?: "fixed" | "proportional" | "manual";
  category: string;
  description: string;
  image_url: string;
  image_media?: string;
  availability: string;
  contract_mode?: "immediate" | "evaluation";
  photo_policy?: "none" | "optional" | "recommended" | "required";
  photo_instructions?: string;
  direct_booking: boolean;
  quotes_allowed: boolean;
  addons: Addon[];
  questions: Question[];
};
export const mediaUrl = (code: string | null | undefined) =>
  code && /^m_[a-f0-9]{24}$/.test(code) && gateway
    ? gateway + "/media/" + code
    : undefined;
export type Company = {
  template?: "current" | "modern" | "minimal" | "catalog";
  relations?: {
    source: string;
    target: string;
    kind: "includes" | "incompatible" | "review";
  }[];
  branding?: {
    primary_color: string;
    theme?: "light" | "dark";
    logo?: string;
    cover?: string;
    category_order: string[];
    service_order: string[];
  };
  portfolio?: {
    code: string;
    title: string;
    description: string;
    service: string | null;
    format: "gallery" | "before_after";
    images: string[];
  }[];
  name: string;
  slug: string;
  description: string;
  phone: string;
  email: string;
  address: string;
  regions: string;
  payments: string;
  hours: { day: number; open: string; close: string }[];
  timezone: string;
  services: Service[];
  faqs: { question: string; answer: string }[];
  quick_replies?: { title: string; body: string }[];
  public_information?: Record<string, string>;
  revision: string;
  booking_policy: {
    active: boolean;
    cancel_minutes: number;
    lead_minutes: number;
    horizon_days: number;
  };
  notice_version: string;
};
