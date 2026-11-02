export type RegistrationCallback =
  | { kind: "none" | "invalid" }
  | { kind: "implicit"; access: string; refresh: string }
  | { kind: "hash"; token: string }
  | { kind: "pkce"; code: string };
export function registrationCallback(href: string): RegistrationCallback {
  const u = new URL(href),
    h = new URLSearchParams(u.hash.slice(1));
  if (
    [u.searchParams, h].some((p) =>
      ["error", "error_code", "error_description"].some((k) => p.has(k)),
    )
  )
    return { kind: "invalid" };
  const type = h.get("type") || u.searchParams.get("type");
  const token = h.get("token_hash") || u.searchParams.get("token_hash");
  if (token)
    return ["signup", "email"].includes(type || "") &&
      /^[a-f0-9]{40,128}$/i.test(token)
      ? { kind: "hash", token }
      : { kind: "invalid" };
  const access = h.get("access_token"),
    refresh = h.get("refresh_token");
  if (access || refresh)
    return access &&
      refresh &&
      access.length <= 16384 &&
      refresh.length <= 2048 &&
      ["signup", "email"].includes(type || "")
      ? { kind: "implicit", access, refresh }
      : { kind: "invalid" };
  const code = u.searchParams.get("code");
  if (code)
    return code.length <= 2048 && (!type || ["signup", "email"].includes(type))
      ? { kind: "pkce", code }
      : { kind: "invalid" };
  return { kind: "none" };
}
// A callback is consumed once per page, including double clicks/StrictMode. No session transfer between devices.
export function registrationConfirmation(
  auth: any,
  callback: RegistrationCallback,
) {
  let attempt: Promise<any> | undefined;
  return () =>
    (attempt ||= (async () => {
      let result;
      if (callback.kind === "invalid") throw Error("confirmation_link_invalid");
      if (callback.kind === "hash")
        result = await auth.verifyOtp({
          token_hash: callback.token,
          type: "email",
        });
      else if (callback.kind === "implicit")
        result = await auth.setSession({
          access_token: callback.access,
          refresh_token: callback.refresh,
        });
      else if (callback.kind === "pkce")
        result = await auth.exchangeCodeForSession(callback.code);
      else result = await auth.getSession();
      if (result.error) throw Error("confirmation_link_invalid");
      if (!result.data?.session) throw Error("confirmation_login_required");
      const verified = await auth.getUser();
      if (
        verified.error ||
        !verified.data?.user ||
        verified.data.user.is_anonymous ||
        !verified.data.user.email_confirmed_at
      )
        throw Error("confirmation_login_required");
      if (verified.data.user.id !== result.data.session.user.id)
        throw Error("confirmation_login_required");
      return { ...result.data.session, user: verified.data.user };
    })());
}
export function registrationMessage(e: any) {
  const code = e?.code || e?.message;
  return (
    (
      {
        confirmation_link_invalid:
          "Este link expirou, já foi utilizado ou não pôde ser confirmado neste navegador. Se você já confirmou, entre para continuar; caso contrário, solicite um novo e-mail.",
        confirmation_login_required:
          "Entre com seu e-mail e senha para verificar a confirmação e continuar. Você não precisa criar outra identidade.",
        signup_confirmation_uncertain:
          "Não foi possível confirmar o envio. Seu cadastro pode ter sido iniciado. Use as opções abaixo para continuar, sem criar outra identidade.",
        signup_configuration_unavailable:
          "O envio da confirmação não está disponível agora. Tente mais tarde ou entre em contato com a SYZIA.",
        access_rate_limited:
          "Muitas solicitações. Aguarde alguns minutos antes de tentar novamente.",
        delivery_cooldown: "Aguarde um minuto antes de solicitar outro e-mail.",
        access_invalid: "Confira o e-mail e a verificação de segurança.",
        registration_invitation_invalid:
          "O convite ou o e-mail informado não permite esta retomada. Confira o link original e use o endereço destinatário.",
      } as Record<string, string>
    )[code] ||
    "Não foi possível verificar agora. Seu cadastro foi preservado; tente novamente mais tarde."
  );
}
export const registrationPendingKey = "syzia-registration-pending";
export function pendingRegistration(storage: Storage, value?: boolean) {
  try {
    if (value === true) storage.setItem(registrationPendingKey, "1");
    if (value === false) storage.removeItem(registrationPendingKey);
    return storage.getItem(registrationPendingKey) === "1";
  } catch {
    return false;
  }
}
export function savedActivation(storage: Storage) {
  try {
    const v = storage.getItem("syzia-commercial-invitation") || "";
    return /^[A-Za-z0-9_-]{43}$/.test(v) ? v : "";
  } catch {
    return "";
  }
}
