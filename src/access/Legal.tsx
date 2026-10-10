import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { rpc, supabase } from "../api";
import { AccessFrame, accessMessage } from "./EnterpriseAccess";
type Document = {
  kind: string;
  version: string;
  acceptance_version: string;
  title: string;
  body: string;
  is_draft: boolean;
  current: boolean;
};
export async function documents() {
  const { data, error } = await supabase!
    .from("legal_documents")
    .select("*")
    .eq("current", true);
  if (error) throw error;
  return (data as Document[]).map((d) => ({
    ...d,
    title: d.title.replaceAll("VIRELOQ", "SYZIA"),
    body: d.body.replaceAll("VIRELOQ", "SYZIA"),
  }));
}
export function LegalDocument({ kind }: { kind: string }) {
  const [doc, setDoc] = useState<Document>(),
    [error, setError] = useState("");
  useEffect(() => {
    documents()
      .then((ds) => setDoc(ds.find((d) => d.kind === kind)))
      .catch(() =>
        setError("Não foi possível carregar o documento. Tente novamente."),
      );
  }, [kind]);
  return (
    <AccessFrame>
      <h1>{kind === "terms" ? "Termos de Uso" : "Política de Privacidade"}</h1>
      {doc ? (
        <>
          <p>
            Versão {doc.version}{" "}
            {doc.is_draft && "· MINUTA PARA REVISÃO ANTES DO LANÇAMENTO"}
          </p>
          <div style={{ whiteSpace: "pre-wrap" }}>{doc.body}</div>
        </>
      ) : (
        <p role="status">{error || "Carregando documento…"}</p>
      )}
      <Link to="/entrar">Voltar</Link>
    </AccessFrame>
  );
}
export function LegalGate({
  canAccept,
  onDone,
  onLogout,
}: {
  canAccept: boolean;
  onDone: () => void;
  onLogout: () => void;
}) {
  const [docs, setDocs] = useState<Document[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    documents()
      .then(setDocs)
      .catch((e) => setError(accessMessage(e)));
  }, []);
  return (
    <AccessFrame>
      <h1>Antes de começar</h1>
      {canAccept ? (
        <>
          <p>
            Revise os documentos da SYZIA em nome da empresa. Nesta versão de
            homologação, são minutas; a revisão final ainda depende do
            proprietário.
          </p>
          {docs.map((d) => (
            <details key={d.kind}>
              <summary>
                {d.title} · {d.version}
              </summary>
              <div style={{ whiteSpace: "pre-wrap" }}>{d.body}</div>
            </details>
          ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await rpc("access_legal_accept", {
                  p_terms: docs.find((d) => d.kind === "terms")?.version,
                  p_privacy: docs.find((d) => d.kind === "privacy")?.version,
                });
                onDone();
              } catch (e) {
                setError(accessMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="company-invite-option">
              <input type="checkbox" required />
              <span>Li e aceito os Termos de Uso</span>
            </label>
            <label className="company-invite-option">
              <input type="checkbox" required />
              <span>Li e estou ciente da Política de Privacidade</span>
            </label>
            <button className="primary" disabled={busy || docs.length !== 2}>
              Continuar
            </button>
          </form>
        </>
      ) : (
        <p>
          A operação aguarda a revisão dos documentos pelo administrador da
          empresa. Funcionários não precisam assumir o contrato comercial.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button onClick={onLogout}>Sair</button>
    </AccessFrame>
  );
}
export function LegalSettings({ org }: { org: string }) {
  const [data, setData] = useState<any>(),
    [docs, setDocs] = useState<Document[]>([]);
  useEffect(() => {
    void rpc("access_team", { p_org: org }).then(setData);
    void documents().then(setDocs);
  }, [org]);
  return (
    <section className="card">
      <h1>Legal e privacidade</h1>
      {docs.map((d) => (
        <p key={d.kind}>
          <Link to={d.kind === "terms" ? "/termos" : "/privacidade"}>
            {d.title}
          </Link>{" "}
          · versão atual {d.version} {d.is_draft && "· Minuta"}
        </p>
      ))}
      {data?.acceptances?.map((a: any) => (
        <p key={a.accepted_at}>
          Termos {a.terms_version} · Privacidade {a.privacy_version} ·{" "}
          {new Date(a.accepted_at).toLocaleString("pt-BR")} · Responsável:{" "}
          {a.responsible_name || "registrado na auditoria"}.
        </p>
      ))}
      {data && !data.acceptances.length && (
        <p>
          Nenhum aceite institucional registrado. Organizações anteriores
          conservam seu acesso durante a transição; isso não representa aceite
          presumido.
        </p>
      )}
    </section>
  );
}
