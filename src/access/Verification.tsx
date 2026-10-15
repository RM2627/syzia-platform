import { normalizeCPF } from "../../shared/cpf.mjs";
import { useFinancialCommand } from "../finance/useFinancialCommand";
import { useEffect, useState, type FormEvent } from "react";
import { rpc, errorMessage } from "../api";
import { Brand } from "../brand/Brand";
export function VerificationGate({
  org,
  canAccept,
  onDone,
  onLogout,
}: {
  org: string;
  canAccept: boolean;
  onDone: () => void;
  onLogout: () => void;
}) {
  const command = useFinancialCommand();
  const [data, setData] = useState<any>(null),
    [kind, setKind] = useState("CPF"),
    [document, setDocument] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (canAccept)
      void rpc("access_verification_context", { p_org: org })
        .then(setData)
        .catch((e) => setError(errorMessage(e)));
  }, [org, canAccept]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (kind === "CPF" && !normalizeCPF(document)) {
      setError("Confira os dígitos do CPF. Use 11 dígitos ou a máscara 000.000.000-00.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const d = await command<any>("access_verify_document", {
        p_org: org,
        p_kind: kind,
        p_document: document,
        p_revision: data.revision,
        p_key: crypto.randomUUID(),
      });
      setDocument("");
      setData(d);
      if (d.state === "verified") onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="public">
      <Brand />
      <section className="card">
        <p className="eyebrow">PRIMEIRO ACESSO</p>
        <h1>Confira o cadastro da empresa</h1>
        <p>
          A verificação cadastral ajuda a identificar a empresa e consultar a
          elegibilidade para avaliação gratuita.
        </p>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {!canAccept ? (
          <p>
            O administrador da empresa precisa concluir esta etapa para liberar
            o acesso.
          </p>
        ) : data?.state === "review" ? (
          <>
            <h2>Cadastro em revisão</h2>
            <p>
              Uma situação excepcional precisa da análise da Administração
              SYZIA. Seu cadastro foi preservado.
            </p>
            <button onClick={onDone}>Verificar atualização</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <fieldset className="form-reset" disabled={busy || !data}>
              <label className="field">
                Documento
                <select
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value);
                    setDocument("");
                  }}
                >
                  <option value="CPF">CPF — profissional independente</option>
                  <option value="CNPJ">CNPJ — empresa</option>
                </select>
              </label>
              <label className="field">
                {kind}
                <input
                  autoComplete="off"
                  value={document}
                  onChange={(e) => setDocument(e.target.value)}
                  maxLength={32}
                  required
                />
              </label>
              <p className="muted">
                Conferimos o formato, os dígitos verificadores e o histórico
                interno. Esta etapa não consulta órgãos públicos nem comprova a
                titularidade do documento.
              </p>
              <button className="primary">Verificar e continuar</button>
            </fieldset>
          </form>
        )}
        <button onClick={onLogout}>Sair</button>
      </section>
    </main>
  );
}
export function VerificationReview({ org }: { org: string }) {
  const command = useFinancialCommand();
  const [data, setData] = useState<any>(null),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const load = () =>
    rpc("access_verification_context", { p_org: org }).then(setData);
  useEffect(() => {
    void load().catch((e) => setError(errorMessage(e)));
  }, [org]);
  async function review(approve: boolean) {
    try {
      setData(
        await rpc("access_verification_review", {
          p_org: org,
          p_revision: data.revision,
          p_approve: approve,
          p_reason: reason,
        }),
      );
      setReason("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <section className="card">
      <h2>Verificação cadastral</h2>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            Situação:{" "}
            {
              (
                {
                  legacy: "Cadastro anterior preservado",
                  pending: "Aguardando administrador",
                  verified: "Estrutura verificada",
                  review: "Em revisão",
                } as any
              )[data.state]
            }
            {data.masked ? " · " + data.masked : ""}
          </p>
          <p>Não representa comprovação governamental de identidade.</p>
          {data.state === "review" && (
            <>
              <label className="field">
                Justificativa da revisão
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={15}
                  maxLength={500}
                />
              </label>
              <button
                disabled={reason.trim().length < 15}
                onClick={() => void review(true)}
              >
                Aprovar excepcionalmente
              </button>
              <button
                disabled={reason.trim().length < 15}
                onClick={() => void review(false)}
              >
                Manter em revisão
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
