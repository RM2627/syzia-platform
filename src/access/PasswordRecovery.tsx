import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "../brand/vireloq.css";
import { AccessFrame } from "./EnterpriseAccess";
import { Captcha, captchaConfigured } from "../Captcha";
import { PasswordInput } from "../ui/PasswordInput";
import { newRecovery } from "./recovery-client";
import {
  recoveryCallback,
  recoveryMessage,
  recoveryNotice,
} from "./recovery-core";

function RecoveryHelp() {
  return (
    <>
      <p>
        Usa um acesso preparado pela empresa ou não tem acesso ao e-mail? Peça
        ao administrador novas instruções em Pessoas e acessos → Redefinir
        acesso.
      </p>
      <p>
        Se você é o administrador inicial,{" "}
        <a href="mailto:syziaoficial@gmail.com">fale com a SYZIA</a>. Nunca
        envie sua senha ou o link de recuperação.
      </p>
    </>
  );
}
function useRecovery() {
  const ref = useRef<ReturnType<typeof newRecovery> | null>(null);
  useEffect(
    () => () => {
      ref.current?.dispose();
      ref.current = null;
    },
    [],
  );
  return () => (ref.current ??= newRecovery());
}
export function RequestPasswordRecovery() {
  const recovery = useRecovery();
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [captcha, setCaptcha] = useState(""),
    [captchaKey, setCaptchaKey] = useState(0),
    [wait, setWait] = useState(0);
  const submitting = useRef(false);
  useEffect(() => {
    if (!wait) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  return (
    <AccessFrame>
      <h1>Esqueci minha senha</h1>
      <p>
        Informe o e-mail da sua conta para receber as instruções de recuperação.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (submitting.current || wait) return;
          submitting.current = true;
          setBusy(true);
          setError("");
          setNotice("");
          const email = String(
            new FormData(e.currentTarget).get("email") || "",
          );
          try {
            await recovery().request(
              email,
              window.location.origin,
              captcha || undefined,
            );
            setNotice(recoveryNotice);
            setWait(60);
          } catch (e) {
            setError(recoveryMessage(e));
          } finally {
            submitting.current = false;
            setBusy(false);
            setCaptcha("");
            setCaptchaKey((k) => k + 1);
          }
        }}
      >
        <label className="field">
          <span>E-mail da conta</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
            disabled={busy}
          />
        </label>
        <Captcha key={captchaKey} onToken={setCaptcha} />
        <button
          className="primary"
          disabled={busy || wait > 0 || (captchaConfigured && !captcha)}
        >
          {busy
            ? "Solicitando…"
            : wait
              ? `Aguarde ${wait}s para reenviar`
              : "Enviar instruções"}
        </button>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      <RecoveryHelp />
      <Link to="/entrar">Voltar ao login</Link>
    </AccessFrame>
  );
}
export function UpdatePassword() {
  const recovery = useRecovery();
  const generation = useRef(0);
  const [callback, setCallback] = useState(() => {
    try {
      return recoveryCallback(window.location.href);
    } catch {
      return null;
    }
  });
  const [phase, setPhase] = useState<"link" | "password" | "done">("link");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submitting = useRef(false);
  // Do not leave a bearer proof in the address bar or navigate with it.
  useEffect(() => {
    const receive = () => {
      if (window.location.search || window.location.hash) {
        generation.current++;
        try {
          setCallback(recoveryCallback(window.location.href));
        } catch {
          setCallback(null);
        }
        setPhase("link");
        setError("");
        window.history.replaceState(
          window.history.state,
          "",
          "/atualizar-senha",
        );
      }
    };
    receive();
    window.addEventListener("hashchange", receive);
    window.addEventListener("popstate", receive);
    return () => {
      window.removeEventListener("hashchange", receive);
      window.removeEventListener("popstate", receive);
    };
  }, []);
  return (
    <AccessFrame>
      <h1>{phase === "done" ? "Senha atualizada" : "Redefinir senha"}</h1>
      {phase === "link" &&
        (callback ? (
          <>
            <p>
              Continue para validar o link de recuperação. Isso não altera a
              conta aberta em outra sessão.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                if (submitting.current) return;
                submitting.current = true;
                setBusy(true);
                setError("");
                const epoch = generation.current;
                try {
                  await recovery().verify(callback);
                  if (epoch === generation.current) setPhase("password");
                } catch (e) {
                  if (epoch === generation.current)
                    setError(recoveryMessage(e));
                } finally {
                  if (epoch === generation.current) setCallback(null);
                  submitting.current = false;
                  setBusy(false);
                }
              }}
            >
              {busy ? "Validando…" : "Continuar recuperação"}
            </button>
          </>
        ) : (
          !error && (
            <p role="alert">{recoveryMessage(Error("recovery_invalid"))}</p>
          )
        ))}
      {phase === "password" && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (submitting.current) return;
            submitting.current = true;
            setBusy(true);
            setError("");
            const form = e.currentTarget,
              fields = new FormData(form),
              epoch = generation.current;
            try {
              await recovery().update(
                String(fields.get("password")),
                String(fields.get("confirmation")),
              );
              if (epoch === generation.current) {
                form.reset();
                setPhase("done");
              }
            } catch (e) {
              if (epoch === generation.current) setError(recoveryMessage(e));
            } finally {
              submitting.current = false;
              setBusy(false);
            }
          }}
        >
          <p>
            Use entre 12 e 128 caracteres. Esta alteração não muda suas
            permissões.
          </p>
          <label className="field">
            <span>Nova senha</span>
            <PasswordInput
              name="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>Confirmar nova senha</span>
            <PasswordInput
              name="confirmation"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              disabled={busy}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar nova senha"}
          </button>
        </form>
      )}
      {phase === "done" && (
        <p role="status">
          Sua senha foi atualizada. Entre novamente para continuar.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {phase !== "done" && (
        <>
          <p>
            <Link to="/recuperar-acesso">Solicitar novo link</Link>
          </p>
          <RecoveryHelp />
        </>
      )}
      <Link to="/entrar">Voltar ao login</Link>
    </AccessFrame>
  );
}
