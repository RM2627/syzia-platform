import { useRef, useState } from "react";
import type { AcademyCall } from "./types";
import { academyError } from "./api";

export function MailDiagnostic({ value }: { value: any }) {
  if (!value)
    return <small>Esta tentativa não possui diagnóstico detalhado.</small>;
  const stages: Record<string, string> = {
    prepare: "Preparação da mensagem",
    configuration: "Configuração",
    dns: "DNS",
    connection: "Conexão inicial",
    greeting: "Saudação SMTP",
    authentication: "Autenticação SMTP",
    sender: "Remetente",
    recipient: "Destinatário",
    message: "Transmissão da mensagem",
    tls: "TLS",
    connection_or_socket: "Conexão/socket (momento exato não confirmado)",
    unknown: "Etapa não identificada",
    accepted: "Aceitação SMTP",
  };
  const kinds: Record<string, string> = {
    accepted: "Aceito pelo provedor — não comprova entrega na caixa de entrada",
    definitive: "Falha definitiva nesta tentativa",
    temporary: "Falha temporária sem aceitação SMTP",
    uncertain: "Resultado incerto — não reenviar sem verificar no provedor",
  };
  return (
    <div className="aa-note">
      <p>{kinds[value.category] || "Resultado não identificado"}</p>
      <small>
        {stages[value.stage] || "Etapa não identificada"} · {value.smtp_code}
        {value.response_code ? ` · SMTP ${value.response_code}` : ""}
      </small>
    </div>
  );
}

export function MailTest({
  call,
  refresh,
  tests = [],
}: {
  call: AcademyCall;
  refresh: () => Promise<unknown>;
  tests?: any[];
}) {
  const [email, setEmail] = useState(""),
    [authorized, setAuthorized] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  const act = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(academyError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="aa-confirm" aria-labelledby="academy-mail-test-title">
      <h3 id="academy-mail-test-title">Testar envio de e-mail</h3>
      <p>
        Envie uma mensagem de diagnóstico a um endereço que você controla ou
        cujo responsável autorizou o teste. Nenhuma inscrição será criada ou
        alterada.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!preview ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () =>
              setPreview(
                await call("mail_test_preview", { email, authorized }),
              ),
            );
          }}
        >
          <div className="aa-fields">
            <label>
              Destinatário do teste
              <input
                type="email"
                autoComplete="off"
                required
                maxLength={254}
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          </div>
          <label className="aa-check">
            <input
              type="checkbox"
              required
              checked={authorized}
              disabled={busy}
              onChange={(e) => setAuthorized(e.target.checked)}
            />
            Controlo este endereço ou obtive autorização do destinatário para
            este teste.
          </label>
          <button disabled={busy || !authorized} type="submit">
            Visualizar mensagem de teste
          </button>
        </form>
      ) : (
        <div>
          <h4>Revise antes de enviar</h4>
          <p>
            Para: <strong>{preview.recipient}</strong>
          </p>
          <p>
            Assunto: <strong>{preview.subject}</strong>
          </p>
          <p className="aa-prose">{preview.text}</p>
          <p>
            Prévia válida até{" "}
            {new Date(preview.expires_at).toLocaleTimeString("pt-BR")}.
          </p>
          <div className="aa-actions">
            <button
              className="aa-primary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const result = await call("mail_test_confirm", {
                    id: preview.id,
                    confirmed: true,
                  });
                  setPreview(null);
                  setNotice(
                    result.status === "pending"
                      ? "Teste autorizado. Use Atualizar resultados para acompanhar a tentativa."
                      : "Esta tentativa já foi registrada. Consulte o resultado; nenhum reenvio foi criado.",
                  );
                  await refresh();
                })
              }
            >
              Confirmar envio de teste
            </button>
            <button disabled={busy} onClick={() => setPreview(null)}>
              Alterar destinatário ou cancelar
            </button>
          </div>
        </div>
      )}
      <p>
        <small>
          Até 3 testes por administrador a cada hora e 10 testes no total em 24
          horas. Uma prévia não envia e-mail. Resultados incertos não são
          reenviados automaticamente.
        </small>
      </p>
      {tests.length > 0 && (
        <details>
          <summary>Resultados dos testes ({tests.length})</summary>
          {tests.map((t) => (
            <article className="aa-delivery" key={t.id}>
              <div>
                <strong>
                  {
                    (
                      {
                        preview: "Prévia — não enviada",
                        pending: "Aguardando processamento",
                        sending: "Em processamento",
                        accepted: "Aceito pelo provedor",
                        failed: "Falha no envio",
                        uncertain: "Resultado incerto",
                        skipped: "Expirado — não enviado",
                      } as Record<string, string>
                    )[t.status]
                  }
                </strong>
                <p>{new Date(t.created_at).toLocaleString("pt-BR")}</p>
                <small>Identificador: {t.id}</small>
                {t.diagnostic && <MailDiagnostic value={t.diagnostic} />}
              </div>
            </article>
          ))}
        </details>
      )}
    </section>
  );
}
