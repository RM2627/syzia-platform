import { useEffect, useState } from "react";
import { rpc, errorMessage } from "../api";
const states: Record<string, string> = {
  new: "Novo",
  contacted: "Em contato",
  qualified: "Qualificado",
  closed: "Encerrado",
  payment_pending: "Aguardando pagamento",
  ready: "Condições preparadas",
  review: "Em análise",
  ineligible: "Período gratuito indisponível",
  completed: "Empresa criada",
  cancelled: "Cancelado",
  active: "Ativo",
  converted: "Convertido",
  ended: "Encerrado",
  suspended: "Suspenso",
};
export function Acquisition() {
  const [data, setData] = useState<any>(),
    [tab, setTab] = useState("leads"),
    [error, setError] = useState(""),
    [round, setRound] = useState(0);
  useEffect(() => {
    rpc("acquisition_context")
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [round]);
  return (
    <>
      <p className="eyebrow">ADMINISTRAÇÃO SYZIA</p>
      <h1>Aquisição</h1>
      <p>Interesses recebidos, cadastros e eventos comerciais da plataforma.</p>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <div className="finance-metrics">
            {[
              ["leads", "Leads recebidos"],
              ["new_registrations", "Empresas criadas pelo site"],
              ["trials", "Trials pelo site"],
              ["real_conversions", "Conversões reais"],
              ["simulated_conversions", "Conversões simuladas"],
            ].map(([k, t]) => (
              <article className="card" key={k}>
                <span>{t}</span>
                <strong>{data.indicators[k]}</strong>
              </article>
            ))}
          </div>
          <p>
            Indicadores de aquisição registrados nesta versão. Simulações são
            identificadas e não representam receita.
          </p>
          <div className="button-row" role="group" aria-label="Aquisição">
            {[
              ["leads", "Leads"],
              ["registrations", "Novos cadastros"],
              ["trials", "Trials"],
              ["conversions", "Conversões"],
            ].map(([k, t]) => (
              <button
                key={k}
                aria-pressed={tab === k}
                onClick={() => setTab(k)}
              >
                {t}
              </button>
            ))}
          </div>
          {!data[tab]?.length && <p>Nenhum registro nesta área.</p>}
          {data[tab]?.map((r: any, i: number) => (
            <article className="card" key={r.id || i}>
              <h2>{r.name}</h2>
              {tab === "leads" ? (
                <>
                  <p>
                    {r.company} · {r.email} · {r.phone}
                  </p>
                  <p>{r.interest}</p>
                  {data.can_manage ? (
                    <label>
                      Situação
                      <select
                        value={r.state}
                        onChange={async (e) => {
                          try {
                            await rpc("acquisition_lead_update", {
                              p_id: r.id,
                              p_revision: r.revision,
                              p_state: e.target.value,
                            });
                            setRound((n) => n + 1);
                          } catch (e) {
                            setError(errorMessage(e));
                          }
                        }}
                      >
                        {["new", "contacted", "qualified", "closed"].map(
                          (k) => (
                            <option key={k} value={k}>
                              {states[k]}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  ) : (
                    <p>{states[r.state]}</p>
                  )}
                </>
              ) : (
                <>
                  <p>
                    {states[r.state] || r.event || "Conversão"}
                    {r.person ? " · " + r.person : ""}
                  </p>
                  {r.ends_at && (
                    <p>Até {new Date(r.ends_at).toLocaleDateString("pt-BR")}</p>
                  )}
                  {r.simulation && <p>Demonstração / simulação</p>}
                </>
              )}
              <small>
                {r.created_at
                  ? new Date(r.created_at).toLocaleString("pt-BR")
                  : ""}
              </small>
            </article>
          ))}
        </>
      )}
    </>
  );
}
