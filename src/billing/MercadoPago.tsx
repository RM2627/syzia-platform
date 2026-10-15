import { normalizeCPF } from "../../shared/cpf.mjs";
import { useEffect, useRef, useState } from "react";
import { rpc } from "../api";
import "./mercado-pago.css";
import { billingApi } from "./checkout-api";
export { billingApi } from "./checkout-api";
import { SecureCardForm } from "./SecureCardForm";
import { CheckoutSummary } from "./CheckoutSummary";
const money = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n / 100,
  );
const date = (s: string | null) =>
  s
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(
        new Date(s),
      )
    : "—";
const labels: Record<string, string> = {
  trialing: "Em período grátis",
  active: "Ativa",
  payment_pending: "Aguardando confirmação",
  grace_period: "Pagamento em regularização",
  paused: "Pausada",
  cancel_scheduled: "Cancelamento programado",
  canceled: "Cancelada",
  restricted: "Operação paga restrita",
  reconciliation: "Assinatura em conferência",
};
const messages: Record<string, string> = {
  billing_binding_mismatch:
    "Encontramos uma divergência na confirmação da assinatura. A solicitação existente será conferida; não envie outro pagamento.",
  billing_trial_evidence_required:
    "Há uma pendência nos dados ou no histórico do período grátis. A assinatura existente e a reserva foram preservadas. Atualize a situação; se a pendência continuar, entre em contato com o suporte.",
  billing_stale_snapshot:
    "A confirmação recebida está desatualizada ou inconsistente. Sua assinatura permanece em conferência; atualize a situação sem contratar novamente.",
  billing_credentials_missing:
    "A contratação está temporariamente indisponível. Tente novamente mais tarde.",
  billing_trial_changed:
    "A elegibilidade mudou enquanto você confirmava. Atualize a situação e confira os valores antes de contratar.",
  billing_members_exceeded:
    "O plano selecionado permite menos integrantes do que a equipe atual. Nenhum vínculo foi alterado.",
  billing_operation_pending:
    "Há uma solicitação em confirmação. Aguarde e atualize a situação.",
  billing_existing_subscription:
    "Já existe uma assinatura ou contratação em andamento. Atualize a situação para continuar.",
  billing_plan_unavailable:
    "Este plano mudou ou não está disponível. Atualize a página e confira as condições.",
  billing_timeout:
    "A resposta demorou. Estamos conferindo a mesma solicitação; não inicie outra contratação.",
  billing_reconciliation_required:
    "Estamos conferindo sua solicitação. Seu cadastro foi preservado.",
  trial_review_required:
    "Confirme os dados de elegibilidade abaixo. Se já os confirmou, fale com a administração SYZIA.",
  billing_payment_method_required:
    "Confira o meio de pagamento para continuar.",
  billing_payer_email_invalid:
    "Confira e confirme o e-mail do pagador antes de continuar.",
  billing_provider_rejected:
    "O Mercado Pago não aceitou a solicitação. Não foi possível identificar o motivo com segurança.",
  billing_provider_invalid_request:
    "O Mercado Pago não aceitou os dados da solicitação. Revise o formulário. Se o problema continuar, entre em contato com o suporte.",
  billing_provider_authentication:
    "A contratação está indisponível no momento. Consulte a situação mais tarde ou entre em contato com o suporte.",
  billing_provider_forbidden:
    "Não foi possível autorizar esta contratação. Entre em contato com o suporte para verificar a solicitação.",
  billing_provider_unavailable:
    "Não foi possível concluir a verificação agora. Você pode consultar a situação da solicitação.",
  billing_provider_rate_limited:
    "A verificação está temporariamente indisponível. Aguarde um momento e consulte a situação.",
  billing_provider_conflict:
    "Estamos verificando a solicitação. Não é necessário enviar o pagamento novamente.",
  billing_trial_mismatch:
    "Ainda não foi possível confirmar as condições do período grátis. Estamos verificando a solicitação; não envie o pagamento novamente.",
  billing_plan_mismatch:
    "Não foi possível validar as condições deste plano. A contratação não foi concluída. Entre em contato com o suporte.",
};
export function MercadoPagoBilling({ org }: { org: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [card, setCard] = useState<{ action: string; plan?: any } | null>(null),
    [confirm, setConfirm] = useState<{ action: string; plan?: any } | null>(
      null,
    );
  const key = useRef(crypto.randomUUID()),
    lock = useRef(false),
    generation = useRef(0);
  const [phase, setPhase] = useState(""),
    [checking, setChecking] = useState(false),
    [unverified, setUnverified] = useState(false),
    [formVersion, setFormVersion] = useState(0);
  const checkoutHeading = useRef<HTMLHeadingElement>(null);
  const [kind, setKind] = useState("CPF"),
    [document, setDocument] = useState("");
  const displayError = (e: unknown) =>
    messages[(e as Error).message] ||
    "Não foi possível confirmar agora. Atualize a situação para conferir sua solicitação.";
  async function refresh(reconcile = false) {
    const g = generation.current;
    const value = reconcile
      ? await billingApi("status", { organization_id: org })
      : await rpc("billing047_context", { p_org: org });
    if (g === generation.current) {
      setData(value);
      if (
        value.subscription &&
        (value.subscription.checkout_retryable || value.subscription.method_retryable ||
          (!value.subscription.operation_pending &&
            ["trialing", "active", "cancel_scheduled", "canceled"].includes(
              value.subscription.state,
            )))
      )
        setUnverified(false);
    }
    return value;
  }
  useEffect(() => {
    generation.current++;
    const g = generation.current;
    setData(null);
    setCard(null);
    setConfirm(null);
    setUnverified(false);
    setError("");
    setNotice("");
    void refresh(new URLSearchParams(location.search).has("retorno")).catch(
      (e) => {
        if (g === generation.current) setError(displayError(e));
      },
    );
    return () => {
      generation.current++;
    };
  }, [org]);
  const s = data?.subscription;
  useEffect(() => {
    if (
      s?.checkout_retryable ||
      (!s?.operation_pending && s?.state !== "payment_pending")
    )
      return;
    let count = 0,
      stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (stopped || count++ >= 8) return;
      try {
        await refresh(true);
      } catch {}
      if (!stopped) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [org, s?.id, s?.operation_pending, s?.state, s?.checkout_retryable]);
  useEffect(() => {
    if (card) checkoutHeading.current?.focus();
  }, [card]);
  async function command(action: string, plan?: any, token?: string, payerEmail?: string) {
    if (
      lock.current ||
      unverified ||
      (action === "checkout" && s?.operation_pending && !s?.checkout_retryable)
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("Estamos confirmando sua assinatura…");
    const g = generation.current;
    try {
      const value = await billingApi("command", {
        organization_id: org,
        action,
        request_key: key.current,
        ...(action === "checkout" ? { trial_expected: eligible, payer_email: payerEmail } : {}),
        ...(plan ? { plan_version_id: plan.version_id } : {}),
        ...(token ? { card_token: token } : {}),
      });
      if (g !== generation.current) return;
      setData(value);
      setUnverified(false);
      setNotice(
        action === "method" && !value.subscription?.operation_pending
          ? "Cartão atualizado. Isso não confirma o pagamento de cobranças pendentes."
          : ["trialing", "active"].includes(value.subscription?.state) &&
          !value.subscription.operation_pending
          ? "Assinatura confirmada. Confira as condições abaixo."
          : "Solicitação recebida. Acompanhe a confirmação abaixo.",
      );
      setCard(null);
      setConfirm(null);
      key.current = crypto.randomUUID();
    } catch (e) {
      if (g !== generation.current) return;
      setError(displayError(e));
      setNotice("");
      setUnverified(true);
      setFormVersion((v) => v + 1);
      const latest = await refresh().catch(() => null);
      if (!latest?.subscription?.checkout_retryable) setCard(null);
      if (
        latest &&
        [
          "billing_members_exceeded",
          "billing_trial_changed",
          "billing_plan_unavailable",
          "trial_review_required",
          "billing_payment_method_required",
          "billing_payload_invalid",
        ].includes((e as Error).message)
      )
        setUnverified(false);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const eligible = s?.checkout_retryable
    ? s.checkout_trial
    : data?.eligibility === "eligible";
  const eligibilityPending =
    ["verification_required", "manual_policy", "identity_conflict", "previous_review"].includes(data?.eligibility) &&
    !s;
  const pending =
    unverified ||
    Boolean(s?.operation_pending && !s?.checkout_retryable) ||
    (s?.state === "reconciliation" && !s?.checkout_retryable);
  async function openCheckout(p: any) {
    if (lock.current || pending) return;
    setError("");
    setChecking(true);
    key.current = crypto.randomUUID();
    const g = generation.current;
    try {
      const current = await refresh();
      if (g !== generation.current) return;
      const plan = current.catalog.find(
        (x: any) => x.version_id === p.version_id,
      );
      if (!plan) throw Error("billing_plan_unavailable");
      if (plan.member_limit != null && current.members > plan.member_limit)
        throw Error("billing_members_exceeded");
      if (current.subscription && !current.subscription.checkout_retryable && current.subscription.state !== "canceled") throw Error("billing_existing_subscription");
      if (
        current.subscription?.operation_pending &&
        !current.subscription.checkout_retryable
      )
        throw Error("billing_operation_pending");
      setCard({ action: "checkout", plan });
    } catch (e) {
      setError(displayError(e));
    } finally {
      setChecking(false);
    }
  }
  const checkoutNeeded = !s || s.state === "canceled" || s.checkout_retryable;
  return (
    <section className="billing mp-billing" aria-labelledby="mp-heading">
      <header className="mp-page-header">
        <div>
          <span className="mp-eyebrow">PLANOS E ASSINATURA</span>
          <h1 id="mp-heading">Sua assinatura</h1>
          <p>Uma experiência conectada, do atendimento à gestão.</p>
        </div>
        <img
          src="/brand/syzia/syzia-horizontal-light.png"
          alt="SYZIA"
          width="140"
          height="48"
        />
      </header>
      {new URLSearchParams(location.search).has("retorno") &&
        (!s || s.operation_pending || s.state === "payment_pending") && (
          <p role="status">Estamos confirmando sua assinatura...</p>
        )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <button
        className="mp-refresh"
        disabled={busy || checking}
        onClick={() => {
          setError("");
          void refresh(true).catch((e) => setError(displayError(e)));
        }}
      >
        Atualizar situação
      </button>
      {!data && (
        <p role="status" className="mp-status-card">
          Carregando assinatura e condições disponíveis…
        </p>
      )}
      {checking && (
        <p role="status">Verificando elegibilidade e limite de integrantes…</p>
      )}
      {pending && (
        <section className="mp-status-card" role="status">
          <h2>Estamos verificando a solicitação</h2>
          <p>
            Não é necessário enviar o pagamento novamente. Use “Atualizar
            situação” para acompanhar a confirmação.
          </p>
        </section>
      )}
      {s && !card && (
        <section className="ds-panel mp-subscription">
          <h2>
            {data.catalog.find((p: any) => p.version_id === s.plan_version_id)
              ?.name || s.code}
          </h2>
          <p>
            <strong>
              {s.checkout_retryable && s.error_code
                ? "Contratação não concluída"
                : labels[s.state] || "Em conferência"}
            </strong>
          </p>
          <p>{money(s.price_cents)}/mês · BRL</p>
          {s.trial_end && s.state === "trialing" && (
            <p>
              {Math.max(
                0,
                Math.ceil((Date.parse(s.trial_end) - Date.now()) / 86400000),
              )}{" "}
              dias restantes de trial · até {date(s.trial_end)}
            </p>
          )}
          <p>
            Próxima cobrança:{" "}
            {s.next_charge
              ? date(s.next_charge)
              : "Aguardando confirmação ou renovação desativada"}
          </p>
          <p>
            Meio de pagamento:{" "}
            {s.method
              ? s.method + (s.method_last_four ? " · final " + s.method_last_four : " · vinculado com segurança")
              : "Aguardando vinculação"}
          </p>
          {s.trial_start && s.trial_end && <p>Período grátis confirmado: {date(s.trial_start)} a {date(s.trial_end)}.</p>}
          {Array.isArray(s.payments) && (
            <details>
              <summary>Histórico de cobranças</summary>
              {s.payments.length === 0 ? <p>Nenhuma cobrança confirmada no histórico.</p> : (
                <ul>{s.payments.map((p: any, i: number) => (
                  <li key={i}>{date(p.debit_at)} · {money(p.amount_cents)} · {({ paid: "Paga", failed: "Não aprovada", pending: "Em processamento", reversed: "Revertida" } as Record<string, string>)[p.state] || "Em conferência"}{p.paid_at ? " · pagamento confirmado em " + date(p.paid_at) : ""}</li>
                ))}</ul>
              )}
              {s.payments_count > s.payments.length && <p>Exibindo as 50 cobranças mais recentes. O histórico anterior foi preservado.</p>}
            </details>
          )}
          {s.method_update_pending && <p role="status">Estamos confirmando a alteração do cartão na assinatura existente.</p>}
          {s.state === "grace_period" && (
            <p role="alert">
              Não conseguimos confirmar sua cobrança. Atualize sua forma de
              pagamento para evitar a interrupção do serviço. Tolerância até{" "}
              {date(s.grace_until)}.
            </p>
          )}
          {s.state === "restricted" && (
            <p>
              A operação paga está restrita. Sua conta, empresa, configurações e
              histórico foram preservados.
            </p>
          )}
          {s.cancel_confirmed && (
            <p>
              A renovação foi interrompida. Acesso até {date(s.access_until)}.
            </p>
          )}
          {s.cancel_requested && !s.cancel_confirmed && (
            <p role="alert">
              Estamos confirmando o cancelamento com o Mercado Pago. A
              interrupção da renovação ainda não foi confirmada.
            </p>
          )}
          {s.target_version && (
            <p>
              Mudança de plano solicitada para a próxima cobrança, a partir de{" "}
              {date(s.target_effective_at)}. Os novos recursos dependem da
              confirmação financeira.
            </p>
          )}
          {s.operation_pending && (
            <p role="status">Estamos confirmando sua solicitação…</p>
          )}
          <div className="mp-actions">
            {(s.can_update_method ?? Boolean(s.method && !s.cancel_requested)) && (
              <button
                disabled={busy || pending || s.operation_pending}
                onClick={() => {
                  key.current = crypto.randomUUID();
                  setCard({ action: "method" });
                }}
              >
                Atualizar meio de pagamento
              </button>
            )}
            {s.method && !s.cancel_requested && (
              <button
                disabled={busy || s.operation_pending}
                onClick={() => setConfirm({ action: "cancel" })}
              >
                Cancelar assinatura
              </button>
            )}
            {s.can_resume && (
              <button
                disabled={busy || s.operation_pending}
                onClick={() => setConfirm({ action: "resume" })}
              >
                Reativar assinatura
              </button>
            )}
          </div>
        </section>
      )}
      {data &&
        ["verification_required", "manual_policy", "identity_conflict", "previous_review"].includes(data.eligibility) &&
        !s && (
          <form
            className="ds-panel"
            onSubmit={(e) => {
              e.preventDefault();
              if (kind === "CPF" && !normalizeCPF(document)) { setError("Confira os dígitos do CPF. Use 11 dígitos ou a máscara 000.000.000-00."); return; }
              setError("");
              setBusy(true);
              void rpc("billing047_identify", {
                p_org: org,
                p_kind: kind,
                p_document: document,
              })
                .then(() => {
                  setDocument("");
                  return refresh();
                })
                .catch((e) => setError(displayError(e)))
                .finally(() => setBusy(false));
            }}
          >
            <h2>Confirme a elegibilidade do período grátis</h2>
            <p>{data.eligibility === "identity_conflict" || data.eligibility === "previous_review"
              ? "Os dados precisam de uma análise excepcional. Entre em contato com a administração SYZIA."
              : data.eligibility === "manual_policy" ? "A política atual exige análise da administração SYZIA."
              : "Informe um documento válido para consultar automaticamente o histórico do período grátis. Isso não comprova a titularidade do documento."}</p>
            <label>
              Tipo
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option>CPF</option>
                <option>CNPJ</option>
              </select>
            </label>
            <label>
              Documento
              <input
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                required
                maxLength={20}
                autoComplete="off"
              />
            </label>
            <button disabled={busy}>Conferir dados</button>
          </form>
        )}
      {data && !s && ["previous_grant", "previous_identity"].includes(data.eligibility) && <p>Período grátis já utilizado ou reservado. A contratação disponível não inclui um novo trial.</p>}
      {data && !card && !pending && (
        <div className="mp-plans">
          {data.catalog.map((p: any) => (
            <article key={p.version_id} className="ds-panel">
              <h2>{p.name}</h2>
              {(!s || s.state === "canceled") && eligible && (
                <>
                  <strong>7 dias grátis</strong>
                  <p>Depois, {money(p.price_cents)}/mês</p>
                </>
              )}
              {(s || !eligible) && <p>{money(p.price_cents)}/mês</p>}
              <p>
                Até {p.member_limit ?? "quantidade ilimitada de"}{" "}
                {p.member_limit === 1 ? "membro" : "membros"}
              </p>
              <button
                disabled={
                  busy ||
                  checking ||
                  eligibilityPending ||
                  (s?.operation_pending && !s?.checkout_retryable) ||
                  s?.target_version ||
                  (s?.checkout_retryable &&
                    s.plan_version_id !== p.version_id) ||
                  (!checkoutNeeded && s.plan_version_id === p.version_id)
                }
                onClick={() => {
                  key.current = crypto.randomUUID();
                  setError("");
                  if (checkoutNeeded) void openCheckout(p);
                  else setConfirm({ action: "change", plan: p });
                }}
              >
                {s?.checkout_retryable
                  ? "Continuar contratação " + p.name
                  : checkoutNeeded
                    ? "Assinar " + p.name
                    : "Mudar para " + p.name}
              </button>
            </article>
          ))}
        </div>
      )}
      {data && !data.catalog.length && (
        <p>A contratação está temporariamente indisponível.</p>
      )}
      {confirm && (
        <section
          className="ds-panel"
          role="region"
          aria-label="Confirmar alteração"
        >
          <h2>Confirmar alteração</h2>
          <p>
            {confirm.action === "cancel"
              ? "Interromper a renovação? Você mantém o acesso até o fim do período gratuito ou pago. Nenhum dado será apagado."
              : confirm.action === "resume"
                ? "Retomar a renovação mensal da assinatura, sem novo período grátis?"
                : `Mudar para ${confirm.plan.name} por ${money(confirm.plan.price_cents)}/mês na próxima cobrança? Não há pró-rata nem cobrança adicional agora. Os recursos são atualizados após a confirmação financeira.`}
          </p>
          <button
            disabled={busy}
            onClick={() => void command(confirm.action, confirm.plan)}
          >
            Confirmar
          </button>
          <button disabled={busy} onClick={() => setConfirm(null)}>
            Voltar
          </button>
        </section>
      )}
      {card && !pending && (
        <section className="mp-checkout" aria-labelledby="mp-checkout-title">
          <div className="mp-checkout-intro">
            <button
              className="mp-back"
              disabled={busy}
              onClick={() => {
                setCard(null);
                setPhase("");
              }}
            >
              ← Voltar aos planos
            </button>
            <p className="mp-eyebrow">CONTRATAÇÃO SEGURA</p>
            <h2 id="mp-checkout-title" ref={checkoutHeading} tabIndex={-1}>
              {card.action === "method"
                ? "Atualize seu meio de pagamento"
                : "Tudo pronto para o próximo passo."}
            </h2>
            <p>
              {card.action === "method"
                ? "Vincule um novo cartão à assinatura existente."
                : "Confira o plano e vincule seu cartão para solicitar a assinatura."}
            </p>
          </div>
          <div className="mp-checkout-grid">
            <div className="mp-payment-panel">
              <div className="mp-panel-heading">
                <span className="mp-step" aria-hidden="true">
                  1
                </span>
                <div>
                  <h3>Meio de pagamento</h3>
                  <p>Campos seguros do Mercado Pago</p>
                </div>
                <svg
                  width="22"
                  height="26"
                  viewBox="0 0 24 28"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="4"
                    y="11"
                    width="16"
                    height="13"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M8 11V7a4 4 0 0 1 8 0v4M12 16v3"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                </svg>
              </div>
              {s?.checkout_retryable && s.error_code && (
                <p className="mp-retry-note">
                  A solicitação anterior não foi concluída. Você pode revisar os
                  dados e confirmar uma nova tentativa no mesmo contrato. A
                  reserva do período grátis foi preservada.
                </p>
              )}
              <SecureCardForm
                key={card.action + (card.plan?.version_id || "") + formVersion}
                amount={card.plan?.price_cents || s?.price_cents}
                busy={busy}
                onPhase={setPhase}
                checkout={card.action === "checkout"}
                eligible={Boolean(eligible)}
                onToken={(token, payerEmail) => command(card.action, card.plan, token, payerEmail)}
              />
              {phase && <p role="status">{phase}</p>}
            </div>
            <CheckoutSummary
              plan={
                card.plan ||
                data.catalog.find(
                  (p: any) => p.version_id === s?.plan_version_id,
                ) || { name: s?.code, price_cents: s?.price_cents }
              }
              eligible={eligible && card.action === "checkout"}
              eligibilityPending={eligibilityPending}
            />
          </div>
        </section>
      )}
      {!card &&
        !pending &&
        s &&
        ["trialing", "active"].includes(s.state) &&
        !s.operation_pending && (
          <section className="mp-confirmed" aria-label="Assinatura confirmada">
            <h2>Seu plano está pronto para usar</h2>
            <p>
              {s.state === "trialing"
                ? "O período grátis foi reconhecido e o meio de pagamento está vinculado."
                : "A assinatura está ativa após confirmação financeira."}{" "}
              Você pode acompanhar a renovação e gerenciar a assinatura nesta
              página.
            </p>
            <a href={`/painel/${org}`}>Ir para o painel →</a>
          </section>
        )}
    </section>
  );
}
