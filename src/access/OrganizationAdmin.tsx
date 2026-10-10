import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { rpc } from "../api";
import { ProvisionForm, accessMessage } from "./EnterpriseAccess";
const setupLabels: Record<string, string> = {
  awaiting_admin: "Aguardando administrador · Sob gestão da SYZIA",
  incomplete: "Preparação do administrador incompleta",
  pending_activation: "Administrador aguardando primeiro acesso",
  pending_legal: "Aceite institucional pendente",
  ready: "ADM responsável ativo · suporte sujeito a autorização",
};
export function OrganizationAdmin({ onChange }: { onChange: () => unknown }) {
  const [organizations, setOrganizations] = useState<any[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState<any>(null),
    [confirmation, setConfirmation] = useState("");
  const load = useCallback(async () => {
    try {
      setOrganizations(await rpc<any[]>("access_organizations"));
    } catch (e) {
      setError(accessMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function refresh() {
    await load();
    await onChange();
  }
  async function status(o: any) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await rpc("foundation_update_organization", {
        p_org: o.id,
        p_name: o.name,
        p_status: o.status === "active" ? "suspended" : "active",
      });
      setNotice(
        o.status === "active"
          ? "Empresa desativada. Os dados foram preservados."
          : "Empresa reativada. Identidades e histórico foram preservados.",
      );
      await refresh();
    } catch (e) {
      setError(accessMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Empresas</h1>
      <p className="muted">
        Prepare a empresa agora e defina seu administrador quando estiver
        pronto.
      </p>
      <div className="organization-admin-grid">
        <ProvisionForm onDone={refresh} />
        <section className="card organization-registry">
          <h2>Empresas cadastradas</h2>
          {organizations.map((o) => (
            <article className="organization-record" key={o.id}>
              <h3>
                <Link to={"/painel/" + o.id}>{o.name}</Link>
              </h3>
              <p className="muted">/empresa/{o.slug}</p>
              <p>
                Código da empresa: <strong>{o.company_code}</strong>
              </p>
              <p>
                <span className="badge">
                  {o.status === "active" ? "Operação habilitada" : "Desativada"}
                </span>
              </p>
              <p>{setupLabels[o.setup_state]}</p>
              <p>
                {o.onboarding_ready
                  ? "Configuração concluída"
                  : "Configuração empresarial incompleta"}
              </p>
              {o.subscription && (
                <p>
                  Assinatura:{" "}
                  {(
                    {
                      active: "ativa",
                      trial: "período de teste",
                      pending: "pendente",
                      past_due: "pendente de pagamento",
                      cancelled: "cancelada",
                      suspended: "suspensa",
                    } as any
                  )[o.subscription.status] || "Em preparação"}
                </p>
              )}
              <div className="org-actions">
                <Link to={"/painel/" + o.id}>Abrir empresa</Link>
                <Link to={"/admin/assinaturas?empresa=" + o.id}>
                  Plano para homologação
                </Link>
                {o.status === "active" &&
                  ["awaiting_admin", "incomplete"].includes(o.setup_state) && (
                    <Link to={"/painel/" + o.id + "/acessos"}>
                      {o.setup_state === "awaiting_admin"
                        ? "Definir administrador"
                        : "Continuar definição do administrador"}
                    </Link>
                  )}
                <button disabled={busy} onClick={() => void status(o)}>
                  {o.status === "active" ? "Desativar" : "Reativar"}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setDeleting(o);
                    setConfirmation("");
                    setError("");
                    setNotice("");
                  }}
                >
                  Excluir empresa
                </button>
              </div>
            </article>
          ))}
          {!organizations.length && <p>Nenhuma empresa disponível.</p>}
        </section>
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {deleting && (
        <div className="organization-delete-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-company-title"
            className="card organization-delete-dialog"
          >
            <h2 id="delete-company-title">
              Excluir permanentemente {deleting.name}?
            </h2>
            <p>
              Esta ação não poderá ser desfeita. Empresas com acessos, histórico
              operacional, trial ou assinatura serão preservadas e devem ser
              desativadas.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                setNotice("");
                try {
                  const result = await rpc<any>("access_delete_organization", {
                    p_org: deleting.id,
                    p_confirmation: confirmation,
                  });
                  if (!result.deleted) throw Error(result.reason);
                  setDeleting(null);
                  setNotice(
                    "Empresa excluída. O registro de auditoria foi preservado.",
                  );
                  await refresh();
                } catch (e) {
                  setError(accessMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="field">
                <span>Para confirmar, digite: {deleting.name}</span>
                <input
                  autoFocus
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  required
                />
              </label>
              {error && (
                <p role="alert" className="notice error">
                  {error}
                </p>
              )}
              <div className="org-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDeleting(null);
                    setError("");
                  }}
                >
                  Cancelar
                </button>
                <button disabled={busy || confirmation !== deleting.name}>
                  Excluir permanentemente
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
