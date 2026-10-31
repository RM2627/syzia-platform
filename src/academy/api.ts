export const academyRoot = (import.meta.env.VITE_ACADEMY_API_URL || "").replace(
  /\/$/,
  "",
);
export const academyError = (e: unknown) =>
  (
    ({
      academy_closed:
        "As aulas ainda não estão abertas ou as inscrições estão pausadas.",
      academy_mail_unavailable:
        "As inscrições por e-mail ainda não estão disponíveis. Volte em breve.",
      academy_consent_required:
        "Confirme que deseja receber as comunicações do minicurso.",
      academy_invalid: "Confira os campos e os limites indicados.",
      academy_rate_limited:
        "Muitas tentativas em pouco tempo. Aguarde antes de tentar novamente.",
      academy_link_invalid:
        "Este link expirou ou já foi utilizado. Solicite um novo acesso.",
      academy_challenge_expired: "Atualize a página e tente novamente.",
      academy_notice_changed:
        "O aviso de privacidade foi atualizado. Recarregue e leia a versão atual.",
      academy_session_required:
        "Entre com o link enviado ao seu e-mail para continuar.",
      access_denied: "Seu acesso não permite esta operação.",
      academy_revision_conflict:
        "Há uma versão mais recente. Reabra o conteúdo antes de salvar.",
      academy_course_incomplete:
        "Complete a capa, os módulos e as aulas. Cada aula precisa de orientações, vídeo e liberação para publicação.",
      academy_course_invalid:
        "Confira o título, a descrição, o público-alvo e os limites dos módulos.",
      academy_lesson_invalid: "Confira os dados e os materiais de cada aula.",
      academy_material_invalid:
        "Arquivo não permitido. Use os formatos e limites indicados.",
      academy_video_invalid: "Informe um link HTTPS válido do YouTube.",
      academy_legal_required:
        "Defina a identificação, o contato e os documentos aprovados antes de abrir inscrições ou aulas.",
      academy_confirmation_required:
        "Revise a operação e confirme antes de continuar.",
      academy_return_waitlist:
        "Volte ao modo Lista de espera antes de retirar o último curso ou todas as suas aulas.",
      academy_preview_expired:
        "Esta prévia expirou ou mudou. Prepare uma nova prévia.",
      academy_not_found: "O conteúdo solicitado não está disponível.",
    }) as Record<string, string>
  )[(e as Error)?.message] ||
  "Não foi possível concluir. Seus dados não foram confirmados como gravados. Tente novamente mais tarde.";
export async function academyApi(
  action: string,
  data: Record<string, unknown> = {},
) {
  const r = await fetch(academyRoot + "/academy/" + action, {
    method: action === "config" ? "GET" : "POST",
    credentials: "include",
    referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json" },
    ...(action === "config" ? {} : { body: JSON.stringify(data) }),
  });
  const body = await r.json();
  if (!r.ok) throw Error(body.error || "academy_unavailable");
  return body;
}
export async function studentDownload(id: string, name: string) {
  const r = await fetch(academyRoot + "/academy/file", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
    referrerPolicy: "no-referrer",
  });
  if (!r.ok) throw Error("academy_session_required");
  const url = URL.createObjectURL(await r.blob()),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
