import { FinancialMetrics, PeriodFilters } from "../finance/Finance";
import { PlatformMetrics, type PlatformData } from "./PlatformOverview";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { rpc, errorMessage } from "../api";
import { Metric, Skeleton, Empty } from "../ui/Primitives";
import "./analytics.css";
type Period = { timezone: string; first_day: string; last_day: string };
type Group = { name: string; requests: number; conversions: number };
type CompanyData = {
  period: Period;
  generated_at: string;
  totals: Record<string, number>;
  execution?: { completed: number };
  financial?: Record<string, any>;
  values?: {
    quoted_cents: number;
    approved_cents: number;
    unpriced_quotes: number;
  };
  followups: { tasks: number; attempts: number };
  services: Group[];
  sources: Group[];
  trend: { day: string; opportunities: number; conversions: number }[];
  filters: { services: { id: string; name: string }[] };
};
type CentralData = {
  period: Period;
  generated_at: string;
  tickets: number;
  resolved: number;
  answered: number;
  unanswered: number;
  first_response_seconds: number | null;
  median_response_seconds: number | null;
  sla: {
    reference_minutes: number | null;
    within: number | null;
    breached: number | null;
  };
  live: {
    queued: number;
    open: number;
    assigned: number;
    waiting_company: number;
  };
};
const fmt = new Intl.NumberFormat("pt-BR");
const money = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n / 100,
  );
const sources: Record<string, string> = {
  instagram: "Instagram",
  google: "Google",
  referral: "Indicação",
  whatsapp: "WhatsApp",
  direct: "Direto",
  other: "Outra origem",
  unknown: "Não informada",
};
const now = new Date();
const day = (d: Date) => d.toISOString().slice(0, 10);
function Breakdown({
  title,
  groups,
  origin = false,
}: {
  title: string;
  groups: Group[];
  origin?: boolean;
}) {
  const max = Math.max(1, ...groups.map((x) => x.requests));
  return (
    <section className="ds-panel">
      <h2>{title}</h2>
      {!groups.length ? (
        <Empty title="Ainda sem registros">
          Os dados aparecerão conforme as oportunidades forem criadas.
        </Empty>
      ) : (
        <ul className="a-breakdown">
          {groups.map((g) => (
            <li key={g.name}>
              <div>
                <strong>{origin ? sources[g.name] || g.name : g.name}</strong>
                <span>
                  {fmt.format(g.requests)} oportunidades ·{" "}
                  {fmt.format(g.conversions)} conversões
                </span>
              </div>
              <meter min={0} max={max} value={g.requests} aria-label={g.name} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
export function Analytics({
  org,
  name,
  platform = false,
  operational = false,
}: {
  org?: string;
  name?: string;
  platform?: boolean;
  operational?: boolean;
}) {
  const [from, setFrom] = useState(
      day(new Date(now.getTime() - 29 * 86400000)),
    ),
    [to, setTo] = useState(day(now)),
    [service, setService] = useState(""),
    [source, setSource] = useState(""),
    [company, setCompany] = useState<CompanyData | null>(null),
    [central, setCentral] = useState<CentralData | null>(null),
    [admin, setAdmin] = useState<PlatformData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [round, setRound] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const n = ++generation.current;
    setCompany(null);
    setCentral(null);
    setAdmin(null);
    setError("");
    setLoading(true);
    const valid = () => n === generation.current;
    async function load() {
      try {
        if (
          !from ||
          !to ||
          from > to ||
          (+new Date(to) - +new Date(from)) / 86400000 > 365
        )
          throw Error("invalid_analytics_period");
        if (platform) {
          const d = await rpc<PlatformData>("analytics_platform", {
            p_from: from,
            p_to: to,
          });
          if (valid()) setAdmin(d);
        } else {
          const args = { p_org: org, p_from: from, p_to: to };
          const [c, t] = await Promise.all([
            operational
              ? Promise.resolve(null)
              : rpc<CompanyData>("analytics_company", {
                  ...args,
                  p_service: service || null,
                  p_source: source || null,
                }),
            rpc<CentralData>("analytics_central", args),
          ]);
          if (valid()) {
            setCompany(c);
            setCentral(t);
          }
        }
      } catch (e) {
        if (valid())
          setError(
            (e as Error).message === "invalid_analytics_period"
              ? "Escolha um período válido de até 366 dias."
              : errorMessage(e),
          );
      } finally {
        if (valid()) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => setRound((r) => r + 1), 60000);
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [org, platform, operational, from, to, service, source, round]);
  return (
    <div className="analytics">
      {org && (
        <nav className="a-breadcrumb" aria-label="Navegação da empresa">
          <Link to={"/painel/" + org}>Empresa</Link>
          <span>/</span>
          <span>
            {operational
              ? "Indicadores de atendimento"
              : "Métricas e resultados"}
          </span>
          <Link to={"/painel/" + org + "/comercial"}>Comercial ↗</Link>
        </nav>
      )}
      <header className="a-heading">
        <div>
          <p className="eyebrow">
            {platform
              ? "VISÃO DA PLATAFORMA"
              : name || "INTELIGÊNCIA DA OPERAÇÃO"}
          </p>
          <h1>Clareza para o próximo passo.</h1>
          <p className="muted">
            {platform
              ? "Capacidade e utilização. Sem cobrança ou previsão de receita."
              : "O que chega, o que avança e onde seu atendimento precisa de atenção."}
          </p>
        </div>
        <button onClick={() => setRound((r) => r + 1)} disabled={loading}>
          Atualizar indicadores ↻
        </button>
      </header>
      <form className="a-filters" onSubmit={(e) => e.preventDefault()}>
        <label>
          De
          <input
            aria-label="Data inicial"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Até
          <input
            aria-label="Data final"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {!platform && !operational && (
          <>
            <label>
              Serviço
              <select
                aria-label="Serviço"
                value={service}
                onChange={(e) => setService(e.target.value)}
              >
                <option value="">Todos os serviços</option>
                {company?.filters.services.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Origem
              <select
                aria-label="Origem"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="">Todas as origens</option>
                {Object.entries(sources).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </form>
      {error && (
        <div role="alert" className="notice error">
          {error}
          <button onClick={() => setRound((r) => r + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
      {loading && <Skeleton />}
      {admin && <PlatformMetrics data={admin} />}
      {company && (
        <>
          <p className="a-note">
            {company.period.timezone} · Oportunidades criadas de{" "}
            {company.period.first_day.split("-").reverse().join("/")} a{" "}
            {company.period.last_day.split("-").reverse().join("/")}. Progresso
            registrado até o fim do período.
          </p>
          <div className="a-metrics">
            <Metric
              label="Oportunidades"
              value={fmt.format(company.totals.opportunities)}
              detail="Interesses iniciados no período"
            />
            <Metric
              label="Conversões comerciais"
              value={fmt.format(company.totals.conversions)}
              detail="Conforme critério registrado, não receita"
              accent
            />
            <Metric
              label="Taxa de conversão"
              value={fmt.format(company.totals.conversion_percent) + "%"}
              detail="Conversões ÷ oportunidades"
            />
            <Metric
              label="Perdas e encerramentos"
              value={company.totals.losses}
              detail="Oportunidades com evento de encerramento"
            />
          </div>
          <PeriodFilters
            from={from}
            to={to}
            setFrom={setFrom}
            setTo={setTo}
            timezone={company.period.timezone}
          />
          {company.execution && (
            <p className="notice">
              <strong>
                {company.execution.completed} serviços concluídos no período.
              </strong>{" "}
              Contagem pela data de conclusão. Concluir serviço não registra
              pagamento ou receita.
            </p>
          )}
          {!company.totals.opportunities && (
            <Empty title="Um novo período, novas possibilidades">
              Não há oportunidades com estes filtros. Experimente outro período
              ou aguarde novas solicitações.
            </Empty>
          )}
          {company.financial && (
            <section>
              <h2>Financeiro empresarial</h2>
              <p>
                Totais da empresa no período selecionado. Filtros de serviço e
                origem se aplicam aos indicadores operacionais abaixo.
              </p>
              <FinancialMetrics data={company.financial} />
            </section>
          )}
          <div className="a-two">
            <section className="ds-panel">
              <div className="a-panel-heading">
                <h2>Do interesse à conversão</h2>
                <span className="badge">Eventos reais</span>
              </div>
              <ol className="a-funnel">
                {[
                  ["opportunities", "Interesses"],
                  ["requests", "Solicitações enviadas"],
                  ["quotes", "Propostas finais enviadas"],
                  ["approvals", "Aprovações"],
                  ["bookings", "Agendamentos"],
                  ["conversions", "Conversões"],
                ].map(([k, label], i) => (
                  <li key={k}>
                    <span className="a-step">0{i + 1}</span>
                    <div>
                      <span>{label}</span>
                      <meter
                        min={0}
                        max={Math.max(1, company.totals.opportunities)}
                        value={company.totals[k]}
                        aria-label={label}
                      />
                    </div>
                    <strong>{company.totals[k]}</strong>
                  </li>
                ))}
              </ol>
              <p className="a-note">
                Etapas podem ser puladas no agendamento direto. Cada
                oportunidade conta uma vez por etapa; perdas e conversões podem
                coexistir após reabertura.
              </p>
            </section>
            {company.values && (
              <section className="ds-panel">
                <h2>Valores comerciais</h2>
                <div className="a-value">
                  <span>Última proposta final enviada</span>
                  <strong>{money(company.values.quoted_cents)}</strong>
                </div>
                <div className="a-value">
                  <span>Propostas aprovadas</span>
                  <strong>{money(company.values.approved_cents)}</strong>
                </div>
                <p className="a-note">
                  Sem somar revisões da mesma proposta. Valores comerciais não
                  representam faturamento ou recebimentos.
                </p>
                {company.values.unpriced_quotes > 0 && (
                  <p>
                    {company.values.unpriced_quotes} proposta(s) sem valor
                    definido.
                  </p>
                )}
              </section>
            )}
          </div>
          <section className="ds-panel">
            <h2>Oportunidades ao longo do período</h2>
            <div
              className="a-trend"
              role="img"
              aria-label="Volume diário de oportunidades. Dados exatos disponíveis na tabela abaixo."
            >
              {company.trend.map((d) => (
                <div key={d.day} title={d.day + ": " + d.opportunities}>
                  <span
                    style={{
                      height:
                        Math.max(
                          2,
                          (100 * d.opportunities) /
                            Math.max(
                              1,
                              ...company.trend.map((x) => x.opportunities),
                            ),
                        ) + "%",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="a-axis">
              <span>{from}</span>
              <span>{to}</span>
            </div>
            <details>
              <summary>Ver dados diários em tabela</summary>
              <div className="a-table">
                <table>
                  <thead>
                    <tr>
                      <th>Dia local</th>
                      <th>Oportunidades</th>
                      <th>Convertidas até o fim do período</th>
                    </tr>
                  </thead>
                  <tbody>
                    {company.trend.map((d) => (
                      <tr key={d.day}>
                        <td>{d.day}</td>
                        <td>{d.opportunities}</td>
                        <td>{d.conversions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <div className="a-two">
            <Breakdown title="Serviços procurados" groups={company.services} />
            <Breakdown
              title="Como os clientes chegam"
              groups={company.sources}
              origin
            />
          </div>
          <section className="ds-panel">
            <h2>Acompanhamento comercial</h2>
            <div className="a-metrics">
              <Metric
                label="Tarefas de retorno criadas"
                value={company.followups.tasks}
              />
              <Metric
                label="Tentativas registradas"
                value={company.followups.attempts}
              />
              <Metric
                label="Conversões após tentativa"
                value={company.totals.recoveries}
                detail="Associação temporal; não prova de causalidade"
              />
            </div>
          </section>
        </>
      )}
      {central && (
        <section className="ds-panel">
          <div className="a-panel-heading">
            <div>
              <p className="eyebrow">ATENDIMENTO HUMANO</p>
              <h2>Uma operação com mais atenção.</h2>
            </div>
            <span className="badge">{central.period.timezone}</span>
          </div>
          <p className="a-note">
            Atendimentos criados no período. Indicadores operacionais usam todas
            as origens e serviços.
          </p>
          <div className="a-metrics">
            <Metric label="Atendimentos" value={central.tickets} />
            <Metric
              label="Resolvidos até o fim do período"
              value={central.resolved}
            />
            <Metric
              label="Primeira resposta média"
              value={
                central.first_response_seconds === null
                  ? "—"
                  : fmt.format(
                      Math.round(central.first_response_seconds / 60),
                    ) + " min"
              }
              detail={central.answered + " atendimentos respondidos"}
            />
            <Metric label="Sem primeira resposta" value={central.unanswered} />
          </div>
          <div className="a-operational">
            <div>
              <h3>Fila agora</h3>
              <p>
                <strong>{central.live.queued}</strong> na fila ·{" "}
                {central.live.assigned} atribuídos · {central.live.open} abertos
                · {central.live.waiting_company} aguardando empresa
              </p>
            </div>
            <div>
              <h3>Referência de resposta</h3>
              {central.sla.reference_minutes === null ? (
                <p>Prazo ainda não configurado na Central.</p>
              ) : (
                <p>
                  {central.sla.within} dentro de {central.sla.reference_minutes}{" "}
                  min · {central.sla.breached} acima da referência
                </p>
              )}
              <small>
                Tempo corrido desde a primeira mensagem. Comparação com a
                configuração atual, sem reconstrução de SLA contratual
                histórico.
              </small>
            </div>
          </div>
        </section>
      )}
      {(company || central) && (
        <p className="a-note">
          Atualizado às{" "}
          {new Date((company || central)!.generated_at).toLocaleTimeString(
            "pt-BR",
          )}{" "}
          · Atualização automática a cada minuto
        </p>
      )}
    </div>
  );
}
