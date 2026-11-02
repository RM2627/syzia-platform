import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../api";
import { SiteFrame } from "../acquisition/PublicSite";
import { accessApi } from "./EnterpriseAccess";
import { Captcha, captchaConfigured } from "../Captcha";
import {
  pendingRegistration,
  registrationCallback,
  registrationConfirmation,
  registrationMessage,
  savedActivation,
} from "./registration-core";

// Read before clearing the fragment; the Auth client does not auto-consume this route.
const callback = registrationCallback(window.location.href);
export const hasRegistrationCallback = callback.kind !== "none";
const confirm = supabase
  ? registrationConfirmation(supabase.auth, callback)
  : async () => {
      throw Error("confirmation_login_required");
    };
if (
  window.location.pathname === "/confirmar-email" ||
  (window.location.pathname === "/cadastrar" && hasRegistrationCallback)
)
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname,
  );

export function ConfirmationPanel({
  initialEmail = "",
  initialError = "",
  onReady,
}: {
  initialEmail?: string;
  initialError?: string;
  onReady?: (session: any) => Promise<void>;
}) {
  const nav = useNavigate();
  const [email, setEmail] = useState(initialEmail),
    [captcha, setCaptcha] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(
      initialError ||
        (callback.kind === "invalid"
          ? registrationMessage(Error("confirmation_link_invalid"))
          : ""),
    ),
    [notice, setNotice] = useState(""),
    [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  const remaining = Math.max(0, Math.ceil((until - now) / 1000));
  async function verified(useCallback: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const s = await (useCallback
        ? confirm()
        : registrationConfirmation(supabase!.auth, { kind: "none" })());
      pendingRegistration(localStorage, false);
      if (onReady) await onReady(s);
      else nav("/cadastrar?confirmado=1", { replace: true });
    } catch (e) {
      setError(registrationMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sy-form-card">
      <h2>Confirme seu e-mail</h2>
      <p>
        Abra o link recebido para confirmar seu endereço. Você pode usar outro
        aparelho e depois entrar com sua conta para continuar a mesma
        preparação.
      </p>
      {callback.kind !== "none" && callback.kind !== "invalid" && (
        <button
          className="sy-button sy-primary"
          disabled={busy}
          onClick={() => void verified(true)}
        >
          Confirmar e-mail e continuar
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || remaining) return;
          setBusy(true);
          setError("");
          setNotice("");
          const end = Date.now() + 60000;
          setUntil(end);
          setNow(Date.now());
          void accessApi("/access/signup-confirmation", {
            email,
            captcha,
            invitation: savedActivation(sessionStorage) || undefined,
          })
            .then(() => {
              pendingRegistration(localStorage, true);
              setNotice(
                "Solicitação recebida. Se houver um cadastro aguardando confirmação, as instruções serão enviadas. Se já confirmou, entre para continuar.",
              );
            })
            .catch((e) => setError(registrationMessage(e)))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          E-mail do cadastro
          <input
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <Captcha onToken={setCaptcha} />
        <button
          className="sy-button"
          disabled={busy || remaining > 0 || (captchaConfigured && !captcha)}
        >
          {remaining
            ? `Reenviar em ${remaining}s`
            : "Reenviar e-mail de confirmação"}
        </button>
      </form>
      <div className="sy-actions">
        <button disabled={busy} onClick={() => void verified(false)}>
          Já confirmei meu e-mail
        </button>
        <Link className="sy-button" to="/entrar?retorno=cadastro">
          Entrar e continuar
        </Link>
      </div>
      <details>
        <summary>Informei um e-mail incorreto</summary>
        <p>
          Este campo solicita instruções para o endereço informado; ele não
          altera o e-mail de uma conta. Se você não tem acesso ao endereço
          cadastrado, fale com a SYZIA para revisar o convite antes de
          continuar. Não crie outra identidade para tentar assumir a mesma
          empresa.
        </p>
        <Link to="/contato">Falar com a SYZIA</Link>
      </details>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
export function SignupConfirmation() {
  return (
    <SiteFrame title="Confirmação de e-mail — SYZIA">
      <section className="sy-section sy-registration">
        <h1>Continue seu cadastro</h1>
        <ConfirmationPanel />
      </section>
    </SiteFrame>
  );
}
