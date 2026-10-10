import { MercadoPagoBilling } from "./MercadoPago";
import { supportBenefit, supportDescription, supportPlanDescription } from "../availability/support-copy";
import { AssistedPolicy } from "../availability/Availability";
import { Capabilities } from "./Capabilities";
import { TrialPanel, type TrialData } from "./Trial";
import { PlanEditor } from "./PlanEditor";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { rpc, errorMessage } from "../api";
import { Skeleton, Empty } from "../ui/Primitives";
import "./billing.css";
import { Homologation, FeaturedPlan } from "./Homologation";
type Version = {
  id: string;
  price_cents: number;
  interval_months: number;
  trial_days: number;
  human_support: boolean;
  commercial_followups: boolean;
  member_limit: number | null;
  service_limit: number | null;
  request_limit: number | null;
  ticket_limit: number | null;
  followup_limit: number | null;
  name?: string;
  capabilities?: Record<string, boolean>;
  quota_semantics?: number;
};
export type Plan = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  available: boolean;
  site_visible?: boolean;
  self_service?: boolean;
  self_service_trial?: boolean;
  featured?: boolean;
  featured_label?: string;
  position: number;
  revision: number;
  version: Version;
};
type Subscription = {
  revision: number;
  state: string;
  effective_state: string;
  period_end: string;
  period_start: string;
  cancel_at_end: boolean;
  plan: Version;
  pending_plan: Version | null;
};
type Invoice = {
  is_simulation?: boolean;
  id: string;
  state: string;
  amount_cents: number;
  due_at: string;
  created_at: string;
  purpose: string;
};
type Context = {
  trial?: TrialData;
  subscription: Subscription | null;
  catalog: Plan[];
  usage: Record<string, number | string>;
  invoices: Invoice[];
  events: {
    event: string;
    created_at: string;
    details: Record<string, unknown>;
  }[];
  mock_enabled: boolean;
};
type Overview = {
  plans: Plan[];
  organizations: {
    id: string;
    name: string;
    state: string | null;
    effective_state: string | null;
    plan_name: string | null;
    period_end: string | null;
  }[];
  mock_enabled: boolean;
};
const currency = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n / 100,
  );
const when = (n: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeZone: "America/Recife",
  }).format(new Date(n));
const states: Record<string, string> = {
  trial: "Em avaliação",
  active: "Ativa",
  pending: "Pendente",
  past_due: "Pagamento pendente",
  expired: "Período encerrado",
  cancelled: "Cancelada",
  suspended: "Suspensa",
  paid: "Pagamento confirmado",
  failed: "Falhou",
  overdue: "Vencida",
  refunded: "Reembolsada",
};
const history: Record<string, string> = {
  trial_started: "Período de avaliação iniciado",
  trial_extended: "Período gratuito estendido pela administração",
  invoice_created: "Cobrança criada",
  mock_paid: "Pagamento confirmado em simulação",
  mock_failed: "Pagamento falhou em simulação",
  mock_overdue: "Cobrança vencida em simulação",
  mock_cancelled: "Cobrança cancelada em simulação",
  mock_refunded: "Reembolso registrado em simulação",
  cancel: "Cancelamento solicitado",
  reactivate: "Cancelamento desfeito",
  cancel_invoice: "Cobrança pendente cancelada",
  plan_change_scheduled: "Alteração agendada",
  suspended: "Assinatura suspensa",
  suspension_released: "Suspensão retirada — renovação necessária",
};
const units = [
  ["members", "Membros ativos", "member_limit"],
  ["services", "Serviços ativos", "service_limit"],
  ["requests", "Solicitações no mês", "request_limit"],
  ["tickets", "Atendimentos no mês", "ticket_limit"],
  ["followups", "Tentativas no mês", "followup_limit"],
] as const;
function Features({ v }: { v: Version }) {
  return (
    <ul className="b-features">
      <li>Página profissional, orçamento e agenda</li>
      <li>Clientes, acompanhamento, equipe e permissões</li>
      <li>
        Financeiro:{" "}
        {v.capabilities?.finance === false ? "não incluído" : "incluído"}
      </li>
      <li>
        Métricas:{" "}
        {v.capabilities?.analytics === false ? "não incluídas" : "incluídas"}
      </li>
      <li>
        {v.human_support
          ? supportBenefit
          : "Atendimento pela própria empresa"}
      </li>
      <li>
        {v.commercial_followups
          ? "Operação de follow-up incluída"
          : "Sem novas tentativas de follow-up"}
      </li>
      {units
        .filter(([key]) => key !== "tickets")
        .filter(
          ([, , k]) =>
            v.quota_semantics !== 2 ||
            !["ticket_limit", "followup_limit"].includes(k) ||
            (v.human_support &&
              (k !== "followup_limit" || v.commercial_followups)),
        )
        .map(([, label, k]) => (
          <li key={k}>
            {v[k] === null ? "Ilimitado" : v[k]} ·{" "}
            {v.quota_semantics === 2 && k === "ticket_limit"
              ? "atendimentos humanos SYZIA no mês"
              : v.quota_semantics === 2 && k === "followup_limit"
                ? "tentativas humanas SYZIA no mês"
                : label.toLowerCase()}
          </li>
        ))}
      {v.human_support && (
        <li>
          {supportDescription} O limite é configurado por ciclo.
        </li>
      )}
    </ul>
  );
}
export function Billing({
  org,
  name,
  platform = false,
}: {
  org?: string;
  name?: string;
  capabilities?: Record<string, boolean>;
  quota_semantics?: number;
  platform?: boolean;
}) {
  const [data, setData] = useState<Context | null>(null),
    [overview, setOverview] = useState<Overview | null>(null),
    [selected, setSelected] = useState(
      org || new URLSearchParams(location.search).get("empresa") || "",
    ),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [editing, setEditing] = useState<Plan | null | undefined>(undefined),
    [confirmation, setConfirmation] = useState<{
      action: string;
      plan: string | null;
      text: string;
    } | null>(null);
  const [trialDocument, setTrialDocument] = useState(""),
    [trialKind, setTrialKind] = useState("CPF");
  const [capabilityState, setCapabilities] = useState<{
    org: string | undefined;
    data: any;
  } | null>(null);
  const generation = useRef(0),
    pending = useRef<{
      signature: string;
      key: string;
      revision: number;
    } | null>(null);
  const scope = platform ? selected : org;
  const capabilities =
    capabilityState?.org === scope ? capabilityState?.data : null;
  const internal = Boolean(capabilities?.exemption);
  async function refresh() {
    const g = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const [o, d, cap] = await Promise.all([
        platform
          ? rpc<Overview>("billing_admin_overview")
          : Promise.resolve(null),
        scope
          ? rpc<Context>("billing_context", { p_org: scope })
          : Promise.resolve(null),
        scope
          ? rpc("billing_capabilities", { p_org: scope })
          : Promise.resolve(null),
      ]);
      if (g !== generation.current) return;
      setOverview(o);
      setData(d);
      setCapabilities({ org: scope, data: cap });
    } catch (e) {
      if (g === generation.current) {
        setData(null);
        setOverview(null);
        setCapabilities(null);
        setError(errorMessage(e));
      }
    } finally {
      if (g === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    setData(null);
    setConfirmation(null);
    setNotice("");
    pending.current = null;
    void refresh();
    const id = setInterval(() => void refresh(), 60000);
    return () => {
      generation.current++;
      clearInterval(id);
    };
  }, [scope, platform]);
  async function run(fn: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(success);
      setConfirmation(null);
      pending.current = null;
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
      await refresh();
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function act() {
    if (!confirmation || !scope) return;
    const revision = data?.subscription?.revision || 0;
    const signature = JSON.stringify([
      scope,
      confirmation.action,
      confirmation.plan,
    ]);
    if (pending.current?.signature !== signature)
      pending.current = { signature, key: crypto.randomUUID(), revision };
    const key = pending.current.key;
    await run(
      () =>
        rpc<any>(
          confirmation.action === "trial"
            ? "billing_trial_confirm"
            : "billing_subscription_action",
          {
            ...(confirmation.action === "trial"
              ? { p_kind: trialKind, p_document: trialDocument }
              : { p_action: confirmation.action }),
            p_org: scope,
            p_plan: confirmation.plan,
            p_revision: pending.current!.revision,
            p_key: key,
          },
        ).then((result) => {
          if (result?.review_required) throw Error("trial_review_required");
          if (result?.eligible === false) throw Error("trial_already_used");
        }),
      "Alteração registrada. Confira a situação atual abaixo.",
    );
  }
  useEffect(() => {
    if (confirmation)
      document.querySelector(".b-confirm")?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
  }, [confirmation]);
  if (!platform && scope && data && !data.mock_enabled && !internal && !(data as any).homologation) return <MercadoPagoBilling org={scope} />;
  const sub = data?.subscription,
    plans = platform ? overview?.plans : data?.catalog;
  return (
    <div className="billing">
      <div className="b-heading">
        <div>
          <p className="eyebrow">
            {platform ? "GESTÃO DA PLATAFORMA" : name || "SUA EMPRESA"}
          </p>
          <h1>
            {platform ? "Planos e assinaturas" : "Seu plano, sua operação."}
          </h1>
          <p className="muted">
            {platform
              ? "Ofertas, utilização e ciclo de assinatura em um só lugar."
              : "Acompanhe seus recursos, limites e próximos passos."}
          </p>
        </div>
        <button onClick={() => void refresh()} disabled={busy || loading}>
          Atualizar
        </button>
      </div>
      <div className="b-simulation">
        <strong>Cobrança em preparação</strong>
        <span>
          A configuração de planos está disponível. O checkout será liberado
          após a integração do provedor de cobrança.
        </span>
      </div>
      <AssistedPolicy platform={platform} org={scope} />
      {platform && scope && overview && (
        <Homologation
          org={scope}
          current={(data as any)?.homologation}
          versions={(overview as any).plan_versions || []}
          onChange={() => void refresh()}
        />
      )}
      {!platform && (data as any)?.homologation && (
        <section className="ds-panel">
          <strong>Plano aplicado para homologação</strong>
          <p>
            {(data as any).homologation.plan.name} · versão{" "}
            {(data as any).homologation.plan.version}. Não representa assinatura
            ou pagamento.
          </p>
        </section>
      )}
      {scope && (
        <Capabilities
          key={scope}
          org={scope}
          global={platform}
          snapshot={{ org: scope, data: capabilities }}
          onChange={refresh}
        />
      )}
      {error && (
        <div role="alert" className="notice error">
          {error}
          <button disabled={busy} onClick={() => void refresh()}>
            Tentar novamente
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {loading && !data && !overview && <Skeleton />}
      {platform && overview && (
        <>
          <div className="b-admin-toolbar">
            <label>
              Empresa
              <select
                aria-label="Empresa da assinatura"
                disabled={busy}
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Visão geral</option>
                {overview.organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <Link className="button" to="/admin/metricas">
              Métricas da plataforma ↗
            </Link>
            <button onClick={() => setEditing(null)}>Criar plano</button>
          </div>
          {!selected && (
            <section className="ds-panel">
              <h2>Assinaturas das empresas</h2>
              <div className="b-table">
                <table>
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Plano</th>
                      <th>Situação</th>
                      <th>Período até</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.organizations.map((o) => (
                      <tr key={o.id}>
                        <td>{o.name}</td>
                        <td>{o.plan_name || "Sem adesão"}</td>
                        <td>
                          <span className="badge">
                            {states[o.effective_state || ""] ||
                              "Não contratada"}
                          </span>
                        </td>
                        <td>{o.period_end ? when(o.period_end) : "—"}</td>
                        <td>
                          <button onClick={() => setSelected(o.id)}>
                            Ver assinatura
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted">
                {overview.organizations.length} empresas nesta visão
                {overview.organizations.length === 500
                  ? " · limite de 500 atingido"
                  : ""}
                .
              </p>
            </section>
          )}
        </>
      )}
      {data && !internal && (
        <>
          {!platform && (
            <nav className="b-links" aria-label="Navegação da assinatura">
              <Link to={"/painel/" + org}>← Empresa</Link>
              <Link to={"/painel/" + org + "/metricas"}>
                Métricas e resultados ↗
              </Link>
            </nav>
          )}
          {sub ? (
            <section className="b-current ds-panel">
              <div>
                <p className="eyebrow">PLANO ATUAL</p>
                <h2>{sub.plan.name}</h2>
                <span className={"badge b-state-" + sub.effective_state}>
                  {states[sub.effective_state]}
                </span>
                <p>
                  <strong>{currency(sub.plan.price_cents)}</strong> /{" "}
                  {sub.plan.interval_months === 1
                    ? "mês"
                    : sub.plan.interval_months + " meses"}{" "}
                </p>
                <p className="muted">
                  Período de {when(sub.period_start)} até {when(sub.period_end)}
                  .
                </p>
                {sub.cancel_at_end && (
                  <p role="status">
                    Cancelamento programado para o fim do período.
                  </p>
                )}
                {sub.pending_plan && (
                  <p role="status">
                    Próxima renovação: {sub.pending_plan.name},{" "}
                    {currency(sub.pending_plan.price_cents)}. O plano atual
                    permanece até lá.
                  </p>
                )}
              </div>
              <div className="b-actions">
                {!sub.cancel_at_end &&
                  ["active", "trial"].includes(sub.effective_state) && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        setConfirmation({
                          action: "cancel",
                          plan: null,
                          text: "Cancelar ao fim do período? Os recursos continuam disponíveis até a data informada. Nenhum dado será excluído.",
                        })
                      }
                    >
                      Cancelar ao fim do período
                    </button>
                  )}
                {sub.cancel_at_end &&
                  ["active", "trial"].includes(sub.effective_state) && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        setConfirmation({
                          action: "reactivate",
                          plan: null,
                          text: "Manter a assinatura após este período? Esta ação desfaz apenas o cancelamento programado.",
                        })
                      }
                    >
                      Manter assinatura
                    </button>
                  )}
                {["expired", "past_due"].includes(sub.effective_state) &&
                  !sub.cancel_at_end && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        setConfirmation({
                          action: "renew",
                          plan: null,
                          text: "Solicitar uma renovação? A ativação depende da confirmação validada da cobrança.",
                        })
                      }
                    >
                      Preparar renovação
                    </button>
                  )}
                {platform && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      const reason = window.prompt(
                        "Motivo administrativo (5 a 300 caracteres). Não inclua dados pessoais.",
                      );
                      if (reason)
                        void run(
                          () =>
                            rpc("billing_admin_state", {
                              p_org: scope,
                              p_revision: sub.revision,
                              p_suspend: sub.state !== "suspended",
                              p_reason: reason,
                            }),
                          "Situação administrativa atualizada.",
                        );
                    }}
                  >
                    {sub.state === "suspended"
                      ? "Retirar suspensão"
                      : "Suspender assinatura"}
                  </button>
                )}
              </div>
            </section>
          ) : (
            <Empty title="Escolha como sua empresa quer crescer">
              Sua empresa ainda não aderiu a uma assinatura. Compare os recursos
              abaixo; nenhum valor será cobrado.
            </Empty>
          )}
          {data.trial && scope && (
            <TrialPanel
              key={scope}
              data={data.trial}
              org={scope}
              revision={sub?.revision || 0}
              platform={platform}
              busy={busy}
              run={run}
            />
          )}
          <section className="ds-panel">
            <h2>Uso e capacidade</h2>
            <p className="muted">
              Membros e serviços ativos agora. Demais unidades: mês de{" "}
              {String(data.usage.month).slice(0, 7)}, horário de Recife. Uso não
              é receita.
            </p>
            <div className="b-usage">
              {units
                .filter(([key]) => key !== "tickets")
                .map(([key, label, limit]) => {
                  const used = Number(data.usage[key] || 0),
                    max = sub?.plan[limit];
                  return (
                    <div key={key}>
                      <span>
                        {sub?.plan.quota_semantics === 2 && key === "tickets"
                          ? "Atendimentos humanos SYZIA no mês"
                          : sub?.plan.quota_semantics === 2 &&
                              key === "followups"
                            ? "Tentativas humanas SYZIA no mês"
                            : label}
                      </span>
                      <strong>
                        {used.toLocaleString("pt-BR")}{" "}
                        <small>/ {max ?? "Ilimitado"}</small>
                      </strong>
                      {max != null && (
                        <meter
                          aria-label={label}
                          min={0}
                          max={Math.max(max, 1)}
                          value={Math.min(used, Math.max(max, 1))}
                        />
                      )}
                      {max != null && used >= max && (
                        <small className="b-limit">
                          Limite atingido. Amplie o plano ou libere capacidade
                          quando aplicável.
                        </small>
                      )}
                    </div>
                  );
                })}
            </div>
          </section>
          {confirmation && (
            <section
              className="b-confirm ds-panel"
              role="region"
              aria-label="Confirmar alteração"
            >
              <h2>Revise antes de continuar</h2>
              <p>{confirmation.text}</p>
              {confirmation.action === "trial" && (
                <fieldset>
                  <legend>
                    Confirme os dados para verificar sua elegibilidade
                  </legend>
                  <label>
                    Documento
                    <select
                      value={trialKind}
                      onChange={(e) => setTrialKind(e.target.value)}
                    >
                      <option>CPF</option>
                      <option>CNPJ</option>
                    </select>
                  </label>
                  <label>
                    Número do documento
                    <input
                      value={trialDocument}
                      onChange={(e) => setTrialDocument(e.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      maxLength={18}
                    />
                  </label>
                  <p>
                    A confirmação usa o período configurado no plano. Não
                    registra pagamento.
                  </p>
                </fieldset>
              )}
              <div className="b-actions">
                <button
                  disabled={
                    busy ||
                    (confirmation.action === "trial" &&
                      trialDocument.replace(/\D/g, "").length < 11)
                  }
                  onClick={() => void act()}
                >
                  {busy ? "Registrando…" : "Confirmar alteração"}
                </button>
                <button disabled={busy} onClick={() => setConfirmation(null)}>
                  Voltar
                </button>
              </div>
            </section>
          )}
        </>
      )}
      {!platform && !internal && (
        <section className="ds-panel" aria-label="Contratação">
          <h2>Assinar agora</h2>
          <p>
            Compare os planos abaixo. A contratação com pagamento será
            disponibilizada após a configuração e validação do provedor de
            cobrança.
          </p>
          <p className="muted">
            Não há checkout real habilitado neste ambiente. Nenhum clique ou
            retorno de pagamento ativa uma assinatura.
          </p>
          <a href="#planos-disponiveis">Ver planos e recursos</a>
        </section>
      )}
      {plans && (platform || !internal) && (
        <section id="planos-disponiveis">
          <div className="b-section-heading">
            <h2>
              {platform ? "Catálogo de planos" : "Recursos para o seu momento"}
            </h2>
            <span className="muted">Valores em reais · BRL</span>
          </div>
          <div className="b-plans">
            {plans.map((p) => (
              <article
                key={p.id}
                className={
                  "b-plan ds-panel " +
                  (p.version.human_support ? "b-plan-human" : "")
                }
              >
                <span className="eyebrow">
                  {p.version.human_support ? "SOFTWARE + APOIO COMPARTILHADO" : "SOFTWARE"}
                </span>
                <h3>{p.name}</h3>
                <p className="muted">{p.description}</p>
                {p.version.human_support && <p>{supportPlanDescription}</p>}
                <p className="b-price">
                  {currency(p.version.price_cents)}
                  <small>
                    /
                    {p.version.interval_months === 1
                      ? "mês"
                      : p.version.interval_months + " meses"}
                  </small>
                </p>
                <Features v={p.version} />
                {platform ? (
                  <>
                    <span className="badge">
                      {p.active
                        ? p.available
                          ? "Disponível"
                          : "Não ofertado"
                        : "Inativo"}{" "}
                      · versão {p.revision}
                    </span>
                    <button onClick={() => setEditing(p)}>Editar oferta</button>
                    <FeaturedPlan
                      plan={p}
                      previous={plans.find((x) => x.featured && x.site_visible)}
                      onChange={() => void refresh()}
                    />
                    {selected && !internal && p.active && p.available && (
                      <button
                        disabled={
                          busy ||
                          sub?.state === "suspended" ||
                          !(
                            data?.mock_enabled &&
                            import.meta.env.VITE_LOCAL_DEMO === "true"
                          )
                        }
                        onClick={() =>
                          setConfirmation({
                            action: sub ? "change" : "subscribe",
                            plan: p.id,
                            text:
                              "Preparar alteração para " +
                              p.name +
                              "? Valores e regras virão da versão publicada no banco. Nenhuma cobrança real.",
                          })
                        }
                      >
                        Selecionar para empresa
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      disabled={
                        busy ||
                        sub?.state === "suspended" ||
                        !(
                          data?.mock_enabled &&
                          import.meta.env.VITE_LOCAL_DEMO === "true"
                        )
                      }
                      onClick={() =>
                        setConfirmation({
                          action: sub ? "change" : "subscribe",
                          plan: p.id,
                          text:
                            "Selecionar " +
                            p.name +
                            "? Alterações para um valor mensal menor ou outra periodicidade ficam para a renovação; aumento imediato começa um novo período após confirmação, sem pró-rata nesta versão.",
                        })
                      }
                    >
                      {sub ? "Solicitar alteração" : "Selecionar plano"}
                    </button>
                    {!sub && p.version.trial_days > 0 && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          setConfirmation({
                            action: "trial",
                            plan: p.id,
                            text:
                              "Solicitar " +
                              p.version.trial_days +
                              " dias de avaliação? A concessão depende da elegibilidade e pode exigir análise. Confira os dados para verificar a elegibilidade automaticamente.",
                          })
                        }
                      >
                        {p.version.trial_days} dias grátis
                      </button>
                    )}
                  </>
                )}
              </article>
            ))}
          </div>
          {!plans.length && (
            <Empty title="Nenhum plano disponível">
              A administração ainda não disponibilizou uma oferta. Sua
              solicitação não gerou cobrança.
            </Empty>
          )}
        </section>
      )}
      {data && !internal && (
        <>
          <section className="ds-panel">
            <h2>Cobranças</h2>
            <p className="muted">
              Assinatura da plataforma. Pagamentos de consumidores para sua
              empresa pertencem a outro domínio.
            </p>
            {!data.invoices.length ? (
              <p>Nenhuma cobrança gerada.</p>
            ) : (
              <div className="b-invoices">
                {data.invoices.map((i) => (
                  <article key={i.id}>
                    <div>
                      <strong>{currency(i.amount_cents)}</strong>
                      <p>
                        {when(i.created_at)} · vencimento {when(i.due_at)}
                      </p>
                      <span className="badge">{states[i.state]}</span>
                      {i.is_simulation && (
                        <p>Simulação — sem pagamento real.</p>
                      )}
                    </div>
                    <div className="b-actions">
                      {i.state === "pending" && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            setConfirmation({
                              action: "cancel_invoice",
                              plan: null,
                              text: "Cancelar a cobrança pendente? A assinatura atual não será apagada.",
                            })
                          }
                        >
                          Cancelar cobrança
                        </button>
                      )}
                      {platform &&
                        data.mock_enabled &&
                        import.meta.env.VITE_LOCAL_DEMO === "true" &&
                        (i.state === "pending" || i.state === "paid") && (
                          <>
                            <label>
                              Resultado da simulação
                              <select
                                aria-label={"Resultado da simulação " + i.id}
                                id={"result-" + i.id}
                              >
                                {(i.state === "paid"
                                  ? ["refunded"]
                                  : ["paid", "failed", "overdue"]
                                ).map((v) => (
                                  <option value={v} key={v}>
                                    {states[v]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              disabled={busy}
                              onClick={() => {
                                const state = (
                                  document.getElementById(
                                    "result-" + i.id,
                                  ) as HTMLSelectElement
                                ).value;
                                void run(
                                  () =>
                                    rpc("billing_mock_event", {
                                      p_event: crypto.randomUUID(),
                                      p_invoice: i.id,
                                      p_state: state,
                                      p_amount: i.amount_cents,
                                    }),
                                  "Simulação registrada. Não houve movimentação financeira.",
                                );
                              }}
                            >
                              Simular resultado
                            </button>
                          </>
                        )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="ds-panel">
            <h2>Histórico da assinatura</h2>
            {data.events.length ? (
              <ol className="b-history">
                {data.events.map((e, i) => (
                  <li key={i}>
                    <span>
                      {history[e.event] || "Atualização de assinatura"}
                    </span>
                    <time>{when(e.created_at)}</time>
                  </li>
                ))}
              </ol>
            ) : (
              <p>As alterações de assinatura aparecerão aqui.</p>
            )}
          </section>
        </>
      )}
      {platform && editing !== undefined && (
        <PlanEditor
          plan={editing}
          busy={busy}
          close={() => setEditing(undefined)}
          save={async (p) => {
            setBusy(true);
            try {
              await rpc("billing_plan_save", {
                p_id: editing?.id || null,
                p_revision: editing?.revision || 0,
                p_data: p,
              });
              setEditing(undefined);
              setNotice(
                "Nova versão do plano salva. Assinaturas existentes mantêm sua versão.",
              );
              await refresh();
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
