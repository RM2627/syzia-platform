import {useEffect, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {billingApi} from './checkout-api';
import {MercadoPagoBilling} from './MercadoPago';
import {canStartCheckout, checkoutURL, confirmedDate, managementAction, modalityNames, money, subscriptionState, type CheckoutContext} from './subscription-view';
import './stripe-checkout.css';

function Icon({kind}: {kind: 'shield' | 'refresh' | 'check'}) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={kind === 'shield' ? 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6ZM8.5 12l2.5 2.5 4.5-5' : kind === 'refresh' ? 'M20 8a8 8 0 1 0 0 8M20 3v5h-5' : 'm5 12 4 4L19 6'}/>
  </svg>;
}

// Remount by organization: old snapshots, responses and command keys never cross scopes.
export function SubscriptionCheckout({org, prepared = false}: {org: string; prepared?: boolean}) {
  return <SubscriptionView key={org} org={org} prepared={prepared}/>;
}
function SubscriptionView({org, prepared}: {org: string; prepared: boolean}) {
  const [data, setData] = useState<CheckoutContext | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false), [selected, setSelected] = useState(''), [mustRefresh, setMustRefresh] = useState(false);
  const alive = useRef(true), inFlight = useRef(false), generation = useRef(0);
  const commandKey = useRef<{action: string; offer?: string; key: string} | null>(null);
  async function refresh() {
    if (inFlight.current) return;
    const n = ++generation.current; inFlight.current = true; setBusy(true); setError('');
    try {
      const selector = await billingApi('checkout', {organization_id: org});
      if (!alive.current || n !== generation.current) return;
      const status = selector.provider === 'stripe' ? await billingApi('stripe/status', {organization_id: org}) : {};
      const value = {...selector, ...status, catalog: selector.catalog, checkout_mode: selector.checkout_mode};
      if (!Array.isArray(value.catalog)) throw Error('catalog_invalid');
      if (alive.current && n === generation.current) { setData(value); setMustRefresh(false); }
    } catch {
      if (alive.current && n === generation.current) { setData(null); setMustRefresh(true); setError('Não foi possível consultar a assinatura. Atualize o status para tentar novamente.'); }
    } finally { if (alive.current && n === generation.current) { inFlight.current = false; setBusy(false); } }
  }
  useEffect(() => {
    alive.current = true; void refresh();
    return () => { alive.current = false; generation.current++; inFlight.current = false; };
  }, []);
  function redirect(value: string | null) {
    const url = checkoutURL(value);
    if (url && alive.current) window.location.assign(url);
    else setError('O endereço de checkout não pôde ser validado. Atualize o status antes de prosseguir.');
  }
  async function command(action: 'checkout' | 'cancel' | 'resume', offer?: string) {
    if (inFlight.current || !alive.current || !data || mustRefresh) return;
    if (action === 'checkout' && (!canStartCheckout(data) || !accepted || !data.catalog.some(o => o.code === offer && o.checkout_available === true))) return;
    if (action !== 'checkout' && action !== managementAction(data)) return;
    inFlight.current = true; setBusy(true); setError('');
    const prior = commandKey.current;
    if (!prior || prior.action !== action || prior.offer !== offer) commandKey.current = {action, offer, key: crypto.randomUUID()};
    try {
      const value = await billingApi('stripe/command', {organization_id: org, action, request_key: commandKey.current!.key,
        ...(action === 'checkout' ? {offer, trial_expected: data.eligibility === 'eligible', accepted} : {})});
      if (!alive.current) return;
      // SQL responses do not override the runtime-filtered catalog or checkout selector.
      setData(old => old ? {...old, ...value, catalog: old.catalog, checkout_mode: old.checkout_mode} : null);
      commandKey.current = null;
      if (action === 'checkout' && value.subscription?.checkout_url) redirect(value.subscription.checkout_url);
    } catch {
      if (alive.current) { setMustRefresh(true); setError('A operação não foi confirmada. Atualize o status antes de tentar novamente. Uma confirmação pendente não cria outra assinatura.'); }
    } finally { if (alive.current) { inFlight.current = false; setBusy(false); } }
  }

  if (data?.provider === 'mercado_pago' || (!data?.provider && data?.checkout_mode === 'internal')) return <MercadoPagoBilling key={org} org={org}/>;
  const sub = data?.subscription || null, eligible = data?.eligibility === 'eligible';
  const canStart = canStartCheckout(data) && !mustRefresh, action = managementAction(data);
  const state = subscriptionState(sub, prepared), chosen = data?.catalog.find(o => o.code === selected);
  const until = confirmedDate(sub?.access_until || null), nextCharge = confirmedDate(sub?.next_charge || null), trialEnd = confirmedDate(sub?.trial_end || null);
  const canContinue = !!sub && !mustRefresh && data?.checkout_mode === 'stripe' && data.stripe_available && data.confirmation_enabled && data.test_allowed
    && ['payment_pending', 'reconciliation'].includes(sub.state) && !!checkoutURL(sub.checkout_url);

  return <section className="stripe-checkout" aria-labelledby="stripe-title" aria-busy={busy}>
    <header className="sc-heading"><div><p className="sc-eyebrow">ADMINISTRAÇÃO</p><h1 id="stripe-title">Plano e assinatura</h1><p>Confira sua assinatura e escolha como organizar a contratação.</p></div>
      <button type="button" className="sc-button sc-secondary" onClick={() => void refresh()} disabled={busy}><Icon kind="refresh"/>Atualizar status</button></header>
    {data?.environment === 'test' && <p className="sc-notice sc-test"><span className="sc-dot"/>Ambiente de teste · Disponível apenas para organizações autorizadas.</p>}
    {error && <div role="alert" className="sc-notice sc-error"><strong>Não foi possível confirmar a operação.</strong><span>{error}</span></div>}
    {!data && !error && <div className="sc-current sc-loading" role="status">Consultando sua assinatura…</div>}
    {data && <>
      <section className="sc-current" aria-labelledby="sc-state-title">
        <div className="sc-state-copy"><p className="sc-eyebrow">ESTADO ATUAL</p><div className="sc-state-title"><h2 id="sc-state-title">{state.title}</h2><span className={'sc-status sc-status-' + state.tone}>{sub ? modalityNames[sub.offer] || 'Modalidade a confirmar' : 'Sem cobrança confirmada'}</span></div><p>{state.detail}</p></div>
        {sub && <dl className="sc-dates">
          {trialEnd && sub.state === 'trialing' && <div><dt>Término do trial</dt><dd>{trialEnd}</dd></div>}
          <div><dt>{sub.state === 'canceled' ? 'Período anterior' : 'Acesso confirmado até'}</dt><dd>{until || 'Ainda não confirmado'}</dd></div>
          <div><dt>Próxima cobrança</dt><dd>{sub.cancel_requested || sub.state === 'canceled' ? 'Sem renovação programada' : nextCharge || 'Ainda não confirmada'}</dd></div>
        </dl>}
        {sub?.pending && <p className="sc-inline-note" role="status">Há uma operação em conferência. As informações serão atualizadas após confirmação oficial.</p>}
      </section>
      {!sub && !canStart && <p role="status" className="sc-notice sc-warning">Contratação temporariamente indisponível. As modalidades abaixo são para consulta; nenhum trial ou cobrança será iniciado.</p>}
      <section className="sc-commercial" aria-labelledby="sc-product-title">
        <div className="sc-section-heading"><div><h2 id="sc-product-title">SYZIA Completa</h2><p>As mesmas funcionalidades. Escolha o período que combina com sua rotina.</p></div><span className="sc-product-note">Um produto · três modalidades</span></div>
        {!data.catalog.length && <p role="status" className="sc-notice">Não há modalidades disponíveis para exibição no momento.</p>}
        <div className="sc-offers">{data.catalog.map(o => {
          const picked = selected === o.code && !sub, current = sub?.offer === o.code;
          return <article className={'sc-offer' + (picked ? ' sc-offer-selected' : '') + (current ? ' sc-offer-current' : '')} key={o.code} aria-labelledby={'sc-offer-' + o.code}>
            <div className="sc-offer-top"><h3 id={'sc-offer-' + o.code}>{o.modality || modalityNames[o.code]}</h3>{current ? <span className="sc-badge">Modalidade do contrato</span> : !!o.saving_cents && <span className="sc-badge">Economize {Number(o.discount_percent).toLocaleString('pt-BR')}%</span>}</div>
            <p className="sc-price"><strong>{money(o.price_cents)}</strong><span>{o.interval_months === 1 ? '/mês' : o.interval_months === 12 ? '/ano' : '/6 meses'}</span></p>
            <p className="sc-equivalent">{o.interval_months > 1 ? <>Equivale a <strong>{money(o.price_cents / o.interval_months)}/mês</strong></> : 'Renovação mensal'}</p>
            <p className="sc-period">{o.interval_months === 1 ? 'Cobrança mensal integral.' : `Cobrança de ${money(o.price_cents)} integralmente a cada ${o.interval_months} meses. Não é parcelamento.`}</p>
            <p className="sc-saving">{o.saving_cents ? `${money(o.saving_cents)} de economia por período em relação ao mensal.` : 'A flexibilidade de contratar mês a mês.'}</p>
            <p className="sc-limits">{o.member_limit} membros · {o.service_limit} serviços ativos · {o.request_limit.toLocaleString('pt-BR')} solicitações/mês</p>
            {!sub ? <button className={'sc-button ' + (picked ? 'sc-primary' : 'sc-secondary')} type="button" aria-pressed={picked} aria-label={'Escolher ' + (modalityNames[o.code] || o.code).toLowerCase()} disabled={!canStart || o.checkout_available !== true || busy} onClick={() => {setSelected(o.code); setAccepted(false);}}>{picked ? <><Icon kind="check"/>Selecionado</> : 'Escolher ' + (modalityNames[o.code] || o.code).toLowerCase()}</button>
              : <p className="sc-offer-readonly">{current ? 'Modalidade vinculada a este contrato' : 'Disponível para consulta'}</p>}
          </article>;
        })}</div>
        <div className="sc-included"><h3>Incluído em todas as modalidades</h3><ul>{['Página pública e portfólio', 'Serviços e orçamentos', 'Agenda e atendimento', 'Gestão financeira e indicadores'].map(text => <li key={text}><Icon kind="check"/>{text}</li>)}</ul><p>Limites de uso informados acima. Atendimento humano compartilhado não incluído.</p></div>
      </section>
      {!sub && chosen && canStart && <section className="sc-order" aria-labelledby="sc-order-title">
        <div><p className="sc-eyebrow">SUA ESCOLHA</p><h2 id="sc-order-title">{modalityNames[chosen.code]} · {money(chosen.price_cents)} por período</h2><p>{eligible ? 'Você é elegível a sete dias gratuitos com cartão vinculado. A primeira cobrança ocorre após o trial; a data será confirmada no checkout.' : 'Sem novo período gratuito. Confira o valor e a cobrança no checkout antes de confirmar.'}</p></div>
        <label className="sc-consent"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} disabled={busy}/><span>Li as condições: renovação automática pelo valor integral do período, cartão obrigatório e sete dias gratuitos apenas quando elegível. Posso cancelar a renovação antes da próxima cobrança.</span></label>
        <button className="sc-button sc-primary" type="button" disabled={busy || !accepted || chosen.checkout_available !== true} onClick={() => void command('checkout', chosen.code)}>{busy ? 'Preparando checkout…' : 'Continuar no checkout seguro'}<span aria-hidden="true">↗</span></button>
      </section>}
      {sub && <section className="sc-management" aria-labelledby="sc-management-title"><div><h2 id="sc-management-title">Gestão da assinatura</h2><p>{sub.state === 'canceled' ? 'O contrato cancelado permanece no histórico. Uma nova assinatura não será criada por esta tela.' : 'As ações disponíveis respeitam a situação e o período deste contrato.'}</p></div>
        <div className="sc-actions">
          {canContinue && <button className="sc-button sc-primary" type="button" disabled={busy} onClick={() => redirect(sub.checkout_url)}>Continuar no checkout seguro</button>}
          {action && !mustRefresh && <button className="sc-button sc-secondary" type="button" disabled={busy} onClick={() => {if(window.confirm(action === 'resume' ? 'Reativar a renovação desta assinatura?' : 'Cancelar a renovação ao final do período confirmado?')) void command(action);}}>{action === 'resume' ? 'Reativar renovação' : 'Cancelar renovação'}</button>}
        </div>
        {!action && !canContinue && <p className="sc-inline-note">Nenhuma alteração financeira está disponível neste estado. Atualize o status ou consulte o suporte.</p>}
        <p className="sc-fine">A alteração de modalidade não está disponível para este contrato neste momento. Selecionar outra oferta não modifica uma assinatura existente.</p>
      </section>}
      {data.eligibility === 'verification_required' && !sub && <p className="sc-notice">Complete os dados do responsável em <Link to={`/painel/${org}/configuracao`}>Configuração da empresa</Link> para verificar a elegibilidade.</p>}
      <footer className="sc-security"><Icon kind="shield"/><div><h2>Contratação segura, condições claras</h2><p>Cartão informado no checkout hospedado da Stripe. Trial de sete dias somente para clientes elegíveis. Semestral e anual são cobrados integralmente por período, com renovação automática.</p><p>Acesso e datas dependem da confirmação oficial da assinatura. O retorno do checkout, sozinho, não libera acesso.</p></div></footer>
    </>}
  </section>;
}
