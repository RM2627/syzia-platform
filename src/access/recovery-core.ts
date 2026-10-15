import type { SupabaseClient } from "@supabase/supabase-js";

export const recoveryStorageKey = "syzia-password-recovery";
export const recoveryNotice =
  "Se houver uma conta elegível com esse e-mail, você receberá as instruções. Confira também o spam. Use o link mais recente no mesmo navegador em que fez a solicitação.";
const invalid = () => Error("recovery_invalid");
export type RecoveryProof = { kind: "code" | "hash"; value: string };

// Only the PKCE verifier survives navigation. Auth sessions stay in memory and
// never share the application's storage key or authorization context.
export function recoveryStorage(persistent: Storage, now = Date.now) {
  const memory = new Map<string, string>();
  const verifierKey = recoveryStorageKey + "-code-verifier";
  return {
    getItem(key: string) {
      if (key !== verifierKey) return memory.get(key) ?? null;
      try {
        const row = JSON.parse(persistent.getItem(key) || "null");
        if (row && typeof row.value === "string" && row.until > now())
          return row.value;
        persistent.removeItem(key);
      } catch {
        /* unavailable storage fails closed */
      }
      return null;
    },
    setItem(key: string, value: string) {
      if (key === verifierKey)
        persistent.setItem(
          key,
          JSON.stringify({ value, until: now() + 3600000 }),
        );
      else memory.set(key, value);
    },
    removeItem(key: string) {
      if (key === verifierKey) persistent.removeItem(key);
      else memory.delete(key);
    },
    clearSession() {
      memory.clear();
    },
  };
}

export function recoveryCallback(href: string): RecoveryProof {
  const url = new URL(href),
    query = url.searchParams,
    hash = new URLSearchParams(url.hash.slice(1));
  if (url.pathname !== "/atualizar-senha") throw invalid();
  const allowed = new Set(["code", "token_hash", "type"]);
  for (const params of [query, hash])
    for (const key of params.keys())
      if (
        !allowed.has(key) ||
        params.getAll(key).length !== 1 ||
        (query.has(key) && hash.has(key))
      )
        throw invalid();
  const code = query.get("code"),
    token = hash.get("token_hash") || query.get("token_hash");
  const type = hash.get("type") || query.get("type");
  if (
    code &&
    !token &&
    !type &&
    !url.hash &&
    /^[a-zA-Z0-9_-]{16,512}$/.test(code)
  )
    return { kind: "code", value: code };
  if (
    token &&
    !code &&
    !query.has("code") &&
    type === "recovery" &&
    /^[a-zA-Z0-9_-]{32,512}$/.test(token)
  )
    return { kind: "hash", value: token };
  throw invalid();
}

export function recoveryMessage(error: unknown) {
  const e = error as { code?: string; message?: string; status?: number };
  const code = e?.code || e?.message;
  if (
    e?.status === 429 ||
    ["over_email_send_rate_limit", "over_request_rate_limit"].includes(
      code || "",
    )
  )
    return "Muitas tentativas. Aguarde alguns minutos antes de solicitar outro e-mail.";
  if (code === "captcha_failed")
    return "Refaça a verificação de segurança e tente novamente.";
  if (
    [
      "recovery_invalid",
      "otp_expired",
      "flow_state_expired",
      "flow_state_not_found",
      "bad_code_verifier",
      "session_not_found",
      "refresh_token_not_found",
    ].includes(code || "")
  )
    return "Este link é inválido, expirou ou já foi utilizado. Solicite outro e-mail e abra o link mais recente no mesmo navegador.";
  if (["weak_password", "same_password"].includes(code || ""))
    return "Escolha uma senha diferente da anterior e que atenda aos requisitos de segurança.";
  if (code === "password_mismatch")
    return "As senhas devem coincidir e ter entre 12 e 128 caracteres.";
  if (code === "email_invalid") return "Informe um e-mail válido.";
  return "Não foi possível concluir agora. Confira sua conexão e tente novamente. Se necessário, solicite um novo link.";
}

export function createRecovery(
  auth: SupabaseClient["auth"],
  storage: ReturnType<typeof recoveryStorage>,
) {
  let proof: { id: string; until: number } | null = null;
  let busy = false;
  async function exclusive<T>(task: () => Promise<T>): Promise<T> {
    if (busy) throw Error("recovery_busy");
    busy = true;
    try {
      return await task();
    } finally {
      busy = false;
    }
  }
  return {
    request(email: string, origin: string, captchaToken?: string) {
      return exclusive(async () => {
        email = email.trim();
        if (
          email.length > 254 ||
          !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)
        )
          throw Error("email_invalid");
        const target = new URL(origin);
        if (
          target.protocol !== "https:" &&
          !(
            target.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(target.hostname)
          )
        )
          throw invalid();
        const { error } = await auth.resetPasswordForEmail(email, {
          redirectTo: target.origin + "/atualizar-senha",
          captchaToken,
        });
        if (
          error &&
          !["user_not_found", "email_not_confirmed"].includes(error.code || "")
        )
          throw error;
      });
    },
    verify(callback: RecoveryProof) {
      return exclusive(async () => {
        proof = null;
        storage.clearSession();
        let session;
        if (callback.kind === "code") {
          const verifier = storage.getItem(
            recoveryStorageKey + "-code-verifier",
          );
          if (!verifier || !JSON.parse(verifier)?.endsWith("/recovery"))
            throw invalid();
          const result = await auth.exchangeCodeForSession(callback.value);
          if (result.error) throw result.error;
          if (
            !("redirectType" in result.data) ||
            result.data.redirectType !== "recovery"
          ) {
            storage.clearSession();
            throw invalid();
          }
          session = result.data.session;
        } else {
          const result = await auth.verifyOtp({
            token_hash: callback.value,
            type: "recovery",
          });
          if (result.error) throw result.error;
          session = result.data.session;
        }
        if (!session?.expires_at || session.expires_at * 1000 <= Date.now()) {
          storage.clearSession();
          throw invalid();
        }
        const { data, error } = await auth.getUser(session.access_token);
        if (
          error ||
          !data.user ||
          data.user.is_anonymous ||
          data.user.id !== session.user.id
        ) {
          storage.clearSession();
          throw invalid();
        }
        proof = { id: data.user.id, until: session.expires_at * 1000 };
      });
    },
    update(password: string, confirmation: string) {
      return exclusive(async () => {
        if (!proof || proof.until <= Date.now()) throw invalid();
        if (
          password.length < 12 ||
          password.length > 128 ||
          password !== confirmation
        )
          throw Error("password_mismatch");
        const { data, error } = await auth.updateUser({ password });
        if (error) throw error;
        if (data.user?.id !== proof.id) throw invalid();
        proof = null;
        try {
          await auth.signOut({ scope: "local" });
        } catch {
          /* Password was already updated; discard the isolated session. */
        } finally {
          storage.clearSession();
        }
      });
    },
    dispose() {
      proof = null;
      storage.clearSession();
    },
  };
}
