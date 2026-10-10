import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { rpc, errorMessage } from "../api";
import { Metric } from "../ui/Primitives";
import "./analytics.css";
const metrics = {
  organizations: "Empresas cadastradas",
  active_organizations: "Empresas ativas agora",
  in_setup: "Configuração incompleta",
  without_admin: "Sem ADM responsável",
  suspended_organizations: "Empresas suspensas",
  trial_organizations: "Empresas em trial",
  subscribers: "Assinaturas ativas (simulação)",
  new_organizations: "Novas empresas no período",
  activations: "Ativações no período",
  pending_activations: "Aguardando primeiro acesso",
  active_enterprise_users: "Usuários empresariais habilitados",
  recent_users: "Usuários com atividade há menos de 30 min",
  trials_started: "Trials iniciados no período",
  trial_cohort_converted: "Convertidos entre os trials iniciados",
  trials_expired: "Trials expirados no período",
  trial_extensions: "Extensões no período",
  published_organizations: "Páginas publicadas",
  requests: "Solicitações no período",
  tickets: "Atendimentos no período",
  appointments: "Reservas criadas no período",
  support_pending: "Solicitações de suporte pendentes",
  support_active: "Autorizações de suporte ativas",
  emergencies: "Emergências no período",
  delivery_failures: "Últimas entregas com falha no período",
} satisfies Record<string, string>;
export type PlatformData = Record<keyof typeof metrics, number> & {
  plans: { id: string; name: string; subscriptions: number }[];
  attention: {
    id: string;
    name: string;
    status: string;
    code: string;
    without_admin: boolean;
    in_setup: boolean;
    support_pending: number;
  }[];
};
export function PlatformMetrics({
  data,
  compact = false,
}: {
  data: PlatformData;
  compact?: boolean;
}) {
  const selected = compact
    ? [
        "organizations",
        "active_organizations",
        "in_setup",
        "without_admin",
        "trial_organizations",
        "subscribers",
        "support_pending",
        "delivery_failures",
      ]
    : Object.keys(metrics);
  return (
    <>
      <div className="a-metrics">
        {selected.map((key) => (
          <Metric
            key={key}
            label={metrics[key as keyof typeof metrics]}
            value={data[key as keyof typeof metrics] ?? 0}
          />
        ))}
      </div>
      <p className="a-note">
        Estoque atual e eventos do período em UTC. Ativações contam contas
        empresariais. Reservas incluem cancelamentos posteriores. Assinaturas e
        conversões comerciais são simulações; receita real ainda indisponível.
      </p>
      {!compact && (
        <section className="card">
          <h2>Distribuição por plano</h2>
          <ul>
            {data.plans?.map((p) => (
              <li key={p.id}>
                {p.name}: {p.subscriptions} assinatura(s) em trial ou ativa(s)
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card">
        <h2>Empresas que precisam de atenção</h2>
        {!data.attention?.length ? (
          <p>Nenhuma pendência administrativa identificada.</p>
        ) : (
          <>
            <p className="muted">
              Até 50 empresas, das mais recentes às mais antigas.
            </p>
            {data.attention.map((o) => (
              <article className="organization-record" key={o.id}>
                <h3>{o.name}</h3>
                <p>Código SYZIA: {o.code}</p>
                <p>
                  {[
                    o.status !== "active" && "Suspensa",
                    o.without_admin && "Sem ADM responsável",
                    o.in_setup && "Configuração incompleta",
                    o.support_pending > 0 &&
                      `${o.support_pending} suporte(s) aguardando decisão`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <Link to="/admin/empresas">
                  Consultar cadastro administrativo
                </Link>
              </article>
            ))}
          </>
        )}
      </section>
    </>
  );
}
export function PlatformHome() {
  const [data, setData] = useState<PlatformData | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    const now = new Date();
    void rpc<PlatformData>("analytics_platform", {
      p_from: new Date(now.getTime() - 29 * 86400000)
        .toISOString()
        .slice(0, 10),
      p_to: now.toISOString().slice(0, 10),
    })
      .then((v) => {
        if (current) setData(v);
      })
      .catch((e) => {
        if (current) setError(errorMessage(e));
      });
    return () => {
      current = false;
    };
  }, []);
  return (
    <section aria-label="Administração SYZIA">
      <p className="eyebrow">ADMINISTRAÇÃO SYZIA</p>
      <h2>Como a SYZIA está indo?</h2>
      <p>Saúde da plataforma e pendências administrativas · últimos 30 dias.</p>
      {error && <p role="alert">{error}</p>}
      {data ? (
        <PlatformMetrics data={data} compact />
      ) : (
        !error && <p role="status">Carregando indicadores…</p>
      )}
      <Link to="/admin/metricas">Ver métricas globais e escolher período</Link>
    </section>
  );
}
