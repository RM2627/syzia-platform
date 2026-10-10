import { useEffect, useRef, useState } from "react";
import { rpc, supabase } from "../api";
import "./mercado-pago.css";
const money = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n / 100);
const date = (s: string | null) => s ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(s)) : "—";
const labels: Record<string, string> = { trialing: "Em período grátis", active: "Ativa", payment_pending: "Aguardando confirmação", grace_period: "Pagamento em regularização", paused: "Pausada", cancel_scheduled: "Cancelamento programado", canceled: "Cancelada", restricted: "Operação paga restrita", reconciliation: "Em conferência" };
const messages: Record<string, string> = {
  billing_credentials_missing: "A contratação está temporariamente indisponível. Tente novamente mais tarde.",
  billing_trial_changed: "A elegibilidade mudou enquanto você confirmava. Atualize a situação e confira os valores antes de contratar.",
  billing_members_exceeded: "O limite deste plano é menor que sua equipe ativa. Revise os vínculos em Equipe antes de mudar de plano. Nenhum membro foi removido.",
  billing_operation_pending: "Há uma solicitação em confirmação. Aguarde e atualize a situação.",
  billing_existing_subscription: "Já existe uma assinatura ou contratação em andamento. Atualize a situação para continuar.",
  billing_plan_unavailable: "Este plano mudou ou não está disponível. Atualize a página e confira as condições.",
  billing_timeout: "A resposta demorou. Estamos conferindo a mesma solicitação; não inicie outra contratação.",
  billing_reconciliation_required: "Estamos conferindo sua solicitação. Seu cadastro foi preservado.",
  trial_review_required: "Confirme os dados de elegibilidade abaixo. Se já os confirmou, fale com a administração SYZIA.",
  billing_payment_method_required: "Confira o meio de pagamento para continuar.",
  billing_provider_rejected: "O Mercado Pago não aceitou a solicitação. Confira o meio de pagamento.",
};
export async function billingApi(path: string, body: Record<string, unknown>) {
  const base = import.meta.env.VITE_BILLING_API_URL;
  if (!base) throw Error("billing_credentials_missing");
  const u = new URL(base);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && ["127.0.0.1", "localhost"].includes(u.hostname))) throw Error("billing_credentials_missing");
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  const response = await fetch(base.replace(/\/$/, "") + "/billing/" + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (token || "") }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  const value = await response.json(); if (!response.ok) throw Error(value.error); return value;
}
let sdk: Promise<void> | undefined;
async function loadSDK() {
  if ((window as any).MercadoPago) return;
  if (!sdk) sdk = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script"); script.src = "https://sdk.mercadopago.com/js/v2"; script.async = true;
    script.onload = () => resolve(); script.onerror = () => { script.remove(); sdk = undefined; reject(Error("billing_provider_unavailable")); };
    document.head.append(script);
  });
  return sdk;
}
function CardForm({ amount, onToken, busy }: { amount: number; onToken: (token: string) => Promise<void>; busy: boolean }) {
  const [ready, setReady] = useState(false), [error, setError] = useState("");
  const id = useRef("mp-" + crypto.randomUUID()), submit = useRef(onToken), sending = useRef(false);
  submit.current = onToken;
  useEffect(() => {
    let live = true, form: any;
    void (async () => {
      const config = await billingApi("config", {}); await loadSDK(); if (!live) return;
      const fields = ["cardNumber", "expirationDate", "securityCode", "cardholderName", "issuer", "installments", "identificationType", "identificationNumber", "cardholderEmail"];
      form = new (window as any).MercadoPago(config.public_key, { locale: "pt-BR" }).cardForm({ amount: (amount / 100).toFixed(2), iframe: true,
        form: { id: id.current, ...Object.fromEntries(fields.map(k => [k, { id: id.current + "-" + k }])) },
        callbacks: {
          onFormMounted: (err: unknown) => { if (live) { setReady(!err); if (err) setError("Não foi possível abrir o formulário seguro. Feche e tente novamente."); } },
          onSubmit: async (event: Event) => { event.preventDefault(); if (sending.current) return; sending.current = true;
            try { await submit.current(form.getCardFormData().token); } finally { sending.current = false; const hidden = document.querySelector(`#${id.current} input[name="MPHiddenInputToken"]`) as HTMLInputElement | null; if (hidden) hidden.value = ""; }
          },
          onError: () => { if (live) setError("Confira os campos do formulário seguro."); },
        },
      });
    })().catch(() => { if (live) setError("O formulário seguro está indisponível. Feche e tente novamente."); });
    return () => { live = false; form?.unmount?.(); };
  }, [amount]);
  return <form id={id.current} className="mp-form" onSubmit={e => e.preventDefault()}>
    <p>Os dados do cartão são enviados ao Mercado Pago pelo formulário seguro.</p>
    {[['cardNumber','Número do cartão'],['expirationDate','Validade'],['securityCode','Código de segurança']].map(([key,label]) => <label key={key}>{label}<div id={id.current+"-"+key} className="mp-secure-field" /></label>)}
    <label>Nome no cartão<input id={id.current+"-cardholderName"} autoComplete="cc-name" /></label>
    <label>Emissor<select id={id.current+"-issuer"} /></label>
    <div hidden><select id={id.current+"-installments"} /></div>
    <label>Tipo de documento<select id={id.current+"-identificationType"} /></label>
    <label>Documento do titular<input id={id.current+"-identificationNumber"} autoComplete="off" /></label>
    <label>E-mail do titular<input id={id.current+"-cardholderEmail"} type="email" autoComplete="email" /></label>
    <label><input type="checkbox" required /> Autorizo a assinatura e as cobranças mensais nas condições apresentadas.</label>
    {error && <p role="alert">{error}</p>}
    <button disabled={!ready || busy} type="submit">{busy ? "Confirmando…" : "Confirmar meio de pagamento"}</button>
    {!ready && !error && <p role="status">Abrindo formulário seguro…</p>}
  </form>;
}
export function MercadoPagoBilling({ org }: { org: string }) {
  const [data, setData] = useState<any>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [card, setCard] = useState<{ action: string; plan?: any } | null>(null), [confirm, setConfirm] = useState<{ action: string; plan?: any } | null>(null);
  const key = useRef(crypto.randomUUID()), lock = useRef(false), generation = useRef(0);
  const [kind, setKind] = useState("CPF"), [document, setDocument] = useState("");
  const displayError = (e: unknown) => messages[(e as Error).message] || "Não foi possível confirmar agora. Atualize a situação para conferir sua solicitação.";
  async function refresh(reconcile = false) {
    const g = generation.current;
    const value = reconcile ? await billingApi("status", { organization_id: org }) : await rpc("billing047_context", { p_org: org });
    if (g === generation.current) setData(value);
  }
  useEffect(() => { generation.current++; const g = generation.current; setData(null); void refresh(new URLSearchParams(location.search).has("retorno")).catch(e => { if (g === generation.current) setError(displayError(e)); }); return () => { generation.current++; }; }, [org]);
  const s = data?.subscription;
  useEffect(() => {
    if (!s?.operation_pending && s?.state !== "payment_pending") return;
    let count = 0, stopped = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => { if (stopped || count++ >= 8) return; try { await refresh(true); } catch {} if (!stopped) timer = setTimeout(poll, 5000); };
    timer = setTimeout(poll, 3000); return () => { stopped = true; clearTimeout(timer); };
  }, [org, s?.id, s?.operation_pending, s?.state]);
  async function command(action: string, plan?: any, token?: string) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice("Estamos confirmando sua assinatura…");
    try {
      const value = await billingApi("command", { organization_id: org, action, request_key: key.current, ...(action === "checkout" ? { trial_expected: eligible } : {}), ...(plan ? { plan_version_id: plan.version_id } : {}), ...(token ? { card_token: token } : {}) });
      setData(value); setNotice("Solicitação conferida. Veja a situação atual abaixo."); setCard(null); setConfirm(null); key.current = crypto.randomUUID();
    } catch (e) { setError(displayError(e)); setNotice(""); await refresh().catch(() => {}); }
    finally { lock.current = false; setBusy(false); }
  }
  const eligible = s?.checkout_retryable ? s.checkout_trial : data?.eligibility === "eligible";
  const checkoutNeeded = !s || s.state === "canceled" || s.checkout_retryable;
  return <section className="billing mp-billing" aria-labelledby="mp-heading">
    <h1 id="mp-heading">Sua assinatura</h1>
    <p>Planos mensais SYZIA · pagamento seguro pelo Mercado Pago.</p>
    {new URLSearchParams(location.search).has("retorno") && (!s || s.operation_pending || s.state === "payment_pending") && <p role="status">Estamos confirmando sua assinatura...</p>}
    {error && <p role="alert" className="notice error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <button disabled={busy} onClick={() => { setError(""); void refresh(true).catch(e => setError(displayError(e))); }}>Atualizar situação</button>
    {!data && <p role="status">Carregando assinatura…</p>}
    {s && <section className="ds-panel"><h2>{data.catalog.find((p: any) => p.version_id === s.plan_version_id)?.name || s.code}</h2>
      <p><strong>{labels[s.state] || "Em conferência"}</strong></p><p>{money(s.price_cents)}/mês · BRL</p>
      {s.trial_end && s.state === "trialing" && <p>{Math.max(0, Math.ceil((Date.parse(s.trial_end) - Date.now()) / 86400000))} dias restantes de trial · até {date(s.trial_end)}</p>}
      <p>Próxima cobrança: {s.next_charge ? date(s.next_charge) : "Aguardando confirmação ou renovação desativada"}</p>
      <p>Meio de pagamento: {s.method ? s.method + " · vinculado com segurança" : "Aguardando vinculação"}</p>
      {s.state === "grace_period" && <p role="alert">Não conseguimos confirmar sua cobrança. Atualize sua forma de pagamento para evitar a interrupção do serviço. Tolerância até {date(s.grace_until)}.</p>}
      {s.state === "restricted" && <p>A operação paga está restrita. Sua conta, empresa, configurações e histórico foram preservados.</p>}
      {s.cancel_confirmed && <p>A renovação foi interrompida. Acesso até {date(s.access_until)}.</p>}
      {s.cancel_requested && !s.cancel_confirmed && <p role="alert">Estamos confirmando o cancelamento com o Mercado Pago. A interrupção da renovação ainda não foi confirmada.</p>}
      {s.target_version && <p>Mudança de plano solicitada para a próxima cobrança, a partir de {date(s.target_effective_at)}. Os novos recursos dependem da confirmação financeira.</p>}
      {s.operation_pending && <p role="status">Estamos confirmando sua solicitação…</p>}
      <div className="mp-actions">
        {s.method && !s.cancel_requested && <button disabled={busy || s.operation_pending} onClick={() => { key.current = crypto.randomUUID(); setCard({ action: "method" }); }}>Atualizar meio de pagamento</button>}
        {s.method && !s.cancel_requested && <button disabled={busy || s.operation_pending} onClick={() => setConfirm({ action: "cancel" })}>Cancelar assinatura</button>}
        {s.can_resume && <button disabled={busy || s.operation_pending} onClick={() => setConfirm({ action: "resume" })}>Reativar assinatura</button>}
      </div>
    </section>}
    {data && ["verification_required", "manual_policy"].includes(data.eligibility) && !s && <form className="ds-panel" onSubmit={e => { e.preventDefault(); setBusy(true); void rpc("billing047_identify", { p_org: org, p_kind: kind, p_document: document }).then(() => { setDocument(""); return refresh(); }).catch(e => setError(displayError(e))).finally(() => setBusy(false)); }}>
      <h2>Confirme a elegibilidade do período grátis</h2><label>Tipo<select value={kind} onChange={e => setKind(e.target.value)}><option>CPF</option><option>CNPJ</option></select></label><label>Documento<input value={document} onChange={e => setDocument(e.target.value)} required maxLength={20} autoComplete="off" /></label><button disabled={busy}>Conferir dados</button>
    </form>}
    {data && <div className="mp-plans">{data.catalog.map((p: any) => <article key={p.version_id} className="ds-panel"><h2>{p.name}</h2>
      {(!s || s.state === "canceled") && eligible && <><strong>7 dias grátis</strong><p>Depois, {money(p.price_cents)}/mês</p></>}
      {(s || !eligible) && <p>{money(p.price_cents)}/mês</p>}<p>Até {p.member_limit ?? "quantidade ilimitada de"} {p.member_limit === 1 ? "membro" : "membros"}</p>
      <button disabled={busy || (s?.operation_pending && !s?.checkout_retryable) || s?.target_version || (s?.checkout_retryable && s.plan_version_id !== p.version_id) || (!checkoutNeeded && s.plan_version_id === p.version_id)} onClick={() => { key.current = crypto.randomUUID(); setError(""); if (checkoutNeeded) setCard({ action: "checkout", plan: p }); else setConfirm({ action: "change", plan: p }); }}>{s?.checkout_retryable ? "Continuar contratação " + p.name : checkoutNeeded ? "Assinar " + p.name : "Mudar para " + p.name}</button>
    </article>)}</div>}
    {data && !data.catalog.length && <p>A contratação está temporariamente indisponível.</p>}
    {confirm && <section className="ds-panel" role="region" aria-label="Confirmar alteração"><h2>Confirmar alteração</h2><p>{confirm.action === "cancel" ? "Interromper a renovação? Você mantém o acesso até o fim do período gratuito ou pago. Nenhum dado será apagado." : confirm.action === "resume" ? "Retomar a renovação mensal da assinatura, sem novo período grátis?" : `Mudar para ${confirm.plan.name} por ${money(confirm.plan.price_cents)}/mês na próxima cobrança? Não há pró-rata nem cobrança adicional agora. Os recursos são atualizados após a confirmação financeira.`}</p><button disabled={busy} onClick={() => void command(confirm.action, confirm.plan)}>Confirmar</button><button disabled={busy} onClick={() => setConfirm(null)}>Voltar</button></section>}
    {card && <section className="ds-panel"><h2>{card.action === "method" ? "Atualizar meio de pagamento" : "Confirme sua assinatura"}</h2>
      {card.plan && <><p>{card.plan.name}</p><p>Hoje: {money(eligible ? 0 : card.plan.price_cents)}</p>{eligible && <p>Primeira cobrança: {date(new Date(Date.now() + 7 * 86400000).toISOString())} (estimativa; a data final será confirmada pelo Mercado Pago)</p>}<p>Depois: {money(card.plan.price_cents)}/mês</p></>}
      <CardForm key={card.action + (card.plan?.version_id || "")} amount={card.plan?.price_cents || s?.price_cents} busy={busy} onToken={token => command(card.action, card.plan, token)} />
      <button disabled={busy} onClick={() => setCard(null)}>Voltar</button>
    </section>}
  </section>;
}
