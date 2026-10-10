import { useEffect, useRef, useState, type FormEvent } from "react";
import { rpc, errorMessage } from "../api";
import { Dialog } from "../ui/Dialog";
import type { Plan } from "./Billing";
const money = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n / 100,
  );
const resourceOptions = [
  [
    "finance",
    "Financeiro",
    "Contas, recebimentos, despesas e resultado, conforme os papéis da equipe.",
  ],
  [
    "analytics",
    "Métricas",
    "Indicadores operacionais e comerciais; acesso a valores conforme permissões.",
  ],
  [
    "commercial_followups",
    "Follow-up e recuperação",
    "Retornos, oportunidades e tentativas registradas pela equipe.",
  ],
  [
    "human_support",
    "Suporte compartilhado no atendimento",
    "Elegibilidade para a operação humana, sujeita à configuração e à autonomia da empresa.",
  ],
] as const;
const basic = [
  "Página pública e portfólio",
  "Clientes e acompanhamento do consumidor",
  "Solicitações, orçamentos e agenda",
  "Atendentes próprios e pendências",
  "Membros, papéis e permissões",
];
type Check = {
  consistent: boolean;
  issues: string[];
  mappings: {
    capability: string;
    label: string;
    included: boolean;
    enforced: boolean;
  }[];
};
type TestResult = {
  consistent: boolean;
  rolled_back: boolean;
  checks: {
    label: string;
    expected: boolean;
    allowed: boolean;
    status: string;
    detail?: string;
  }[];
};
export function PlanEditor({
  plan,
  busy,
  close,
  save,
}: {
  plan: Plan | null;
  busy: boolean;
  close: () => void;
  save: (p: Record<string, unknown>) => Promise<void>;
}) {
  const v = plan?.version;
  const form = useRef<HTMLFormElement>(null);

  const [d, setD] = useState<any>({
    name: plan?.name || "",
    description: plan?.description || "",
    price: v ? v.price_cents / 100 : "",
    interval_months: v?.interval_months || 1,
    trial_days: v?.trial_days || 0,
    position: plan?.position || 0,
    active: plan?.active ?? true,
    available: plan?.available ?? false,
    site_visible: plan?.site_visible ?? false,
    self_service: plan?.self_service ?? false,
    self_service_trial: plan?.self_service_trial ?? false,
    quota_semantics: v?.quota_semantics ?? 2,
    member_limit: v?.member_limit ?? null,
    service_limit: v?.service_limit ?? null,
    request_limit: v?.request_limit ?? null,
    ticket_limit: v?.ticket_limit ?? null,
    followup_limit: v?.followup_limit ?? null,
    capabilities: {
      software: true,
      finance: v?.capabilities?.finance ?? true,
      analytics: v?.capabilities?.analytics ?? true,
      commercial_followups: v?.commercial_followups ?? true,
      human_support: v?.human_support ?? false,
    },
  });
  const [validation, setValidation] = useState<Check | null>(null),
    [error, setError] = useState(""),
    [review, setReview] = useState(false),
    [testing, setTesting] = useState(false),
    [results, setResults] = useState<TestResult | null>(null);
  useEffect(() => {
    if (review) {
      form.current?.closest("dialog")?.scrollTo({ top: 0 });
      form.current
        ?.querySelector<HTMLElement>(".b-commercial-review h3")
        ?.focus({ preventScroll: true });
    }
  }, [review]);
  function payload() {
    const { price, ...rest } = d;
    return {
      ...rest,
      price_cents: Math.round(Number(price) * 100),
      human_support: d.capabilities.human_support,
      commercial_followups: d.capabilities.commercial_followups,
    };
  }
  function change(k: string, value: unknown) {
    setD((x: any) => ({
      ...x,
      [k]: value,
      ...(k === "capabilities" && x.quota_semantics === 2
        ? {
            ticket_limit: (value as any).human_support ? x.ticket_limit : null,
            followup_limit:
              (value as any).human_support &&
              (value as any).commercial_followups
                ? x.followup_limit
                : null,
          }
        : {}),
    }));
    setResults(null);
    setReview(false);
  }
  useEffect(() => {
    let live = true;
    setValidation(null);
    const timer = setTimeout(() => {
      void rpc<Check>("billing_plan_validate", { p_data: payload() })
        .then((r) => {
          if (live) setValidation(r);
        })
        .catch((e) => {
          if (live) setError(errorMessage(e));
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [d]);
  async function test() {
    setTesting(true);
    setError("");
    try {
      setResults(
        await rpc<TestResult>("billing_plan_test", { p_data: payload() }),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTesting(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const check = await rpc<Check>("billing_plan_validate", {
        p_data: payload(),
      });
      setValidation(check);
      if (!check.consistent) return;
      if (!review) {
        setReview(true);
        return;
      }
      await save(payload());
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const limits: [string, string, number][] = [
    ["member_limit", "Membros da equipe", 1],
    ["service_limit", "Serviços ativos", 1],
    ["request_limit", "Solicitações por mês", 0],
    [
      "followup_limit",
      d.quota_semantics === 1
        ? "Tentativas por mês · contrato anterior"
        : "Tentativas humanas SYZIA por mês",
      0,
    ],
  ];
  return (
    <Dialog
      title={plan ? "Editar plano" : "Criar plano"}
      close={close}
      className="b-config-dialog"
    >
      <form ref={form} onSubmit={(e) => void submit(e)} className="b-config">
        <fieldset disabled={busy || testing} className="form-reset">
          <p className="muted">
            Cada alteração cria uma versão. Empresas que já contrataram mantêm
            preço, recursos e limites anteriores.
          </p>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          {!review ? (
            <>
              <section>
                <h3>Informações do plano</h3>
                <div className="b-form">
                  <label>
                    Nome
                    <input
                      autoFocus
                      required
                      minLength={2}
                      maxLength={100}
                      value={d.name}
                      onChange={(e) => change("name", e.target.value)}
                    />
                  </label>
                  <label>
                    Preço (R$)
                    <input
                      type="number"
                      min={0}
                      max={1000000}
                      step="0.01"
                      required
                      value={d.price}
                      onChange={(e) => change("price", e.target.value)}
                    />
                  </label>
                  <label className="b-wide">
                    Descrição curta
                    <textarea
                      maxLength={2000}
                      value={d.description}
                      onChange={(e) => change("description", e.target.value)}
                    />
                  </label>
                  <label>
                    Periodicidade
                    <select
                      value={d.interval_months}
                      onChange={(e) =>
                        change("interval_months", Number(e.target.value))
                      }
                    >
                      {[
                        [1, "Mensal"],
                        [3, "Trimestral"],
                        [6, "Semestral"],
                        [12, "Anual"],
                      ].map(([n, label]) => (
                        <option key={n} value={n}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Teste gratuito (dias)
                    <input
                      type="number"
                      min={0}
                      max={90}
                      required
                      value={d.trial_days}
                      onChange={(e) =>
                        change("trial_days", Number(e.target.value))
                      }
                    />
                    <small>0 significa sem teste gratuito.</small>
                  </label>
                  <label>
                    Ordem de exibição
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      required
                      value={d.position}
                      onChange={(e) =>
                        change("position", Number(e.target.value))
                      }
                    />
                  </label>
                </div>
              </section>
              <section>
                <h3>O que está incluído</h3>
                <div className="b-core">
                  <strong>
                    Operação empresarial · incluída em todos os planos
                  </strong>
                  <ul>
                    {basic.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  <p>
                    Configuração inicial disponível para preparar a empresa.
                    Novas operações exigem acesso comercial válido.
                  </p>
                </div>
                <div className="b-resource-options">
                  {resourceOptions.map(([key, label, help]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={d.capabilities[key]}
                        onChange={(e) =>
                          change("capabilities", {
                            ...d.capabilities,
                            [key]: e.target.checked,
                          })
                        }
                      />
                      <span>
                        <strong>{label}</strong>
                        <small>{help}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
              <section>
                <h3>Disponibilidade comercial</h3>
                <div className="b-checks">
                  {[
                    ["active", "Plano ativo"],
                    ["available", "Disponível para novas empresas"],
                    ["site_visible", "Mostrar no site"],
                    [
                      "self_service",
                      "Permitir cadastro pelo site (self-service)",
                    ],
                    [
                      "self_service_trial",
                      "Oferecer teste gratuito no cadastro",
                    ],
                  ].map(([k, label]) => (
                    <label key={k}>
                      <input
                        type="checkbox"
                        checked={d[k]}
                        onChange={(e) => change(k, e.target.checked)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <p className="muted">
                  Um plano interno pode ficar fora do site e do cadastro. Os
                  recursos continuam definidos nesta mesma oferta.
                </p>
              </section>
              <section>
                <h3>Capacidade e limites</h3>
                <p>
                  Solicitações, orçamentos, agendamentos, atendimentos e
                  retornos da própria empresa são ilimitados por padrão.
                </p>
                {d.quota_semantics === 1 && (
                  <div className="notice">
                    <p>
                      Esta oferta usa limites do contrato anterior. Mantê-los
                      preserva a modalidade desta nova versão; contratos
                      existentes continuam inalterados em qualquer caso.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setD((x: any) => ({
                          ...x,
                          quota_semantics: 2,
                          ticket_limit: null,
                          followup_limit: null,
                        }));
                        setResults(null);
                      }}
                    >
                      Adotar capacidade humana SYZIA na nova versão
                    </button>
                  </div>
                )}
                <p>
                  O limite do atendimento compartilhado é configurado por versão
                  e ciclo na seção Atendimento compartilhado, após salvar a
                  versão.
                </p>
                <div className="b-limit-grid">
                  {limits
                    .filter(
                      ([k]) =>
                        d.quota_semantics === 1 ||
                        !["ticket_limit", "followup_limit"].includes(k) ||
                        (d.capabilities.human_support &&
                          (k !== "followup_limit" ||
                            d.capabilities.commercial_followups)),
                    )
                    .map(([k, label, min]) => (
                      <div key={k}>
                        <label>
                          {label}
                          <select
                            aria-label={label + " · tipo de limite"}
                            value={d[k] === null ? "unlimited" : "limited"}
                            onChange={(e) =>
                              change(
                                k,
                                e.target.value === "unlimited"
                                  ? null
                                  : Math.max(1, min),
                              )
                            }
                          >
                            <option value="unlimited">Ilimitado</option>
                            <option value="limited">Definir limite</option>
                          </select>
                        </label>
                        {d[k] !== null && (
                          <label>
                            Limite · {label}
                            <input
                              type="number"
                              min={min}
                              max={
                                k === "member_limit" || k === "service_limit"
                                  ? 100000
                                  : 10000000
                              }
                              required
                              value={d[k]}
                              onChange={(e) =>
                                change(
                                  k,
                                  e.target.value === ""
                                    ? ""
                                    : Number(e.target.value),
                                )
                              }
                            />
                          </label>
                        )}
                      </div>
                    ))}
                </div>
                <p className="muted">
                  Um pedido com vários serviços conta como uma solicitação. A
                  unidade compartilhada é registrada quando a Equipe SYZIA
                  assume ou recebe um ticket no ciclo. Entrar na fila e enviar
                  mensagens do consumidor não consomem unidade. Mensagens
                  seguintes no mesmo ticket não multiplicam o uso. Super Admin e atendentes compartilhados
                  não ocupam vagas da empresa.
                </p>
              </section>
            </>
          ) : (
            <section className="b-commercial-review">
              <h3 tabIndex={-1}>Resumo comercial</h3>
              <h2>{d.name}</h2>
              <p>{d.description}</p>
              <p className="b-price">
                {money(Math.round(Number(d.price) * 100))}
                <small>
                  {" "}
                  / {d.interval_months}{" "}
                  {d.interval_months === 1 ? "mês" : "meses"}
                </small>
              </p>
              <p>
                {d.trial_days
                  ? `${d.trial_days} dias de teste gratuito`
                  : "Sem teste gratuito"}
              </p>
              <ul>
                {basic.map((x) => (
                  <li key={x}>{x}</li>
                ))}
                {resourceOptions.map(([k, label]) => (
                  <li key={k}>
                    {label}: {d.capabilities[k] ? "incluído" : "não incluído"}
                  </li>
                ))}
              </ul>
              <dl className="b-summary">
                {limits.map(([k, label]) => (
                  <div key={k}>
                    <dt>{label}</dt>
                    <dd>
                      {d.quota_semantics === 2 &&
                      ((k === "ticket_limit" &&
                        !d.capabilities.human_support) ||
                        (k === "followup_limit" &&
                          (!d.capabilities.human_support ||
                            !d.capabilities.commercial_followups)))
                        ? "Não incluído"
                        : (d[k] ?? "Ilimitado")}
                    </dd>
                  </div>
                ))}
                {[
                  ["active", "Plano ativo"],
                  ["available", "Novas empresas"],
                  ["site_visible", "Mostrar no site"],
                  ["self_service", "Cadastro pelo site"],
                  ["self_service_trial", "Teste no cadastro"],
                ].map(([k, label]) => (
                  <div key={k}>
                    <dt>{label}</dt>
                    <dd>{d[k] ? "Sim" : "Não"}</dd>
                  </div>
                ))}
              </dl>
              <p>
                Orçamentos e agendamentos: Ilimitado.{" "}
                {d.quota_semantics === 2
                  ? "Atendimento e retornos próprios: Ilimitado."
                  : "Limites de atendimento e retornos preservam a modalidade anterior."}
              </p>
              <strong>É exatamente isso que quero vender?</strong>
              <p>
                Salvar cria a versão {plan ? plan.revision + 1 : 1}; assinaturas
                anteriores não serão alteradas.
              </p>
              <button type="button" onClick={() => setReview(false)}>
                Voltar ao configurador
              </button>
            </section>
          )}
          <section
            className="b-validation"
            aria-label="Validação das atribuições"
          >
            <h3>Validação das atribuições</h3>
            {!validation ? (
              <p role="status">Conferindo vínculos…</p>
            ) : (
              <>
                <strong>
                  {validation.consistent
                    ? "Plano consistente"
                    : "Inconsistência encontrada"}
                </strong>
                <ul>
                  {validation.mappings.map((m) => (
                    <li key={m.capability}>
                      {m.label} — {m.included ? "vinculado" : "não incluído"}
                    </li>
                  ))}
                  <li>
                    Limite de membros — aplicado no servidor (
                    {d.member_limit ?? "Ilimitado"})
                  </li>
                </ul>
                {validation.issues.map((x) => (
                  <p role="alert" key={x}>
                    {x}
                  </p>
                ))}
              </>
            )}
            <button
              type="button"
              disabled={testing || !validation?.consistent}
              onClick={() => void test()}
            >
              {testing ? "Verificando…" : "Testar atribuições do plano"}
            </button>
            <p className="muted">
              Executa autorizações e limites do servidor em um cenário
              temporário, descartado integralmente. Não cobra e não altera
              empresas reais.
            </p>
            {results && (
              <div aria-label="Resultado do teste">
                <p role="status">
                  {results.consistent
                    ? "Verificação concluída — plano consistente"
                    : "Inconsistência no teste"}{" "}
                  ·{" "}
                  {results.rolled_back
                    ? "cenário descartado"
                    : "verifique o resultado"}
                </p>
                <ul>
                  {results.checks.map((r, i) => (
                    <li key={i}>
                      <strong>{r.status}</strong> — {r.label}
                      {r.detail && <small>{r.detail}</small>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          <div className="b-actions b-config-actions">
            <button
              className="primary"
              type="submit"
              disabled={
                !validation?.consistent || results?.consistent === false
              }
            >
              {busy
                ? "Salvando…"
                : review
                  ? "Salvar versão"
                  : "Revisar resumo comercial"}
            </button>
            <button type="button" onClick={close}>
              Cancelar
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
