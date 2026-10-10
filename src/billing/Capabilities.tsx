import { useEffect, useState, type FormEvent } from "react";
import { rpc, errorMessage } from "../api";
export function Capabilities({
  org,
  global = false,
  onChange,
  snapshot,
}: {
  org: string;
  global?: boolean;
  onChange?: () => void;
  snapshot?: { org: string; data: any };
}) {
  const [localData, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => rpc("billing_capabilities", { p_org: org }).then(setData);
  const controlled = snapshot !== undefined;
  const data = controlled
    ? snapshot.org === org
      ? snapshot.data
      : null
    : localData;
  useEffect(() => {
    if (controlled) return;
    setData(null);
    void load().catch((e) => setError(errorMessage(e)));
  }, [org, controlled]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (data.exemption)
        await rpc("billing_exemption_revoke", {
          p_org: org,
          p_id: data.exemption.id,
          p_reason: f.get("reason"),
        });
      else
        await rpc("billing_exemption_set", {
          p_org: org,
          p_kind: f.get("kind"),
          p_capabilities: {
            software: true,
            human_support: f.has("human"),
            commercial_followups: f.has("commercial"),
          },
          p_reason: f.get("reason"),
          p_key: crypto.randomUUID(),
        });
      if (!controlled) await load();
      await onChange?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>Capacidades da empresa</h2>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {data && (
        <>
          <p>
            {data.exemption
              ? "Empresa interna/isenta — fora do ciclo de trial e assinatura."
              : data.commercial_state === "setup"
                ? "Configuração empresarial. Nenhuma isenção comercial foi concedida."
                : "Capacidades conforme o plano e a situação atual."}
          </p>
          <ul>
            <li>
              Software:{" "}
              {data.software ? "disponível" : "aguardando liberação comercial"}
            </li>
            <li>Financeiro: {data.finance ? "disponível" : "não incluído"}</li>
            <li>
              Métricas: {data.analytics ? "disponíveis" : "não incluídas"}
            </li>
            <li>
              Suporte compartilhado no atendimento:{" "}
              {data.human_support ? "incluído" : "não incluído"}
            </li>
            <li>
              Retornos comerciais:{" "}
              {data.commercial_followups ? "disponíveis" : "não incluídos"}
            </li>
          </ul>
          {global && (
            <details>
              <summary>
                {data.exemption
                  ? "Revogar isenção"
                  : "Conceder condição interna/isenta"}
              </summary>
              <p>
                A gestão operacional pela SYZIA não concede isenção
                automaticamente. Esta decisão será auditada.
              </p>
              <form onSubmit={save}>
                <fieldset disabled={busy} className="form-reset">
                  {!data.exemption && (
                    <>
                      <label className="field">
                        Condição
                        <select name="kind">
                          <option value="internal">Empresa interna</option>
                          <option value="exempt">Empresa isenta</option>
                        </select>
                      </label>
                      <label className="check-field">
                        <input name="human" type="checkbox" />
                        Incluir atendimento compartilhado
                      </label>
                      <label className="check-field">
                        <input
                          name="commercial"
                          type="checkbox"
                          defaultChecked
                        />
                        Incluir retornos comerciais
                      </label>
                    </>
                  )}
                  <label className="field">
                    Justificativa
                    <input
                      name="reason"
                      minLength={10}
                      maxLength={500}
                      required
                    />
                  </label>
                  <button className="primary">
                    {data.exemption
                      ? "Confirmar revogação"
                      : "Conceder condição"}
                  </button>
                </fieldset>
              </form>
            </details>
          )}
        </>
      )}
    </section>
  );
}
